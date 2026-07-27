const express = require('express');
const router = express.Router();
const { getConfig, setConfig } = require('../../src/configModel');

router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;
    const numericValue = Number(value);
    
    if (isNaN(numericValue)) {
      return res.status(400).json({ error: `Value "${value}" must be numeric.` });
    }

    let field;
    if (key === 'max-retries') {
      field = 'max_retries';
    } else if (key === 'backoff-base') {
      field = 'backoff_base';
    } else {
      return res.status(400).json({ error: `Unknown configuration key "${key}". Allowed keys are "max-retries" and "backoff-base".` });
    }

    await setConfig({ [field]: numericValue });
    const updatedConfig = await getConfig();
    
    res.json(updatedConfig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
