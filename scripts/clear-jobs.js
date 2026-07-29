const { getDb, closeDb } = require('../src/db');

async function clearJobs() {
  try {
    const db = await getDb();
    const jobsCollection = db.collection('jobs');
    
    const result = await jobsCollection.deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} job(s).`);
  } catch (error) {
    console.error('Failed to clear jobs:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

clearJobs();
