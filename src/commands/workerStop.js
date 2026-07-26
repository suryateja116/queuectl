const pidManager = require('../pidManager');
const { STOP_GRACE_MS } = require('../constants');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function workerStop() {
  pidManager.cleanupStale();
  
  const workers = pidManager.listRegistered();
  if (workers.length === 0) {
    console.log('No running workers found.');
    return;
  }
  
  console.log(`Signaling ${workers.length} worker(s) to stop...`);
  
  for (const worker of workers) {
    try {
      process.kill(worker.pid, 'SIGTERM');
    } catch (err) {
      // Ignore if the process already died between steps
    }
  }
  
  const startTime = Date.now();
  let remainingWorkers = [];
  
  while (Date.now() - startTime < STOP_GRACE_MS) {
    remainingWorkers = workers.filter(w => pidManager.isAlive(w.pid));
    
    if (remainingWorkers.length === 0) {
      break;
    }
    
    await sleep(500);
  }
  
  if (remainingWorkers.length === 0) {
    console.log('All workers stopped.');
  } else {
    const lingeringPids = remainingWorkers.map(w => w.pid).join(', ');
    console.warn(`Warning: Grace period timed out. The following worker PIDs are still alive: ${lingeringPids}`);
  }
}

module.exports = workerStop;
