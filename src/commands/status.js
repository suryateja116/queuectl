const { getStatusSummary } = require('../jobModel');
const pidManager = require('../pidManager');
const { closeDb } = require('../db');

async function status() {
  try {
    const summary = await getStatusSummary();
    console.log('Job states:');
    for (const [state, count] of Object.entries(summary)) {
      console.log(`  ${state}: ${count}`);
    }

    pidManager.cleanupStale();
    const workers = pidManager.listRegistered();

    console.log(`\nActive workers: ${workers.length}`);
    for (const w of workers) {
      console.log(`  PID: ${w.pid} (started at ${w.startedAt})`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

module.exports = status;
