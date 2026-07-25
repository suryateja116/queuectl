require('dotenv').config();
const { MongoClient } = require('mongodb');

let client = null;
let dbInstance = null;

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    throw new Error('MONGODB_URI and MONGODB_DB environment variables must be defined');
  }

  client = new MongoClient(uri);
  await client.connect();
  dbInstance = client.db(dbName);

  const jobsCollection = dbInstance.collection('jobs');
  await jobsCollection.createIndex({ state: 1, next_retry_at: 1 });

  return dbInstance;
}

async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  closeDb,
};
