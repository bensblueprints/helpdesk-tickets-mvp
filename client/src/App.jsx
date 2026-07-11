import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Lock, LayoutDashboard, MessageSquareText, Users, Settings as SettingsIcon,
  Plus, Search, Tag, Clock, AlertTriangle, ThumbsUp, ThumbsDown, Send, StickyNote,
  Trash2, LogOut, ChevronLeft, Zap
} from 'lucide-react';
import { api, timeAgo, timeUntil } from './api.js';

const STATUS_COLORS = {
  open: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  solved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
};
const PRIORITY_COLORS = {
  low: 'text-zinc-400', normal: 'text-sky-400', high: 'text-amber-400', urgent: 'text-red-400'
};
const STATUSES = ['open', 'pending', 'solved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function Badge({ children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${className}`}>{children}</span>;
}

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.login(password); onLogin(); }
    catch { setError('Wrong password'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5">
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <Inbox className="w-6 h-6 text-sky-400" /> Deskly
        </div>
        <p className="text-sm text-zinc-500 text-center">The email-to-ticket helpdesk you own. Pay once, no per-agent fees.</p>
        <label className="block">
          <span className="text-xs text-zinc-400 uppercase tracking-wide">Admin password</span>
          <div className="mt-1.5 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-sky-500"
              placeholder="••••••••" />
          </div>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-zinc-950 font-medium rounded-lg py-2 transition-colors">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>
    </div>
  );
}

const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500';
const btnCls = 'bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-zinc-950 font-medium rounded-lg px-4 py-2 text-sm transition-colors';
const btn2Cls = 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm transition-colors';

function SlaBadge({ t }) {
  if (t.status === 'solved' || t.status === 'closed') return null;
  if (t.sla_first_breached || t.sla_resolve_breached) {
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30"><AlertTriangle className="w-3 h-3" /> SLA breach</Badge>;
  }
  if (!t.first_response_at && t.sla_first_due_at) {
    return <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700"><Clock className="w-3 h-3" /> reply {timeUntil(t.sla_first_due_at)}</Badge>;
  }
  return null;
}

