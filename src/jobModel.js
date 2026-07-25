const { getDb } = require('./db');
const { nextRetryDate } = require('./backoff');
const { LEASE_MS } = require('./constants');

async function getJobsCollection() {
  const db = await getDb();
  return db.collection('jobs');
}

async function enqueueJob({ id, command, max_retries }) {
  const jobs = await getJobsCollection();
  const now = new Date();

  await jobs.insertOne({
    _id: id,
    command,
    max_retries,
    state: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
    next_retry_at: now,
    locked_by: null,
    locked_at: null,
    last_error: null,
  });
}

/**
 * claimNextJob atomically claims the next available job for a worker.
 * 
 * Why this single findOneAndUpdate call is atomic across separate OS processes:
 * MongoDB's findOneAndUpdate operation is fundamentally atomic at the database 
 * engine level. It locates a document and takes a write lock on it before making 
 * modifications. Even if multiple processes or threads concurrently issue the same 
 * findOneAndUpdate command, MongoDB serializes these requests internally.
 * 
 * Why two workers can never both claim the same job:
 * The atomic update relies on the filter condition. Only one findOneAndUpdate 
 * operation can succeed in finding the document in its 'pending' or 'failed' state 
 * and modifying it in a single indivisible step. The very first worker to execute 
 * this changes the job's state to 'processing'. Once updated, the document no 
 * longer matches the filter criteria `{ state: { $in: ["pending", "failed"] } }` 
 * for subsequent queries. Thus, any other concurrent worker looking for a job 
 * will automatically skip the already-claimed job and move to the next available one.
 */
async function claimNextJob(workerId) {
  const jobs = await getJobsCollection();
  const now = new Date();

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

  return result;
}

async function markCompleted(id) {
  const jobs = await getJobsCollection();
  const now = new Date();

  await jobs.updateOne(
    { _id: id },
    {
      $set: {
        state: 'completed',
        locked_by: null,
        locked_at: null,
        updated_at: now,
      },
    }
  );
}

async function markFailed(id, { max_retries, backoffBase, errorSummary }) {
  const jobs = await getJobsCollection();
  const now = new Date();

  const job = await jobs.findOne({ _id: id });
  if (!job) return;

  const newAttempts = job.attempts + 1;
  const isDead = newAttempts >= max_retries;

  const updateDoc = {
    $set: {
      attempts: newAttempts,
      locked_by: null,
      locked_at: null,
      last_error: errorSummary,
      updated_at: now,
    },
  };

  if (isDead) {
    updateDoc.$set.state = 'dead';
    updateDoc.$set.next_retry_at = null;
  } else {
    updateDoc.$set.state = 'failed';
    updateDoc.$set.next_retry_at = nextRetryDate(newAttempts, backoffBase, now);
  }

  await jobs.updateOne({ _id: id }, updateDoc);
}

/**
 * reapExpiredLeases checks for jobs stuck in the 'processing' state and transitions them.
 * 
 * Worst-case recovery time (LEASE_MS + SWEEP_INTERVAL_MS = 20 seconds):
 * A job becomes eligible for reaping LEASE_MS (15000ms) after it was claimed (`locked_at`). 
 * The reaper runs periodically every SWEEP_INTERVAL_MS (5000ms). If a worker crashes 
 * immediately after claiming a job, and the reaper checks a fraction of a millisecond 
 * before the 15-second lease expires, it won't be caught until the next sweep 5 seconds 
 * later. Thus, the absolute worst-case time to recover an abandoned job is 15s + 5s = 20s.
 * 
 * Why a lease expiry counts as a real attempt:
 * If a job causes the worker to crash consistently (e.g. a poison pill that triggers 
 * an out-of-memory error or a segmentation fault), simply releasing the lease would 
 * result in the job being picked up repeatedly, continually crashing the worker pool in 
 * an infinite loop. By counting lease expiration as a genuine attempt, a poison pill job 
 * will eventually exceed `max_retries` and be safely relegated to the dead letter queue 
 * (state="dead").
 */
async function reapExpiredLeases({ backoffBase }) {
  const jobs = await getJobsCollection();
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() - LEASE_MS);

  const expiredJobs = await jobs.find({
    state: 'processing',
    locked_at: { $lte: expiryThreshold },
  }).toArray();

  for (const job of expiredJobs) {
    await markFailed(job._id, {
      max_retries: job.max_retries,
      backoffBase,
      errorSummary: 'worker lease expired (assumed crash)',
    });
  }
}

async function listByState(state) {
  const jobs = await getJobsCollection();
  const filter = state ? { state } : {};
  return jobs.find(filter).sort({ created_at: 1 }).toArray();
}

async function getStatusSummary() {
  const jobs = await getJobsCollection();

  const pipeline = [
    { $group: { _id: '$state', count: { $sum: 1 } } },
  ];

  const results = await jobs.aggregate(pipeline).toArray();

  const summary = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  };

  for (const row of results) {
    if (summary[row._id] !== undefined) {
      summary[row._id] = row.count;
    }
  }

  return summary;
}

async function retryDeadJob(id, { resetAttempts = true } = {}) {
  const jobs = await getJobsCollection();
  const now = new Date();

  const updateDoc = {
    $set: {
      state: 'pending',
      next_retry_at: now,
      updated_at: now,
    },
  };

  if (resetAttempts) {
    updateDoc.$set.attempts = 0;
  }

  const result = await jobs.findOneAndUpdate(
    { _id: id, state: 'dead' },
    updateDoc,
    { returnDocument: 'after' }
  );

  return result;
}

module.exports = {
  enqueueJob,
  claimNextJob,
  markCompleted,
  markFailed,
  reapExpiredLeases,
  listByState,
  getStatusSummary,
  retryDeadJob,
};
