const express = require('express');
const router = express.Router();
const { getStatusSummary } = require('../../src/jobModel');
const pidManager = require('../../src/pidManager');

router.get('/', async (req, res) => {
  try {
    const summary = await getStatusSummary();
    
    pidManager.cleanupStale();
    const workers = pidManager.listRegistered().filter(w => pidManager.isAlive(w.pid));

    res.json({ summary, workers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
