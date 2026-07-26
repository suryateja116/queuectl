# 1. Which exact line(s) prevent two workers from claiming the same job, and why is that operation atomic across separate OS processes?

The exact lines preventing two workers from claiming the same job are inside the `claimNextJob` function in `src/jobModel.js`, specifically the MongoDB `findOneAndUpdate` call:

```javascript
  const result = await jobs.findOneAndUpdate(
    {
      state: { $in: ['pending', 'failed'] },
      next_retry_at: { $lte: now },
    },
    {
      $set: {
        state: 'processing',
        locked_by: workerId,
        locked_at: now,
        updated_at: now,
      },
    },
    {
      sort: { next_retry_at: 1, created_at: 1 },
      returnDocument: 'after',
    }
  );
```

This operation is atomic across separate OS processes because it leverages the MongoDB database engine's native write locks. When a `findOneAndUpdate` query executes, MongoDB locates the matching document and exclusively locks it while applying the `$set` modification. The very first worker to win the lock atomically changes the job's `state` to `'processing'`. Once the lock is released, any concurrent workers attempting to execute the exact same query will simply skip this document because it no longer matches the filter condition `{ state: { $in: ['pending', 'failed'] } }`. 

This was verified in this project with a concurrent race test where two `claimNextJob` calls were fired simultaneously via `Promise.all` targeting the same job. The result confirmed that one worker got the job document, while the other received `null`, proving only one caller can ever win a given document.

# 2. A worker is SIGKILLed halfway through a job. Walk through, step by step, what state the job is in and how it eventually runs again. What is the worst-case delay before recovery?

If a worker is SIGKILLed mid-execution:
1. **The Job State:** The job is orphaned in the `'processing'` state because the OS instantly terminated the worker process (`src/workerProcess.js`) before it could call `markCompleted` or `markFailed`. Its `locked_by` still holds the dead worker's ID, and its `locked_at` timestamp remains frozen in the past.
2. **The Reaper Loop:** Meanwhile, remaining active workers are running the `reaperLoop` inside `src/workerProcess.js`. This loop calls `reapExpiredLeases` from `src/jobModel.js` periodically based on the `SWEEP_INTERVAL_MS` (5000ms).
3. **Lease Expiry Detection:** Inside `reapExpiredLeases`, the query filters for jobs with `state: 'processing'` where `locked_at` is older than `LEASE_MS` (15000ms). Once the orphaned job passes this 15000ms threshold, a reaper detects it.
4. **Transition via markFailed:** The reaper runs the job through `markFailed` with the error summary `"worker lease expired (assumed crash)"`. Crucially, this increments the job's `attempts` counter. Counting a lease-expiry as a real attempt rather than a free retry prevents poison-pill jobs from looping forever (as verified when repeated SIGKILL testing forced an un-processable job into the DLQ).
5. **Re-enqueuing:** If `attempts` is below `max_retries`, the job's state is switched back to `'failed'` and its `next_retry_at` is computed via `nextRetryDate()` using exponential backoff.
6. **Execution:** Once the `next_retry_at` threshold is passed, another active worker safely claims it via `claimNextJob`.

**Worst-case delay before recovery:** 20 seconds. The job must sit for `LEASE_MS` (15000ms) to officially expire, and the reaper checks every `SWEEP_INTERVAL_MS` (5000ms). If a worker crashes instantly after claiming a job and the reaper just missed the 15-second threshold by a fraction of a millisecond, it will take another 5000ms sweep cycle to recover (15000 + 5000 = 20000ms). This 20-second recovery window was verified via a real `kill -9` test on a `sleep 300` job.

# 3. Does dlq retry reset attempts? Why is that the right call?

Yes, `dlq retry` completely resets the attempts counter. In `src/commands/dlq.js`, the `dlqRetry` handler explicitly calls `retryDeadJob(id, { resetAttempts: true })`, which maps to the `$set: { attempts: 0 }` operation in `src/jobModel.js`. During testing, a dead job with `attempts=2/2` came back as `state="pending", attempts=0/2` (a full reset).

This is the right architectural call because if a job lands in the DLQ (`state="dead"`), it has exhausted its execution lifecycle and entirely failed against the current environment state. Moving it out of the DLQ implies a human operator has intervened—such as deploying a bug fix or resolving a third-party API outage. When the job is re-entered into the active queue, it deserves a "fresh start" with a full set of retries to succeed against the fixed environment. If we preserved the old attempt count, a single minor network blip during the retry attempt would instantly banish the job back to the DLQ.

# 4. What designs did you consider and reject for worker stop (cross-process signaling), and why?

During the design of the cross-terminal `queuectl worker stop` command, I considered and rejected two alternative registry mechanisms:
1. **A MongoDB-based worker registry:** Writing constant heartbeats to a `workers` collection in the database.
2. **Control Sockets:** Creating a Unix domain socket or local TCP port on each worker to accept RPC "stop" signals.

**Why they were rejected:**
A DB-based registry duplicates liveness state with massive overhead. Workers would have to constantly ping the database to prove they are alive, and we would need fragile, complex sweeper logic to clean up entries when workers abruptly crashed. A control socket adds unnecessary networking complexity and socket-file cleanup lifecycle challenges.

**Chosen Design:**
Instead, I used local PID files (`src/pidManager.js`), dropping simple JSON files into `.queuectl/workers/`. I chose this because the OS kernel itself is already the ultimate source of truth for process liveness natively via POSIX guarantees (`kill(pid, 0)`). By tracking PIDs on disk, `workerStop.js` trivially discovers active workers and sends a direct `SIGTERM` signal across boundaries. This allowed workers started in one terminal to be successfully signaled to shut down gracefully from a completely separate terminal without requiring any direct TCP connection or DB query.

# 5. If priorities were added tomorrow (high-priority jobs jump the queue), which parts of your design survive unchanged and which break?

**What survives unchanged:**
- The CLI surface structure (`src/commands/*`) remains largely unaffected, except for adding a `--priority` flag to `enqueue.js`.
- The worker dual-loop lifecycle (`src/workerProcess.js`), graceful shutdown logic, and `pidManager.js` require zero changes.
- `markCompleted`, `markFailed`, and `reapExpiredLeases` continue to function without modification because they locate jobs via exact `_id` matches and age thresholds rather than sorting order.
- The `src/backoff.js` calculations remain accurate.

**What breaks (needs modification):**
- **Schema and Enqueueing:** `enqueueJob` inside `src/jobModel.js` would need to be updated to accept and insert a `priority` integer field into the document.
- **The Atomic Claim Query:** Inside `claimNextJob`, the `sort` criteria `sort: { next_retry_at: 1, created_at: 1 }` would fail to honor the queue jump. It would need to be changed to `sort: { priority: -1, next_retry_at: 1, created_at: 1 }`.
- **Database Indexes:** The current compound index created in `src/db.js` (`{ state: 1, next_retry_at: 1 }`) would no longer cover the sort order efficiently. We would need to replace it with a new compound index like `{ state: 1, priority: -1, next_retry_at: 1, created_at: 1 }` to prevent MongoDB from performing expensive in-memory sorts or full collection scans when fetching high-priority jobs.
