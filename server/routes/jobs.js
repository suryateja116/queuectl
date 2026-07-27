const express = require('express');
const router = express.Router();
const { listByState } = require('../../src/jobModel');

router.get('/', async (req, res) => {
  try {
    const { state } = req.query;
    const jobs = await listByState(state);
    
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

module.exports = router;
