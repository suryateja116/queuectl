const { listByState, retryDeadJob } = require('../jobModel');
const { closeDb } = require('../db');

async function dlqList() {
  try {
    const jobs = await listByState('dead');
    if (jobs.length === 0) {
      console.log('No dead jobs found.');
    } else {
      console.log(`Found ${jobs.length} dead job(s):`);
      for (const j of jobs) {
        console.log(`ID: ${j._id} | Attempts: ${j.attempts}/${j.max_retries} | Error: ${j.last_error}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

async function dlqRetry(id) {
  try {
    const result = await retryDeadJob(id, { resetAttempts: true });
    if (!result) {
      console.error(`Error: No dead job found with id "${id}".`);
      process.exitCode = 1;
    } else {
      console.log(`Successfully re-enqueued dead job "${id}" and reset its attempts to 0.`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

module.exports = {
  dlqList,
  dlqRetry
};
