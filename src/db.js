// mongodb+srv:// requires a DNS SRV lookup before any connection or
// TLS handshake happens, and some networks' default DNS resolvers fail this
// lookup or interfere with the subsequent TLS handshake — forcing a known-
// good public DNS resolver sidesteps this class of failure entirely.
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config({ quiet: true });
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

  client = new MongoClient(uri, { family: 4 });
  
  let connected = false;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await client.connect();
      console.log(`Connected to MongoDB on attempt ${attempt}`);
      connected = true;
      break;
    } catch (err) {
      lastError = err;
      console.log(`MongoDB connection attempt ${attempt} failed: ${err.message}, retrying...`);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  if (!connected) {
    throw lastError;
  }
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
