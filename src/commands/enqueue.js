const { enqueueJob } = require('../jobModel');
const { getConfig } = require('../configModel');
const { closeDb } = require('../db');

async function enqueue(jsonString) {
  let payload;

  try {
    try {
      payload = JSON.parse(jsonString);
    } catch (err) {
      console.error('Error: Invalid JSON payload provided. Please check your syntax.');
      process.exitCode = 1;
      return;
    }

    if (!payload.id || !payload.command) {
      console.error('Error: Payload must include both "id" and "command" fields.');
      process.exitCode = 1;
      return;
    }

    const config = await getConfig();
    const max_retries = payload.max_retries !== undefined ? payload.max_retries : config.max_retries;

    await enqueueJob({
      id: payload.id,
      command: payload.command,
      max_retries
    });

    console.log(`Successfully enqueued job "${payload.id}" with max_retries=${max_retries}.`);
  } catch (err) {
    if (err.code === 11000) {
      console.error(`Error: A job with id "${payload ? payload.id : 'unknown'}" already exists.`);
      process.exitCode = 1;
    } else {
      console.error(`Error processing job: ${err.message}`);
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}

module.exports = enqueue;