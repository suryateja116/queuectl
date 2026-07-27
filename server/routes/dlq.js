const express = require('express');
const router = express.Router();
const { listByState, retryDeadJob } = require('../../src/jobModel');

router.get('/', async (req, res) => {
  try {
    const jobs = await listByState('dead');
    
    const mapped = jobs.map(j => ({
      id: j._id,
      command: j.command,
      state: j.state,
      attempts: j.attempts,
      max_retries: j.max_retries,
      created_at: j.created_at ? j.created_at.toISOString() : null,
      updated_at: j.updated_at ? j.updated_at.toISOString() : null
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await retryDeadJob(id, { resetAttempts: true });
    
    if (!result) {
      return res.status(404).json({ error: `No dead job found with id "${id}"` });
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
