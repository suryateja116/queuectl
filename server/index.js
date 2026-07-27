const express = require('express');
const cors = require('cors');

const statusRoutes = require('./routes/status');
const jobsRoutes = require('./routes/jobs');
const dlqRoutes = require('./routes/dlq');
const configRoutes = require('./routes/config');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/status', statusRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/dlq', dlqRoutes);
app.use('/api/config', configRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
