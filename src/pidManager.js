/**
 * Why PID files were chosen over a control socket or a MongoDB-based worker registry:
 * 
 * The OS is already the source of truth for determining "is this process alive" via 
 * `kill(pid, 0)`. A control socket or a MongoDB registry would duplicate this liveness 
 * state with no real benefit, especially since we only need simple, one-shot stop 
 * signals (SIGTERM/SIGINT) to manage workers. 
 * 
 * Using local PID files allows external tooling to easily see what's running, and 
 * avoids stale lock scenarios that typically plague database-backed registries 
 * (which require complex, constant heartbeating and sweepers to clean up 
 * abruptly crashed instances). By keeping a simple directory of JSON files locally,
 * any management CLI can trivially clean up stale entries using POSIX guarantees.
 */

const fs = require('fs');
const path = require('path');

const WORKERS_DIR = path.join(process.cwd(), '.queuectl', 'workers');

function register(workerId) {
  if (!fs.existsSync(WORKERS_DIR)) {
    fs.mkdirSync(WORKERS_DIR, { recursive: true });
  }

  const pidFile = path.join(WORKERS_DIR, `${process.pid}.json`);
  const data = {
    pid: process.pid,
    workerId,
    startedAt: new Date().toISOString()
  };

  fs.writeFileSync(pidFile, JSON.stringify(data, null, 2));
}

function unregister() {
  const pidFile = path.join(WORKERS_DIR, `${process.pid}.json`);
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch (error) {
    // Ignore errors if it's already gone
  }
}

function listRegistered() {
  if (!fs.existsSync(WORKERS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(WORKERS_DIR);
  const registered = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(WORKERS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      registered.push({ ...data, file: filePath });
    } catch (err) {
      // Skip corrupt or unparseable files
    }
  }

  return registered;
}

function isAlive(pid) {
  try {
    // POSIX standard way to check liveness without sending a real signal
    return process.kill(pid, 0);
  } catch (error) {
    return false;
  }
}

function cleanupStale() {
  const workers = listRegistered();
  for (const worker of workers) {
    if (!isAlive(worker.pid)) {
      try {
        fs.unlinkSync(worker.file);
      } catch (err) {
        // Ignore errors during deletion
      }
    }
  }
}

module.exports = {
  register,
  unregister,
  listRegistered,
  isAlive,
  cleanupStale
};
