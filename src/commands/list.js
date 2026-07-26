const { listByState } = require('../jobModel');
const { closeDb } = require('../db');

async function list({ state, json }) {
  try {
    const jobs = await listByState(state);
    
    if (json) {
      const mapped = jobs.map(j => ({
        id: j._id,
        command: j.command,
        state: j.state,
        attempts: j.attempts,
        max_retries: j.max_retries,
        created_at: j.created_at ? j.created_at.toISOString() : null,
        updated_at: j.updated_at ? j.updated_at.toISOString() : null
      }));
      process.stdout.write(JSON.stringify(mapped) + '\n');
    } else {
      if (jobs.length === 0) {
        console.log('No jobs found.');
      } else {
        for (const j of jobs) {
          console.log(`ID: ${j._id} | State: ${j.state} | Attempts: ${j.attempts}/${j.max_retries} | Cmd: ${j.command}`);
        }
      }
    }
  } catch (err) {
    if (!json) {
      console.error(`Error: ${err.message}`);
    }
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

module.exports = list;
