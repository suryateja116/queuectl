const { getDb } = require('./db');

const DEFAULT_CONFIG = {
  max_retries: 3,
  backoff_base: 2,
};

async function getConfig() {
  const db = await getDb();
  const configCollection = db.collection('config');

  const config = await configCollection.findOne({ _id: 'singleton' });

  if (!config) {
    return { ...DEFAULT_CONFIG };
  }

  const { _id, ...restConfig } = config;
  return { ...DEFAULT_CONFIG, ...restConfig };
}

async function setConfig(patch) {
  const db = await getDb();
  const configCollection = db.collection('config');

  await configCollection.updateOne(
    { _id: 'singleton' },
    { $set: patch },
    { upsert: true }
  );
}

module.exports = {
  getConfig,
  setConfig,
};
