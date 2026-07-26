const { getConfig, setConfig } = require('../configModel');
const { closeDb } = require('../db');

async function configGet() {
  try {
    const config = await getConfig();
    console.log(`Current Configuration:`);
    console.log(`max-retries: ${config.max_retries}`);
    console.log(`backoff-base: ${config.backoff_base}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

async function configSet(key, value) {
  try {
    const numericValue = Number(value);
    if (isNaN(numericValue)) {
      console.error(`Error: Value "${value}" must be numeric.`);
      process.exitCode = 1;
      return;
    }

    let field;
    if (key === 'max-retries') {
      field = 'max_retries';
    } else if (key === 'backoff-base') {
      field = 'backoff_base';
    } else {
      console.error(`Error: Unknown configuration key "${key}". Allowed keys are "max-retries" and "backoff-base".`);
      process.exitCode = 1;
      return;
    }

    await setConfig({ [field]: numericValue });
    console.log(`Successfully updated ${key} to ${numericValue}.`);
    
    const config = await getConfig();
    console.log(`New Configuration:`);
    console.log(`max-retries: ${config.max_retries}`);
    console.log(`backoff-base: ${config.backoff_base}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

module.exports = {
  configGet,
  configSet
};
