const { fork } = require('child_process');
const path = require('path');

async function workerStart({ count }) {
  const workerScript = path.join(__dirname, '..', 'workerProcess.js');
  const children = [];

  console.log(`Starting ${count} worker process(es)...`);

  for (let i = 0; i < count; i++) {
    const child = fork(workerScript, [], { stdio: 'inherit' });
    children.push(child);
  }

  const pids = children.map(c => c.pid).join(', ');
  console.log(`Spawned worker PIDs: ${pids}`);

  const forwardSignal = (signal) => {
    console.log(`\n[Parent] Received ${signal}, forwarding to workers...`);
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  await new Promise((resolve) => {
    if (count === 0) {
      return resolve();
    }

    let exitedCount = 0;
    for (const child of children) {
      child.on('exit', () => {
        exitedCount++;
        if (exitedCount === count) {
          resolve();
        }
      });
    }
  });

  console.log('All workers have exited.');
}

module.exports = workerStart;
