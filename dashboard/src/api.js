const API_BASE = 'http://localhost:4000/api';

async function fetchJson(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = 'Unknown API error';
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
    } catch (e) {
      errorMsg = response.statusText;
    }
    throw new Error(`API Error (${response.status}): ${errorMsg}`);
  }

  return response.json();
}

export function getStatus() {
  return fetchJson('/status');
}

export function getJobs(state) {
  const query = state && state !== 'all' ? `?state=${state}` : '';
  return fetchJson(`/jobs${query}`);
}

export function getDlq() {
  return fetchJson('/dlq');
}

export function retryDlqJob(id) {
  return fetchJson(`/dlq/${id}/retry`, { method: 'POST' });
}

export function getConfig() {
  return fetchJson('/config');
}

export function setConfig(key, value) {
  return fetchJson('/config', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}
