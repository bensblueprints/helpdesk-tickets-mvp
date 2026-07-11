async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  tickets: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return req(`/api/tickets${qs ? `?${qs}` : ''}`);
  },
  ticket: (id) => req(`/api/tickets/${id}`),
  createTicket: (body) => req('/api/tickets', { method: 'POST', body }),
  patchTicket: (id, body) => req(`/api/tickets/${id}`, { method: 'PATCH', body }),
  deleteTicket: (id) => req(`/api/tickets/${id}`, { method: 'DELETE' }),
  postMessage: (id, body) => req(`/api/tickets/${id}/messages`, { method: 'POST', body }),
  macros: () => req('/api/macros'),
  createMacro: (body) => req('/api/macros', { method: 'POST', body }),
  updateMacro: (id, body) => req(`/api/macros/${id}`, { method: 'PUT', body }),
  deleteMacro: (id) => req(`/api/macros/${id}`, { method: 'DELETE' }),
  renderMacro: (id, ticketId, agentId) =>
    req(`/api/macros/${id}/render?ticket_id=${ticketId}${agentId ? `&agent_id=${agentId}` : ''}`),
  agents: () => req('/api/agents'),
  createAgent: (body) => req('/api/agents', { method: 'POST', body }),
  updateAgent: (id, body) => req(`/api/agents/${id}`, { method: 'PUT', body }),
  deleteAgent: (id) => req(`/api/agents/${id}`, { method: 'DELETE' }),
  tags: () => req('/api/tags'),
  stats: () => req('/api/stats'),
  settings: () => req('/api/settings'),
  saveSettings: (body) => req('/api/settings', { method: 'PUT', body }),
  testEmail: (to) => req('/api/settings/test-email', { method: 'POST', body: { to } })
};

export function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function timeUntil(ms) {
  if (!ms) return '—';
  const s = Math.floor((ms - Date.now()) / 1000);
  if (s < 0) return 'overdue';
  if (s < 60) return `in ${s}s`;
  if (s < 3600) return `in ${Math.floor(s / 60)}m`;
  if (s < 86400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86400)}d`;
}
