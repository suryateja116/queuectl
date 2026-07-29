import React, { useState, useEffect, useCallback } from 'react';
import { getStatus, getJobs, getDlq, retryDlqJob, getConfig, setConfig } from './api';
import './App.css';

function App() {
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [config, setConfigData] = useState(null);
  const [jobStateFilter, setJobStateFilter] = useState('all');

  const [newMaxRetries, setNewMaxRetries] = useState('');
  const [newBackoffBase, setNewBackoffBase] = useState('');

  const refreshData = useCallback(async () => {
    try {
      setError(null);
      const [statusData, jobsData, dlqData, configData] = await Promise.all([
        getStatus(),
        getJobs(jobStateFilter),
        getDlq(),
        getConfig()
      ]);
      setStatus(statusData);
      setJobs(jobsData);
      setDlq(dlqData);
      setConfigData(configData);
    } catch (err) {
      setError(`Cannot reach API — is \`npm run server\` running? (${err.message})`);
    }
  }, [jobStateFilter]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const handleRetryDlq = async (id) => {
    try {
      await retryDlqJob(id);
      refreshData();
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      if (newMaxRetries) await setConfig('max-retries', newMaxRetries);
      if (newBackoffBase) await setConfig('backoff-base', newBackoffBase);
      setNewMaxRetries('');
      setNewBackoffBase('');
      refreshData();
    } catch (err) {
      alert(`Config update failed: ${err.message}`);
    }
  };

  if (error) {
    return (
      <div className="error-container">
        <h1>Dashboard Error</h1>
        <p>{error}</p>
        <button onClick={refreshData}>Retry Connection</button>
      </div>
    );
  }

  if (!status) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>queuectl Dashboard</h1>
        <button onClick={refreshData} className="refresh-btn">Manual Refresh</button>
      </header>
      <div className="dev-note">
        Note: This dashboard expects the Express API (<code>npm run server</code> from the project root) to be running on port 4000.
      </div>

      <section className="summary-section">
        <div className="stat-card">
          <h3>Active Workers</h3>
          <p className="stat-value">{status.workers.length}</p>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <p className="stat-value">{status.summary.pending || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Processing</h3>
          <p className="stat-value">{status.summary.processing || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Completed</h3>
          <p className="stat-value">{status.summary.completed || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Failed</h3>
          <p className="stat-value">{status.summary.failed || 0}</p>
        </div>
        <div className="stat-card error-card">
          <h3>Dead (DLQ)</h3>
          <p className="stat-value">{status.summary.dead || 0}</p>
        </div>
      </section>

      <section className="jobs-section">
        <header className="section-header">
          <h2>Jobs</h2>
          <select 
            value={jobStateFilter} 
            onChange={(e) => setJobStateFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All States</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="dead">Dead</option>
          </select>
        </header>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Command</th>
                <th>State</th>
                <th>Attempts</th>
                <th>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td className="monospace">{job.id}</td>
                  <td className="monospace">{job.command}</td>
                  <td><span className={`badge badge-${job.state}`}>{job.state}</span></td>
                  <td>{job.attempts} / {job.max_retries}</td>
                  <td>{new Date(job.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state">No jobs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dlq-section">
        <h2>Dead Letter Queue</h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Command</th>
                <th>Error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {dlq.map(job => (
                <tr key={job.id}>
                  <td className="monospace">{job.id}</td>
                  <td className="monospace">{job.command}</td>
                  <td className="error-text">Failed {job.attempts} times</td>
                  <td>
                    <button onClick={() => handleRetryDlq(job.id)} className="retry-btn">
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
              {dlq.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-state">DLQ is empty.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="config-section">
        <h2>Global Configuration</h2>
        <form onSubmit={handleSaveConfig} className="config-form">
          <div className="form-group">
            <label>Current max-retries: {config?.max_retries}</label>
            <input 
              type="number" 
              placeholder="New max-retries"
              value={newMaxRetries}
              onChange={e => setNewMaxRetries(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Current backoff-base: {config?.backoff_base}</label>
            <input 
              type="number" 
              placeholder="New backoff-base"
              value={newBackoffBase}
              onChange={e => setNewBackoffBase(e.target.value)}
            />
          </div>
          <button type="submit" className="save-btn">Save Configuration</button>
        </form>
      </section>
    </div>
  );
}

export default App;
