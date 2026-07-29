# queuectl

`queuectl` is a CLI-based background job queue with worker processes, automatic retries utilizing exponential backoff, and a dead letter queue, all backed by MongoDB. It enables you to easily enqueue arbitrary shell commands, scale out worker pools across multiple terminals, and reliably recover from worker crashes without losing jobs.

## Setup

- **Prerequisites**: Requires Node.js 18+ and a MongoDB connection (a MongoDB Atlas free tier cluster or a local instance).
- **Installation**:
  ```bash
  git clone <repo-url>
  cd queuectl
  npm install
  ```
- **Configuration**:
  ```bash
  cp .env.example .env
  ```
  Fill in `MONGODB_URI` and `MONGODB_DB` with your real connection values. A MongoDB Atlas free M0 cluster works perfectly. Be sure to select the "Drivers" connection option (Node.js driver) from the Atlas Connect dialog.
- **Optional**: Run `npm link` in the project root to install the `queuectl` command globally, or simply run the commands using `node bin/queuectl.js ...`

## Usage

Here are real examples of how to use every command available in the CLI:

```bash
# Enqueue a new job
queuectl enqueue '{"id": "job-1", "command": "echo hello world", "max_retries": 3}'

# Start worker processes (default count is 1)
queuectl worker start --count 2

# Stop all running worker processes gracefully (run from a separate terminal)
queuectl worker stop

# Check the current status of the queue and live workers
queuectl status

# List jobs (both options are optional)
queuectl list --state pending --json
queuectl list

# View the Dead Letter Queue (DLQ)
queuectl dlq list

# Retry a dead job
queuectl dlq retry job-1

# View global configuration
queuectl config get

# Update global configuration (e.g., max-retries or backoff-base)
queuectl config set max-retries 5
```

## Web Dashboard (bonus)

This project also includes an optional Express API and React dashboard for visually monitoring the queue. This is built on top of the exact same `src/jobModel.js` and `src/configModel.js` the CLI uses — not a separate system.

Running it requires two terminals open at the same time:

**Terminal 1** (from the project root):
```bash
npm run server
```
*(Starts the Express API on http://localhost:4000)*

**Terminal 2**:
```bash
cd dashboard
npm install   # (first time only)
npm run dev
```
*(Starts the Vite dev server, prints a URL, typically http://localhost:5173)*

Then open that URL in a browser. Both terminals must stay running the whole time the dashboard is in use.

The dashboard displays:
- Live job counts by state
- Active workers
- A filterable jobs table
- A DLQ view with one-click retry
- A config panel for max-retries and backoff-base

All of this data auto-refreshes every 3 seconds.

## Architecture

- `bin/queuectl.js`: The main CLI entry point, wired up with the `commander` library to parse arguments and route to sub-commands.
- `src/db.js`: Handles the MongoDB connection setup, caches the active client connection, and creates the required compound index on the `jobs` collection.
- `src/jobModel.js`: Encapsulates the core job logic, including the atomic `claimNextJob` operation, state transitions, and the `reapExpiredLeases` crash recovery sweep.
- `src/backoff.js`: Pure functions for calculating the exponential backoff delays.
- `src/configModel.js`: Manages fetching and patching the singleton global configuration document in the database.
- `src/pidManager.js`: Handles local OS-level process registry (PID files) allowing for cross-terminal liveness checks and graceful worker shutdowns.
- `src/workerProcess.js`: Runs as an independent OS process (forked by `worker start`), looping continuously to claim jobs, execute them securely via a subshell, and trigger the reaper.
- `src/commands/*.js`: The isolated logic handlers for the individual CLI commands.

## How job state moves

When a job is added via `enqueue`, it is inserted into the database with `state="pending"`. The `claimNextJob` function atomically flips one available job's state to `"processing"` using MongoDB's `findOneAndUpdate`. If the shell command succeeds, it is moved to `state="completed"`. If the shell command fails, the `attempts` counter increments and the job is either retried with an exponential backoff (`state="failed"` with a computed `next_retry_at`) or, if `max_retries` is exhausted, permanently moved to the Dead Letter Queue (`state="dead"`). Crash recovery is handled by a reaper that detects stale processing leases; see `DECISIONS.md` for a full walkthrough of the worst-case 20-second recovery window.

## Testing

This project was manually tested end-to-end against a real MongoDB Atlas cluster, covering all 5 core scenarios:
1. Basic completion of a job.
2. A failing job accurately retrying until it hits the DLQ.
3. Many jobs distributed across multiple workers with exactly-once execution proven via a scripted duplicate/count check.
4. SIGKILL mid-job recovery verified with a real `kill -9` on a running worker process.
5. Full state persistence and correct recovery across a complete restart of the worker pool.

Additionally, running `npm test` executes the unit tests for the backoff calculation logic.

## AI usage note

This project was built with Claude (Anthropic) as a pair-programming assistant across the whole project — including architecture design, code generation, debugging, and documentation. Every module was manually tested against a real database rather than trusted blindly. Two real bugs were found and fixed this way during development: `enqueueJob` originally failing to return its created document, and the `dotenv` package's default banner output polluting `stdout` (which would have broken the `--json` output contract). Design rationale for the five most important architectural decisions can be found in `DECISIONS.md`.

## Known limitations

- No job timeouts yet (bonus item, not implemented).
- No priority queues, scheduled jobs, or web dashboard yet (bonus items).
