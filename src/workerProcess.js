#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const { claimNextJob, markCompleted, markFailed, reapExpiredLeases } = require('./jobModel');
const { getConfig } = require('./configModel');
const pidManager = require('./pidManager');
const { SWEEP_INTERVAL_MS } = require('./constants');
const { closeDb } = require('./db');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const workerId = `worker-${process.pid}`;
let shuttingDown = false;

// 5. Unregister on exit
process.on('exit', () => {
  pidManager.unregister();
});

// 4. Listen for SIGTERM and SIGINT
function handleShutdownSignal(signal) {
  console.log(`[${workerId}] Received ${signal}, shutting down gracefully... (will finish current job)`);
  shuttingDown = true;
}

process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGINT', () => handleShutdownSignal('SIGINT'));

async function mainLoop() {
  console.log(`[${workerId}] Started main job processing loop.`);
  
  while (!shuttingDown) {
    try {
      const job = await claimNextJob(workerId);
      
      if (!job) {
        // No job claimable, sleep and poll again
        await sleep(500);
        continue;
      }
      
      console.log(`[${workerId}] Claimed job ${job._id}. Executing command: ${job.command}`);
      
      try {
        await execAsync(job.command, { shell: '/bin/bash' });
        console.log(`[${workerId}] Job ${job._id} completed successfully.`);
        await markCompleted(job._id);
      } catch (error) {
        console.log(`[${workerId}] Job ${job._id} failed. Exit code: ${error.code || 'unknown'}. Error: ${error.message.trim()}`);
        
        const config = await getConfig();
        await markFailed(job._id, {
          max_retries: job.max_retries,
          backoffBase: config.backoff_base,
          errorSummary: error.message
        });
      }
      
    } catch (err) {
      console.error(`[${workerId}] Error in main loop: ${err.message}`);
      await sleep(5000); // Sleep a bit on unexpected errors to prevent a tight crashing loop
    }
  }
  
  console.log(`[${workerId}] Exiting main loop cleanly.`);
}

async function reaperLoop() {
  console.log(`[${workerId}] Started reaper loop.`);
  
  while (!shuttingDown) {
    try {
      const config = await getConfig();
      await reapExpiredLeases({ backoffBase: config.backoff_base });
    } catch (err) {
      console.error(`[${workerId}] Error in reaper loop: ${err.message}`);
    }
    
    // Sleep for the sweep interval
    await sleep(SWEEP_INTERVAL_MS);
  }
  
  console.log(`[${workerId}] Exiting reaper loop cleanly.`);
}

async function start() {
  try {
    // 2. Register PID immediately
    pidManager.register(workerId);
    console.log(`[${workerId}] Worker registered successfully.`);
    
    // 3. Run the two independent async loops
    await Promise.all([
      mainLoop(),
      reaperLoop()
    ]);
    
    // After both loops have cleanly exited (due to shuttingDown = true)
    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error(`[${workerId}] Fatal error: ${err.message}`);
    process.exit(1);
  }
}

// Standalone script execution
start();