function TicketList({ onOpen }) {
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ status: 'open', priority: '', q: '', tag: '', assignee_id: '' });
  const [agents, setAgents] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [nt, setNt] = useState({ subject: '', requester_email: '', requester_name: '', body: '', priority: 'normal' });
  const [views, setViews] = useState(() => JSON.parse(localStorage.getItem('deskly_views') || '[]'));

  const load = useCallback(() => { api.tickets(filters).then(setTickets).catch(() => {}); }, [filters]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api.agents().then(setAgents).catch(() => {}); }, []);

  const saveView = () => {
    const name = prompt('Name this view:');
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, filters }];
    setViews(next);
    localStorage.setItem('deskly_views', JSON.stringify(next));
  };

  const createTicket = async (e) => {
    e.preventDefault();
    await api.createTicket(nt);
    setShowNew(false);
    setNt({ subject: '', requester_email: '', requester_name: '', body: '', priority: 'normal' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className={`${inputCls} pl-9`} placeholder="Search subject or requester…" />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className={`${inputCls} w-auto`}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filters.assignee_id} onChange={(e) => setFilters({ ...filters, assignee_id: e.target.value })} className={`${inputCls} w-auto`}>
          <option value="">Anyone</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={saveView} className={btn2Cls}>Save view</button>
        <button onClick={() => setShowNew(true)} className={`${btnCls} flex items-center gap-1`}><Plus className="w-4 h-4" /> New ticket</button>
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <button key={v.name} onClick={() => setFilters(v.filters)}
              className="px-2.5 py-1 rounded-full text-xs bg-zinc-900 border border-zinc-800 hover:border-sky-500 transition-colors">
              {v.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800/80 overflow-hidden">
        {tickets.length === 0 && <div className="p-8 text-center text-zinc-500 text-sm">No tickets match. Inbound email and the /inbound webhook create tickets automatically.</div>}
        {tickets.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} className="w-full text-left p-4 hover:bg-zinc-800/40 transition-colors block">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-500 text-xs font-mono">#{t.id}</span>
              <span className="font-medium">{t.subject}</span>
              <Badge className={STATUS_COLORS[t.status]}>{t.status}</Badge>
              <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
              <SlaBadge t={t} />
              {t.tags.map((tag) => <Badge key={tag} className="bg-zinc-800 text-zinc-400 border-zinc-700"><Tag className="w-3 h-3" />{tag}</Badge>)}
              <span className="ml-auto text-xs text-zinc-500">{timeAgo(t.updated_at)}</span>
            </div>
            <div className="mt-1 text-sm text-zinc-500 flex items-center gap-2">
              <span className="text-zinc-400">{t.requester_name || t.requester_email}</span>
              {t.assignee && <span className="text-xs">→ {t.assignee.name}</span>}
              <span className="truncate">{t.preview}</span>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setShowNew(false)}>
            <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} onSubmit={createTicket}
              className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
              <h3 className="font-semibold">New ticket</h3>
              <input className={inputCls} placeholder="Subject" required value={nt.subject} onChange={(e) => setNt({ ...nt, subject: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Requester email" type="email" required value={nt.requester_email} onChange={(e) => setNt({ ...nt, requester_email: e.target.value })} />
                <input className={inputCls} placeholder="Requester name" value={nt.requester_name} onChange={(e) => setNt({ ...nt, requester_name: e.target.value })} />
              </div>
              <select className={inputCls} value={nt.priority} onChange={(e) => setNt({ ...nt, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <textarea className={`${inputCls} h-24`} placeholder="Message (optional)" value={nt.body} onChange={(e) => setNt({ ...nt, body: e.target.value })} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNew(false)} className={btn2Cls}>Cancel</button>
                <button className={btnCls}>Create</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TicketDetail({ id, onBack }) {
  const [t, setT] = useState(null);
  const [agents, setAgents] = useState([]);
  const [macros, setMacros] = useState([]);
  const [body, setBody] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const load = useCallback(() => { api.ticket(id).then(setT).catch(() => {}); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.agents().then(setAgents).catch(() => {});
    api.macros().then(setMacros).catch(() => {});
  }, []);

  if (!t) return <div className="text-zinc-500 text-sm">Loading…</div>;

  const patch = async (b) => { setT(await api.patchTicket(id, b)); };

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.postMessage(id, { body, is_internal_note: isNote });
      setBody(''); load();
    } finally { setBusy(false); }
  };

  const applyMacro = async (mid) => {
    if (!mid) return;
    const { body: rendered } = await api.renderMacro(mid, id);
    setBody((prev) => (prev ? prev + '\n' + rendered : rendered));
  };

  const addTag = async (e) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    await patch({ tags: [...t.tags, tagInput.trim()] });
    setTagInput('');
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ChevronLeft className="w-4 h-4" /> Back to tickets
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-500 font-mono text-sm">#{t.id}</span>
        <h2 className="text-lg font-semibold">{t.subject}</h2>
        <Badge className={STATUS_COLORS[t.status]}>{t.status}</Badge>
        <SlaBadge t={t} />
        {t.csat != null && (
          <Badge className={t.csat ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}>
            {t.csat ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />} CSAT
          </Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-3">
          <div className="space-y-3">
            {t.messages.map((m) => (
              <div key={m.id} className={`rounded-xl border p-4 ${m.is_internal_note
                ? 'bg-amber-500/5 border-amber-500/20'
                : m.direction === 'in' ? 'bg-zinc-900 border-zinc-800' : 'bg-sky-500/5 border-sky-500/20'}`}>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  {m.is_internal_note ? <StickyNote className="w-3.5 h-3.5 text-amber-400" /> : <MessageSquareText className="w-3.5 h-3.5" />}
                  <span className="text-zinc-300">{m.from_name || m.from_email || (m.direction === 'in' ? t.requester_email : 'Agent')}</span>
                  {m.is_internal_note ? <span className="text-amber-400">internal note</span> : <span>{m.direction === 'in' ? 'received' : 'replied'}</span>}
                  <span className="ml-auto">{timeAgo(m.created_at)}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={!isNote} onChange={() => setIsNote(false)} /> Public reply
              </label>
              <label className="flex items-center gap-1.5 text-sm text-amber-400">
                <input type="radio" checked={isNote} onChange={() => setIsNote(true)} /> Internal note
              </label>
              <select onChange={(e) => { applyMacro(e.target.value); e.target.value = ''; }} className={`${inputCls} w-auto ml-auto`} defaultValue="">
                <option value="" disabled>Insert macro…</option>
                {macros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${inputCls} h-28`}
              placeholder={isNote ? 'Internal note (visible to agents only, @mention teammates)…' : 'Reply to the requester…'} />
            <div className="flex justify-end">
              <button onClick={send} disabled={busy || !body.trim()} className={`${btnCls} flex items-center gap-1.5`}>
                <Send className="w-4 h-4" /> {isNote ? 'Add note' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <label className="block text-xs text-zinc-400 uppercase tracking-wide">Status
              <select value={t.status} onChange={(e) => patch({ status: e.target.value })} className={`${inputCls} mt-1`}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-xs text-zinc-400 uppercase tracking-wide">Priority
              <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} className={`${inputCls} mt-1`}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block text-xs text-zinc-400 uppercase tracking-wide">Assignee
              <select value={t.assignee_id || ''} onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null })} className={`${inputCls} mt-1`}>
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div>
              <span className="text-xs text-zinc-400 uppercase tracking-wide">Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {t.tags.map((tag) => (
                  <button key={tag} onClick={() => patch({ tags: t.tags.filter((x) => x !== tag) })}
                    className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 hover:border-red-500">
                    {tag} ×
                  </button>
                ))}
              </div>
              <form onSubmit={addTag}>
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className={`${inputCls} mt-2`} placeholder="Add tag + Enter" />
              </form>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm space-y-2">
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Requester</div>
            <div>{t.requester_name || '—'}</div>
            <div className="text-zinc-400">{t.requester_email}</div>
            <div className="text-xs text-zinc-500 pt-2 space-y-1">
              <div>Created {timeAgo(t.created_at)}</div>
              <div>First response due: {t.first_response_at ? `met (${timeAgo(t.first_response_at)})` : timeUntil(t.sla_first_due_at)}</div>
              <div>Resolution due: {t.resolved_at ? `resolved ${timeAgo(t.resolved_at)}` : timeUntil(t.sla_resolve_due_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Macros() {
  const [macros, setMacros] = useState([]);
  const [form, setForm] = useState({ id: null, name: '', body: '' });
  const load = () => api.macros().then(setMacros).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    if (form.id) await api.updateMacro(form.id, form);
    else await api.createMacro(form);
    setForm({ id: null, name: '', body: '' });
    load();
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        {macros.map((m) => (
          <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <span className="font-medium">{m.name}</span>
              <div className="ml-auto flex gap-1">
                <button onClick={() => setForm(m)} className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1">Edit</button>
                <button onClick={async () => { await api.deleteMacro(m.id); load(); }} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <pre className="mt-2 text-sm text-zinc-400 whitespace-pre-wrap font-sans">{m.body}</pre>
          </div>
        ))}
        {macros.length === 0 && <div className="text-zinc-500 text-sm">No canned responses yet.</div>}
      </div>
      <form onSubmit={save} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 h-fit">
        <h3 className="font-semibold">{form.id ? 'Edit macro' : 'New canned response'}</h3>
        <input className={inputCls} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <textarea className={`${inputCls} h-36`} required placeholder={'Hi {{customer_name}},\n\nThanks for reaching out…'} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <p className="text-xs text-zinc-500">Variables: {'{{customer_name}} {{customer_email}} {{ticket_id}} {{subject}} {{agent_name}}'}</p>
        <div className="flex gap-2 justify-end">
          {form.id && <button type="button" onClick={() => setForm({ id: null, name: '', body: '' })} className={btn2Cls}>Cancel</button>}
          <button className={btnCls}>{form.id ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}

function Agents() {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' });
  const load = () => api.agents().then(setAgents).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    await api.createAgent(form);
    setForm({ name: '', email: '', role: 'agent' });
    load();
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800/80">
        {agents.map((a) => (
          <div key={a.id} className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 grid place-items-center text-sm font-semibold">
              {a.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-sm">{a.name}</div>
              <div className="text-xs text-zinc-500">{a.email}</div>
            </div>
            <select value={a.role} onChange={async (e) => { await api.updateAgent(a.id, { role: e.target.value }); load(); }}
              className={`${inputCls} w-auto ml-auto`}>
              <option value="agent">agent</option>
              <option value="admin">admin</option>
            </select>
            <button onClick={async () => { await api.deleteAgent(a.id); load(); }} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {agents.length === 0 && <div className="p-6 text-zinc-500 text-sm">No agents yet — add your team.</div>}
      </div>
      <form onSubmit={save} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 h-fit">
        <h3 className="font-semibold">Add agent</h3>
        <input className={inputCls} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={inputCls} placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="agent">agent</option>
          <option value="admin">admin</option>
        </select>
        <div className="flex justify-end"><button className={btnCls}>Add</button></div>
      </form>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const load = () => api.stats().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  if (!stats) return <div className="text-zinc-500 text-sm">Loading…</div>;
  const fmt = (ms) => ms == null ? '—' : ms < 3600000 ? `${Math.round(ms / 60000)}m` : `${(ms / 3600000).toFixed(1)}h`;
  const csatTotal = stats.csat_good + stats.csat_bad;
  const cards = [
    { label: 'Open', value: stats.by_status.open, color: 'text-sky-400' },
    { label: 'Pending', value: stats.by_status.pending, color: 'text-amber-400' },
    { label: 'Solved', value: stats.by_status.solved, color: 'text-emerald-400' },
    { label: 'Avg first response', value: fmt(stats.avg_first_response_ms), color: 'text-zinc-200' },
    { label: 'SLA breaches', value: stats.sla_first_breaches, color: stats.sla_first_breaches ? 'text-red-400' : 'text-emerald-400' },
    { label: 'CSAT', value: csatTotal ? `${Math.round((stats.csat_good / csatTotal) * 100)}%` : '—', color: 'text-zinc-200' }
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-semibold mt-1 ${c.color}`}>{c.value}</div>
          </motion.div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Open tickets by priority</h3>
        <div className="space-y-2">
          {PRIORITIES.map((p) => {
            const n = stats.open_by_priority[p] || 0;
            const max = Math.max(1, ...Object.values(stats.open_by_priority));
            return (
              <div key={p} className="flex items-center gap-3 text-sm">
                <span className={`w-16 ${PRIORITY_COLORS[p]}`}>{p}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-zinc-400">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState('');
  useEffect(() => { api.settings().then(setS).catch(() => {}); }, []);
  if (!s) return <div className="text-zinc-500 text-sm">Loading…</div>;
  const save = async (e) => {
    e.preventDefault();
    setS(await api.saveSettings(s));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const F = ({ k, label, type = 'text', ph = '' }) => (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input type={type} className={`${inputCls} mt-1`} placeholder={ph} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </label>
  );
  return (
    <form onSubmit={save} className="max-w-3xl space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold">Inbound email → tickets</h3>
        <p className="text-xs text-zinc-500">Poll an IMAP inbox, or POST to the webhook from any forwarding service:</p>
        <code className="block text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sky-400 overflow-x-auto">
          POST {window.location.origin}/inbound/{s.inbound_token} {'{ "from_email", "subject", "body" }'}
        </code>
        <div className="grid md:grid-cols-2 gap-3">
          <F k="imap_host" label="IMAP host" ph="imap.gmail.com" />
          <F k="imap_port" label="IMAP port" ph="993" />
          <F k="imap_user" label="IMAP user" />
          <F k="imap_pass" label="IMAP password" type="password" />
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold">Outbound email (SMTP)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <F k="smtp_host" label="SMTP host" ph="smtp.resend.com" />
          <F k="smtp_port" label="SMTP port" ph="587" />
          <F k="smtp_user" label="SMTP user" />
          <F k="smtp_pass" label="SMTP password" type="password" />
          <F k="smtp_from" label="From address" ph="support@yourco.com" />
          <F k="base_url" label="Public base URL (for CSAT links)" ph="https://desk.yourco.com" />
        </div>
        <div className="flex gap-2 items-center">
          <input className={`${inputCls} w-64`} placeholder="Send test email to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button type="button" className={btn2Cls} onClick={async () => {
            try { await api.testEmail(testTo); setTestResult('Sent ✓'); }
            catch (err) { setTestResult(err.message); }
          }}>Test</button>
          {testResult && <span className="text-xs text-zinc-400">{testResult}</span>}
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold">SLA targets (minutes)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PRIORITIES.map((p) => <F key={p} k={`sla_first_${p}`} label={`First response · ${p}`} />)}
          {PRIORITIES.map((p) => <F key={p} k={`sla_resolve_${p}`} label={`Resolution · ${p}`} />)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className={btnCls}>Save settings</button>
        {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
      </div>
    </form>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [view, setView] = useState('tickets');
  const [ticketId, setTicketId] = useState(null);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const tabs = [
    { id: 'tickets', label: 'Tickets', icon: Inbox },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'macros', label: 'Macros', icon: Zap },
    { id: 'agents', label: 'Agents', icon: Users },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 font-semibold"><Inbox className="w-5 h-5 text-sky-400" /> Deskly</div>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => { setView(t.id); setTicketId(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  view === t.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </nav>
          <button onClick={async () => { await api.logout(); setAuthed(false); }}
            className="ml-auto text-zinc-500 hover:text-zinc-300 p-2"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === 'tickets' && !ticketId && <TicketList onOpen={setTicketId} />}
        {view === 'tickets' && ticketId && <TicketDetail id={ticketId} onBack={() => setTicketId(null)} />}
        {view === 'dashboard' && <Dashboard />}
        {view === 'macros' && <Macros />}
        {view === 'agents' && <Agents />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
