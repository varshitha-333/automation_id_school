import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  School,
  Upload,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  RefreshCw,
  FileSpreadsheet,
  Globe,
  Building2,
  X,
  GraduationCap,
  BadgeCheck,
  Sparkles,
  Search,
  Filter,
  RotateCcw,
  Wand2,
  CreditCard,
  Lock,
  KeyRound,
  Cpu,
  MemoryStick,
  HardDrive,
  Users,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import './App.css';

/* ─── API helpers ─────────────────────────────────────────── */
const normalizeApiBase = (rawValue) => {
  const value = (rawValue || '').trim();
  if (!value) return '/api';
  const cleaned = value.replace(/\/+$/, '');
  return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
};

const detectApiOrigin = () => {
  // 1) explicit override always wins
  const explicit = (process.env.REACT_APP_API_URL || '').trim().replace(/\/+$/, '');
  if (explicit) {
    // user may set 'school-api-id.titussolutions.in' (no scheme) — add https.
    const withScheme = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
    return withScheme.replace(/\/api$/i, '');
  }

  // 2) DEV server.  ALWAYS return same-origin '' so that:
  //      a) CRA proxy in package.json ('http://localhost:5000') handles forwarding
  //      b) localhost vs 127.0.0.1 vs 192.168.x.x vs ::1 all work identically
  //      c) we never get the IPv6 ::1 vs IPv4 127.0.0.1 hang that prevented
  //         login from completing on Windows + Chrome.
  // Returning '' tells normalizeApiBase to fall back to '/api', which is the
  // SAME origin as the React dev server (port 3000) → CRA proxy kicks in.
  const host = (window.location.hostname || '').toLowerCase();
  const isDevPort = window.location.port === '3000';
  if (isDevPort) {
    // CRA dev server — let the proxy do its job. Works for ALL hostnames:
    // localhost, 127.0.0.1, 192.168.x.x, your LAN IP, ngrok tunnels, etc.
    return '';
  }

  // 3) Production (frontend built and served by the same host as Flask):
  //    use same-origin so HTTPS / cookies / CORS all line up automatically.
  return window.location.origin;
};

const API_ORIGIN = detectApiOrigin();
const API        = normalizeApiBase(`${API_ORIGIN}/api`);

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

/* ─── v3.2 SESSION TOKEN + STABLE CLIENT ID ───────────────────
   Every request carries:
     X-Session-Token : per-login token (rotated each login)
     X-Client-ID     : stable UUID stored permanently in localStorage
                       — same browser always sends the same value, so
                       the server can recycle our seat when we switch
                       between WiFi and mobile data instead of giving
                       us a fresh one (which would fill up the 2-seat
                       cap with our own duplicate sessions).
   ─────────────────────────────────────────────────────────── */
const SESSION_KEY = 'idcard_session_token';
const CLIENT_KEY  = 'idcard_client_id';

function getStoredToken() {
  try { return localStorage.getItem(SESSION_KEY) || ''; }
  catch (_) { return ''; }
}
function setStoredToken(tok) {
  try {
    if (tok) localStorage.setItem(SESSION_KEY, tok);
    else     localStorage.removeItem(SESSION_KEY);
  } catch (_) { /* private-mode etc — fine, in-memory only */ }
}

function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY) || '';
    if (!id) {
      // RFC4122 v4 UUID (crypto-strong when available, fallback otherwise)
      if (window.crypto && window.crypto.randomUUID) {
        id = window.crypto.randomUUID();
      } else {
        id = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch (_) {
    // localStorage blocked (private mode) — fall back to a per-tab id.
    if (!window.__idcard_client_id) {
      window.__idcard_client_id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return window.__idcard_client_id;
  }
}

// Inject session token + client_id on every outgoing request.
axios.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  const tok = getStoredToken();
  if (tok) config.headers['X-Session-Token'] = tok;
  config.headers['X-Client-ID'] = getClientId();
  return config;
});

function fmtBytes(mb) {
  if (!mb && mb !== 0) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}
function fmtPct(p) {
  if (p === undefined || p === null) return '—';
  return `${p}%`;
}

/* ─── Fallback templates ──────────────────────────────────── */
const TEMPLATE_COLORS = {
  hebron:    '#DC2626',
  redeemer:  '#4F46E5',
  priyanka:  '#0F006A',
  ab_ascent: '#224499',
};

const FALLBACK_TEMPLATES = [
  {
    key: 'hebron',
    label: 'Hebron',
    display_name: 'Hebron Mission School',
    description: 'Red layout — includes section, roll number, blood group and parent details.',
    fields: ['student_name', 'class', 'section', 'roll', 'father_name', 'mother_name', 'dob', 'address', 'mobile', 'adm_no', 'blood_group', 'session'],
    preview_url: `${API_ORIGIN}/api/templates/hebron/preview.png`,
    color: '#DC2626',
  },
  {
    key: 'redeemer',
    label: 'Redeemer',
    display_name: 'My Redeemer Mission School',
    description: 'Blue layout — includes student name, class, father name, DOB, mobile and address.',
    fields: ['student_name', 'class', 'father_name', 'dob', 'mobile', 'address', 'session'],
    preview_url: `${API_ORIGIN}/api/templates/redeemer/preview.png`,
    color: '#4F46E5',
  },
  {
    key: 'priyanka',
    label: 'Priyanka',
    display_name: 'Priyanka Dreamnest School',
    description: 'Dark blue layout — includes name, class, section, roll, parent details, DOB, address and contact.',
    fields: ['student_name', 'class', 'section', 'roll', 'father_name', 'mother_name', 'dob', 'address', 'mobile', 'session'],
    preview_url: `${API_ORIGIN}/api/templates/priyanka/preview.png`,
    color: '#0F006A',
  },
  {
    key: 'ab_ascent',
    label: 'Ab Ascent',
    display_name: 'Ab Ascent School',
    description: 'Navy blue layout — includes adm no, name, class, section, roll, parent details, DOB, address, mobile and blood group.',
    fields: ['student_name', 'class', 'section', 'roll', 'father_name', 'mother_name', 'dob', 'address', 'mobile', 'adm_no', 'blood_group', 'session'],
    preview_url: `${API_ORIGIN}/api/templates/ab_ascent/preview.png`,
    color: '#224499',
  },
];

const INITIAL_STATUS = { loaded: false, count: 0, classes: [], classCounts: {} };

/* ─── Utilities ───────────────────────────────────────────── */
const openExternalOrBlob = async (resp, fallbackName, onPreview) => {
  const contentType = (resp.headers?.['content-type'] || resp.data?.type || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const text = await resp.data.text();
    const payload = JSON.parse(text || '{}');
    if (payload.download_url) {
      if (onPreview) onPreview(payload.download_url, true);
      else window.open(payload.download_url, '_blank', 'noopener,noreferrer');
      return { external: true, payload };
    }
    throw new Error(payload.error || 'External file URL was not returned');
  }
  const blobUrl = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
  if (onPreview) { onPreview(blobUrl, false); return { external: false, blobUrl }; }
  const a = document.createElement('a');
  a.href = blobUrl; a.download = fallbackName; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { external: false, blobUrl };
};

/* ─── Toast ───────────────────────────────────────────────── */
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? 'toast-out' : ''}`}>
          <span className="toast-icon">
            {t.type === 'success' && <CheckCircle2 size={15} />}
            {t.type === 'error'   && <AlertCircle  size={15} />}
            {t.type === 'info'    && <Sparkles     size={15} />}
          </span>
          <span className="toast-copy">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

/* ─── PDF Modal ───────────────────────────────────────────── */
function PDFModal({ url, title, onClose, external }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Eye size={15} /> {title}</div>
          <div className="modal-actions">
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open full</a>
            <button className="btn btn-icon btn-secondary" onClick={onClose}><X size={15} /></button>
          </div>
        </div>
        <div className="modal-body">
          <iframe src={url} title={title} className="pdf-iframe" />
        </div>
      </div>
    </div>
  );
}

/* ─── Select ──────────────────────────────────────────────── */
function Select({ value, onChange, options, placeholder, disabled }) {
  return (
    <div className={`custom-select ${disabled ? 'disabled' : ''}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="select-arrow" />
    </div>
  );
}

/* ─── Loading dots ────────────────────────────────────────── */
function Dots() {
  return <span className="loading-dots"><span /><span /><span /></span>;
}

/* ─── Template card ───────────────────────────────────────── */
function TemplateCard({ template, chosen, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  // Re-try once if the first paint races with the backend cold-start.
  const [retryNonce, setRetryNonce] = useState(0);
  const hasUrl = Boolean(template.preview_url);
  const previewSrc = hasUrl
    ? `${template.preview_url}${template.preview_url.includes('?') ? '&' : '?'}v=${retryNonce}`
    : '';

  return (
    <button
      type="button"
      className={`template-option ${chosen ? 'chosen' : ''}`}
      onClick={() => onSelect(template.key)}
    >
      <div className="tpl-preview" style={{ background: `${template.color}18` }}>
        {hasUrl && !imgFailed ? (
          <img
            src={previewSrc}
            alt={template.display_name}
            loading="eager"
            decoding="async"
            onError={() => {
              if (retryNonce < 2) {
                // Single one-shot retry after 600 ms — covers the case
                // where the preview endpoint is still warming its PDF cache.
                setTimeout(() => setRetryNonce((n) => n + 1), 600);
              } else {
                setImgFailed(true);
              }
            }}
          />
        ) : (
          <div className="tpl-preview-fallback">
            <div className="tpl-icon" style={{ background: template.color }}>
              <CreditCard size={24} />
            </div>
            <div className="tpl-school-name">{template.display_name}</div>
          </div>
        )}
        <div className="tpl-preview-badge">{chosen ? '✓ Selected' : 'Preview'}</div>
      </div>

      <div className="tpl-info">
        <div className="tpl-name">
          {template.label}
          {chosen && (
            <span className="tpl-checkmark"><CheckCircle2 size={14} /></span>
          )}
        </div>
        <div className="tpl-school">{template.display_name}</div>
        <div className="tpl-desc">{template.description}</div>
      </div>
    </button>
  );
}

/* ─── Class card ──────────────────────────────────────────── */
function ClassCard({ cls, count, onDownload, onView, loading }) {
  const isDownloading = loading === `${cls}_dl`;
  const isViewing    = loading === `${cls}_view`;

  return (
    <div className="class-card">
      <div className="class-card-head">
        <div className="class-icon"><GraduationCap size={16} /></div>
        <div>
          <div className="class-name">Class {cls}</div>
          <div className="class-count">{count} student{count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="class-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onDownload(cls)} disabled={!!loading}>
          {isDownloading ? <><span className="btn-spinner" /> …</> : <><Download size={13} /> Save</>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => onView(cls)} disabled={!!loading}>
          {isViewing ? <><span className="btn-spinner" /> …</> : <><Eye size={13} /> View</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Skeleton ────────────────────────────────────────────── */
function TplSkeleton() {
  return (
    <div className="template-option" style={{ pointerEvents: 'none' }}>
      <div className="tpl-preview" style={{ background: '#E2E8F0' }}>
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg,#e2e8f0,#f1f5f9,#e2e8f0)', backgroundSize: '200%', animation: 'shimmer 1.4s infinite' }} />
      </div>
      <div className="tpl-info" style={{ gap: 8 }}>
        <div style={{ height: 18, width: '50%', borderRadius: 6, background: '#E2E8F0' }} />
        <div style={{ height: 13, width: '80%', borderRadius: 6, background: '#E2E8F0' }} />
      </div>
    </div>
  );
}

/* ─── Time estimator ──────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────
   LoginScreen — access-code gate.
   Locks the entire UI until /api/login returns a session token.
   The token is then stored in localStorage so a reload keeps the
   same seat (no double-counting against MAX_CONCURRENT_USERS).
   ────────────────────────────────────────────────────────── */
function LoginScreen({ onSuccess, initialSeats }) {
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [seats, setSeats]     = useState(initialSeats);

  // Poll seat availability every 5s so the user sees when a slot frees up.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      axios.get(`${API}/system/stats`).then((r) => {
        if (!cancelled) setSeats({
          active: r.data?.active_users,
          max:    r.data?.max_users,
        });
      }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const resume    = getStoredToken();
      const clientId  = getClientId();
      const { data } = await axios.post(`${API}/login`,
        { code: code.trim(),
          resume_token: resume || undefined,
          client_id:    clientId },
        { headers: { 'X-Client-ID': clientId } });
      if (data?.session_token) {
        setStoredToken(data.session_token);
        onSuccess(data);
      } else {
        setError('Login failed — no session token returned.');
      }
    } catch (err) {
      const r = err?.response;
      if (r?.status === 503 && r.data?.code === 'SEATS_FULL') {
        setError(`Server is full — ${r.data.active_users}/${r.data.max_users} users are already in. Please try again in a few minutes.`);
      } else if (r?.status === 401) {
        setError(r.data?.error || 'Invalid access code.');
      } else if (!r) {
        // No HTTP response at all — either CORS, server down, or the dreaded
        // localhost-IPv6 vs IPv4 mismatch on Windows.
        setError('Could not reach the server. If you are running locally, try http://127.0.0.1:3000 instead of http://localhost:3000, or restart `npm start`.');
      } else {
        setError(`Server error (${r.status}). ` + (r.data?.error || 'Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const full = seats && seats.max && seats.active >= seats.max;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-icon"><Lock size={26} /></div>
        <h1 className="login-title">ID Card Admin</h1>
        <p className="login-sub">Enter your access code to continue</p>

        <form onSubmit={submit} className="login-form">
          <div className="login-input-wrap">
            <KeyRound size={16} className="login-input-icon" />
            <input
              autoFocus
              type="password"
              placeholder="Access code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && (
            <div className="login-error"><AlertCircle size={14} /> {error}</div>
          )}
          <button className="btn btn-primary btn-lg login-submit"
                  type="submit" disabled={busy || !code.trim() || full}>
            {busy
              ? <><Loader2 size={14} className="spin-icon" /> Verifying…</>
              : full
                ? <><ShieldAlert size={14} /> Server full</>
                : <><CheckCircle2 size={14} /> Continue</>
            }
          </button>
        </form>

        {seats && (
          <div className={`login-seats ${full ? 'full' : ''}`}>
            <Users size={13} />
            <span><strong>{seats.active}</strong> / {seats.max} users currently active</span>
          </div>
        )}
        <div className="login-fineprint">
          Up to {seats?.max || 2} people can use this tool at once.
          <br />
          <small style={{ color: 'var(--text-3, #94A3B8)', fontSize: 11 }}>
            A seat is freed after 15 minutes of inactivity. Generated PDFs are kept on the server for 30 minutes.
          </small>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SystemMonitor — lives in the topbar. Polls /api/system/stats
   every 4 seconds. Cheap (~0.05% CPU). Shows CPU%, RAM, disk, and
   active-user count; lights up red when the server is pressured.
   ────────────────────────────────────────────────────────── */
function SystemMonitor({ stats }) {
  if (!stats) {
    return (
      <div className="sysmon-pill">
        <Loader2 size={12} className="spin-icon" />
        <span>monitoring…</span>
      </div>
    );
  }
  const level = stats.ram_level || 'ok';
  const cls   = level === 'refuse' ? 'sysmon-pill danger'
              : level === 'warn'   ? 'sysmon-pill warn'
              : 'sysmon-pill ok';
  return (
    <div className={cls} title="Live server resource usage">
      <span className="sysmon-chunk"><Cpu size={11} /> {fmtPct(stats.cpu_pct)}</span>
      <span className="sysmon-divider" />
      <span className="sysmon-chunk"><MemoryStick size={11} /> {fmtBytes(stats.ram_used_mb)} / {fmtBytes(stats.ram_total_mb)}</span>
      <span className="sysmon-divider" />
      <span className="sysmon-chunk"><HardDrive size={11} /> {fmtPct(stats.disk_pct)}</span>
      <span className="sysmon-divider" />
      <span className="sysmon-chunk"><Users size={11} /> {stats.active_users}/{stats.max_users}</span>
    </div>
  );
}

function estimateTime(count, template) {
  // Based on measured timings from backend docstring (local = ~2x faster than prod)
  // These are prod (0.5 CPU / 512 MB) estimates. Local will be faster.
  // ab_ascent/priyanka are heavier per-card renderers than hebron/redeemer
  const heavy = ['ab_ascent', 'priyanka'].includes(template);
  const secPerStudent = heavy ? 0.43 : 0.32; // prod estimate
  const secs = Math.round(count * secPerStudent);
  if (secs < 60) return `~${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem  = secs % 60;
  return rem > 0 ? `~${mins}m ${rem}s` : `~${mins}m`;
}

/* ─────────────────────────────────────────────────────────────
   MAIN APP
   ───────────────────────────────────────────────────────────── */
export default function App() {
  /* ─── v3.1: auth + live system stats ─────────────────────────────── */
  // authed=true once /api/login has issued a session token. We pre-fill
  // it from localStorage so a page reload doesn't kick us back to login.
  const [authed, setAuthed]                     = useState(!!getStoredToken());
  const [initialSeats, setInitialSeats]         = useState(null);
  const [sysStats, setSysStats]                 = useState(null);
  const sysStatsTimer = useRef(null);

  const [status, setStatus]                     = useState(INITIAL_STATUS);
  const [schools, setSchools]                   = useState([]);
  const [templates, setTemplates]               = useState(FALLBACK_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState('redeemer');
  const [templateConfirmed, setTemplateConfirmed] = useState(false);
  const [dataSource, setDataSource]             = useState('file');
  const [selectedSchool, setSelectedSchool]     = useState('');
  const [fetchingAPI, setFetchingAPI]           = useState(false);
  const [uploadingFile, setUploadingFile]       = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [dragOver, setDragOver]                 = useState(false);
  const [toasts, setToasts]                     = useState([]);
  const [cardLoading, setCardLoading]           = useState(null);
  const [modal, setModal]                       = useState(null);
  const [studentClass, setStudentClass]         = useState('');
  const [studentName, setStudentName]           = useState('');
  const [studentNames, setStudentNames]         = useState([]);
  const [studentLoading, setStudentLoading]     = useState(null);
  const [backendOk, setBackendOk]               = useState(null);
  const [activeStep, setActiveStep]             = useState(0);
  const [searchQuery, setSearchQuery]           = useState('');
  const [showAdvanced, setShowAdvanced]         = useState(false);
  const [generationDone, setGenerationDone]     = useState(false);
  const [genProgress, setGenProgress]           = useState(0);
  const [genPhase,    setGenPhase]              = useState('');
  const [genLabel,    setGenLabel]              = useState('');   // human-readable label for active job
  const [elapsedSecs, setElapsedSecs]           = useState(0);   // wall-clock seconds since job start

  const fileRef      = useRef(null);
  const toastIdRef   = useRef(0);
  const elapsedTimer = useRef(null);   // interval for wall-clock counter
  const activeJobId  = useRef(null);   // track running job so we can cancel on unmount
  const jobDoneRef   = useRef(false);  // true once server reports status=done — never DELETE then

  /* ── Toast helpers ── */
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 350);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 350);
  }, []);

  /* cleanup on unmount */
  useEffect(() => {
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      if (sysStatsTimer.current) clearInterval(sysStatsTimer.current);
      // Only cancel jobs that are still running — never delete a finished job,
      // otherwise the file gets wiped before the download can start.
      if (activeJobId.current && !jobDoneRef.current) {
        axios.delete(`${API}/jobs/${activeJobId.current}`).catch(() => {});
      }
    };
  }, []);

  /* ─── v3.1: live system-stats polling ────────────────────────────
     Polls /api/system/stats every 2 s (down from 4 s) so the topbar
     metrics tick noticeably.  /api/system/stats is OPEN — so we start
     polling BEFORE login too: that way the "Connected" pill lights up
     instantly on first paint instead of waiting for the user to type
     the access code.
     If the server says we're no longer a valid session (e.g. backend
     restarted, our token was pruned, or another tab logged out), we
     drop back to the login screen instead of failing silently. ──── */
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      axios.get(`${API}/system/stats`).then((r) => {
        if (cancelled) return;
        setSysStats(r.data);
        // /api/system/stats is open — reaching it is proof the backend
        // is alive, even before the user is logged in.
        setBackendOk(true);
      }).catch(() => {
        if (!cancelled) setBackendOk(false);
      });
    };
    tick();
    sysStatsTimer.current = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(sysStatsTimer.current); };
  }, [authed]);

  /* ─── Detect a kicked / expired session and force re-login ────────── */
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (resp) => resp,
      (err) => {
        const r = err?.response;
        if (r?.status === 401 && (r.data?.code === 'NO_SESSION' || r.data?.code === 'BAD_SESSION')) {
          setStoredToken('');
          setAuthed(false);
          setSysStats(null);
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  const handleLogout = useCallback(async () => {
    const clientId = getClientId();
    const tok      = getStoredToken();
    // Fire the request and AWAIT it so the user sees the seat-count
    // drop immediately. We also pass client_id in the body so the
    // server kills any stale seat from a previous network.
    try {
      await axios.post(`${API}/logout`,
        { client_id: clientId },
        { headers: { 'X-Client-ID': clientId, 'X-Session-Token': tok || '' },
          timeout: 8000 });
    } catch (_) { /* ignore — we still clear locally */ }
    setStoredToken('');
    setAuthed(false);
    setSysStats(null);
    setStatus(INITIAL_STATUS);
    setActiveStep(0);
    setTemplateConfirmed(false);
  }, []);

  /* v3.2: when the tab is closed / browser is killed, fire a
     sendBeacon to /api/logout so our seat is freed instantly
     instead of waiting for the 15-min idle timer. sendBeacon
     survives page-unload where axios.post would be cancelled. */
  useEffect(() => {
    const release = () => {
      try {
        const clientId = getClientId();
        const tok      = getStoredToken();
        const payload  = new Blob(
          [JSON.stringify({ client_id: clientId, session_token: tok })],
          { type: 'application/json' });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${API}/logout`, payload);
        } else {
          // Fallback for ancient browsers
          fetch(`${API}/logout`, {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'X-Client-ID': clientId,
              'X-Session-Token': tok || '',
            },
            body: JSON.stringify({ client_id: clientId }),
          }).catch(() => {});
        }
      } catch (_) { /* swallow */ }
    };
    window.addEventListener('pagehide', release);
    window.addEventListener('beforeunload', release);
    return () => {
      window.removeEventListener('pagehide', release);
      window.removeEventListener('beforeunload', release);
    };
  }, []);

  /* ── Derived ── */
  const activeTemplate = useMemo(() =>
    templates.find((t) => t.key === selectedTemplate) || templates[0] || FALLBACK_TEMPLATES[0],
    [templates, selectedTemplate]);

  const withTemplate = useCallback((baseUrl, extra = {}) => {
    const params = new URLSearchParams({ ...extra, template: selectedTemplate });
    return `${baseUrl}?${params.toString()}`;
  }, [selectedTemplate]);

  const totalClasses    = (status.classes || []).length;
  const classOptions    = (status.classes || []).map((c) => ({ value: c, label: `Class ${c}` }));
  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? (status.classes || []).filter((c) => String(c).toLowerCase().includes(q)) : (status.classes || []);
  }, [searchQuery, status.classes]);

  /* ── Elapsed timer helpers ── */
  const startElapsed = useCallback(() => {
    setElapsedSecs(0);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setElapsedSecs((s) => s + 1), 1000);
  }, []);

  const stopElapsed = useCallback(() => {
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
  }, []);

  const fmtElapsed = (s) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  /* ── Progress label ── */
  const phaseMap = {
    queued:      'Queued…',
    prefetch:    'Fetching student photos',
    render:      'Rendering ID cards',
    writing:     'Compacting PDF',
    downloading: 'Downloading',
    done:        'Done',
    error:       'Error',
  };

  const generationProgressLabel = (() => {
    if (!cardLoading && !studentLoading) return '';
    const phaseStr = phaseMap[genPhase] || genPhase || '';
    const pctStr   = genProgress > 0 ? ` — ${genProgress}%` : '';
    const elapsed  = elapsedSecs > 0 ? ` (${fmtElapsed(elapsedSecs)})` : '';
    if (genLabel) return `${genLabel}${phaseStr ? ` · ${phaseStr}` : ''}${pctStr}${elapsed}`;
    if (studentLoading === 'download') return `Generating individual card${elapsed}`;
    if (studentLoading === 'view')     return `Preparing preview${elapsed}`;
    return `${phaseStr}${pctStr}${elapsed}`;
  })();

  /* ── Boot ── */
  const refreshStatus = useCallback(() => {
    axios.get(`${API}/status`).then((r) => {
      setBackendOk(true);
      if (r.data && r.data.loaded) {
        setStatus({
          ...INITIAL_STATUS,
          ...r.data,
          classCounts: r.data?.classCounts || r.data?.class_counts || {},
        });
      }
    }).catch((err) => {
      // 401 just means we're not logged in yet — that's NOT "offline".
      // Only treat real network/5xx failures as offline so the pill
      // doesn't flicker red while the user is typing the access code.
      const st = err?.response?.status;
      if (!st || st >= 500) setBackendOk(false);
    });
  }, []);

  // Removed the 60-second fixed ping interval — it was causing
  // a React state update mid-download that triggered cleanup/DELETE
  // on the active job before the file could be fetched.

  /* ─── Session timing constants (mirror /api/system/stats) ──────── */
  // These are shown to the user in the topbar so they know:
  //   • idle seat timeout: 15 min (server kicks idle tabs to free a seat)
  //   • finished-job retention: 30 min (PDF on disk auto-purged after this)
  //   • slot wait: 3 min (max time we wait for a render slot when busy)
  const TIMINGS = {
    SESSION_TTL_MIN:        15,   // seat freed after this many minutes idle
    JOB_FILE_TTL_MIN:       30,   // a generated PDF stays on disk this long
    PDF_SLOT_WAIT_S:        180,  // wait up to 3 min for a render slot
    POLL_INTERVAL_MS:       700,
    POLL_MAX_BLIPS:         200,  // ~140 s of connection blips tolerated
  };

  /*  Initial boot:
      /api/templates is OPEN (no auth needed) so we load the carousel
      IMMEDIATELY on first paint — the template thumbnails show before
      the user even logs in, instead of being stuck on "loading…".
      /api/status + /api/schools/students depend on `authed` and re-fire
      the moment login succeeds. ────────────────────────────────── */
  useEffect(() => {
    setLoadingTemplates(true);
    axios.get(`${API}/templates`).then((r) => {
      const raw = Array.isArray(r.data) && r.data.length ? r.data : FALLBACK_TEMPLATES;
      const list = raw.map((t) => ({
        ...t,
        color: t.color || TEMPLATE_COLORS[t.key] || '#4F46E5',
        preview_url: t.preview_url
          ? (t.preview_url.startsWith('http') ? t.preview_url : `${API_ORIGIN}${t.preview_url.startsWith('/') ? '' : '/'}${t.preview_url}`)
          : `${API_ORIGIN}/api/templates/${t.key}/preview.png`,
      }));
      setTemplates(list);
      setSelectedTemplate((prev) => list.some((t) => t.key === prev) ? prev : list[0]?.key || 'redeemer');
    }).catch(() => setTemplates(FALLBACK_TEMPLATES)).finally(() => setLoadingTemplates(false));
  }, []);

  // Once the user is authed, refresh status + load schools.  These are
  // session-gated so doing them before login would just return 401 and
  // make the UI feel broken.
  useEffect(() => {
    if (!authed) return;
    refreshStatus();
    axios.get(`${API}/schools`).then((r) => setSchools(r.data || [])).catch(() => {});
  }, [authed, refreshStatus]);

  useEffect(() => {
    if (!studentClass) { setStudentNames([]); setStudentName(''); return; }
    axios.get(`${API}/students?class=${encodeURIComponent(studentClass)}`)
      .then((r) => setStudentNames(r.data.map((s) => s.student_name).filter(Boolean)))
      .catch(() => setStudentNames([]));
  }, [studentClass]);

  /* ── Data loading ── */
  const handleSuccessfulLoad = useCallback((data, sourceLabel, schoolName) => {
    const counts = {};
    (data.classes || []).forEach((c) => { counts[c.class] = c.count; });
    setStatus({
      loaded: true, count: data.count,
      classes: (data.classes || []).map((c) => c.class),
      classCounts: counts, session: data.session,
      source: sourceLabel, school: schoolName, school_name: schoolName,
    });
    setStudentClass(''); setStudentName(''); setStudentNames([]);
    setSearchQuery(''); setShowAdvanced(false); setActiveStep(2); setGenerationDone(false);
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { addToast('Please upload an Excel or CSV file', 'error'); return; }
    setUploadingFile(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/upload`, fd);
      handleSuccessfulLoad(data, 'file', 'Uploaded File');
      addToast(`Imported ${data.count} students across ${(data.classes || []).length} classes`, 'success', 5000);
    } catch (err) {
      addToast(err.response?.data?.error || 'Upload failed', 'error');
    } finally { setUploadingFile(false); }
  };

  const fetchFromAPI = async () => {
    if (!selectedSchool) { addToast('Please select a school first', 'error'); return; }
    setFetchingAPI(true);
    try {
      const { data } = await axios.get(`${API}/fetch-school/${selectedSchool}`);
      handleSuccessfulLoad(data, 'api', data.school);
      addToast(`Fetched ${data.count} students from ${data.school}`, 'success', 5000);
    } catch (err) {
      addToast(err.response?.data?.error || 'API fetch failed', 'error');
    } finally { setFetchingAPI(false); }
  };

  /* ── PDF actions ── */
  const registerDone = useCallback(() => setGenerationDone(true), []);

  /**
   * downloadPDF — uses the /api/jobs/* async flow.
   *
   * FIX 1: No hard timeout on the poll loop — we rely only on the backend
   *         to complete or error. Frontend just waits.
   * FIX 2: Consecutive-error threshold raised from 40 to 90 (63 seconds of
   *         blips at 700ms poll interval) before giving up.
   * FIX 3: File download uses a 30-min axios timeout (was 15).
   * FIX 4: Wall-clock elapsed counter shown to the user.
   * FIX 5: We guard against double-click re-entry with activeJobId ref.
   */
  const downloadPDF = async (cls = null) => {
    // prevent double-click while a job is running
    if (cardLoading) return;

    const key   = cls ? `${cls}_dl` : 'all_dl';
    const count = cls ? (status.classCounts?.[cls] ?? 0) : (status.count ?? 0);
    const label = cls ? `Class ${cls}` : 'All students';

    setCardLoading(key);
    setGenProgress(0);
    setGenPhase('queued');
    setGenLabel(label);
    startElapsed();

    let jobId     = null;
    let pollTimer = null;

    try {
      // 1) Start the background job
      const startUrl = cls
        ? `${API}/jobs/start?class=${encodeURIComponent(cls)}&template=${encodeURIComponent(selectedTemplate)}`
        : `${API}/jobs/start?template=${encodeURIComponent(selectedTemplate)}`;

      jobDoneRef.current = false;

      let startResp;
      try {
        startResp = await axios.post(startUrl, null);
      } catch (e) {
        // Some hosts block POST on non-form endpoints — fall back to GET
        startResp = await axios.get(startUrl);
      }

      const startData = startResp.data || {};
      if (startData.error) throw new Error(startData.error);
      jobId = startData.job_id;
      activeJobId.current = jobId;

      const fname = startData.download_name ||
                    (cls ? `ids_${selectedTemplate}_${cls}.pdf` : `ids_${selectedTemplate}_ALL.pdf`);

      // 2) Poll progress — NO hard timeout. Wait as long as the server needs.
      //    Only bail if we see a long run of consecutive network errors.
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 200; // ~140s of blips at 700ms intervals

      await new Promise((resolve, reject) => {
        pollTimer = window.setInterval(async () => {
          try {
            const { data } = await axios.get(
              `${API}/jobs/${jobId}/progress`,
            );
            consecutiveErrors = 0;
            setGenProgress(Math.min(99, Math.round(data.progress || 0)));
            setGenPhase(data.phase || '');

            if (data.status === 'done') {
              jobDoneRef.current = true;
              window.clearInterval(pollTimer);
              pollTimer = null;
              resolve();
            }
            if (data.status === 'error') {
              window.clearInterval(pollTimer);
              pollTimer = null;
              reject(new Error(data.error || 'PDF generation failed on server'));
            }
          } catch {
            consecutiveErrors += 1;
            if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
              window.clearInterval(pollTimer);
              pollTimer = null;
              reject(new Error(
                'Lost connection to server for >2 minutes while waiting. ' +
                'The PDF may still be generating — please check back or retry.'
              ));
            }
          }
        }, 700);
      });

      // 3) Download the finished file.
      //    NOTE: the backend may delete the disk file inside @after_this_request
      //    as soon as the HTTP stream finishes. If the laptop's Wi-Fi flaps,
            //    the browser retries with `Range:` and gets 410 FILE_GONE.
      //    We now retry up to 4 times — and on FILE_GONE we re-start the job
      //    (free of charge — the data is already in session) so the user
      //    never sees a "network error" on big PDFs.
      setGenPhase('downloading');
      const downloadOnce = async (id) => axios.get(`${API}/jobs/${id}/file`, {
        responseType: 'blob',
        timeout: 30 * 60 * 1000,
        // Prevent Chrome from caching the partial body — kills the Range-retry
        // path that was causing "network error" on slow Wi-Fi.
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });

      let resp = null;
      let currentJobId = jobId;
      const MAX_ATTEMPTS = 4;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          resp = await downloadOnce(currentJobId);
          break;
        } catch (e) {
          const sc = e?.response?.status;
          // 410 FILE_GONE = backend already deleted the file (the @after_this_request
          // cleanup ran on the SERVER even though the BROWSER lost the bytes).
          // Rebuild the PDF by starting a fresh job for the same selection.
          if (sc === 410 && attempt < MAX_ATTEMPTS) {
            try {
              const re = await axios.post(startUrl, null);
              const reData = re.data || {};
              if (reData.job_id) {
                currentJobId = reData.job_id;
                activeJobId.current = currentJobId;
                jobDoneRef.current = false;
                // poll the rebuilt job until done
                await new Promise((resolve, reject) => {
                  const t = window.setInterval(async () => {
                    try {
                      const { data } = await axios.get(`${API}/jobs/${currentJobId}/progress`);
                      setGenProgress(Math.min(99, Math.round(data.progress || 0)));
                      setGenPhase(data.phase || '');
                      if (data.status === 'done')  { jobDoneRef.current = true; window.clearInterval(t); resolve(); }
                      if (data.status === 'error') { window.clearInterval(t); reject(new Error(data.error || 'Rebuild failed')); }
                    } catch {}
                  }, 700);
                });
                setGenPhase('downloading');
                continue;
              }
            } catch (_) { /* fall through to normal retry */ }
          }
          // Transient gateway / network blip — wait + retry
          if (attempt < MAX_ATTEMPTS && (!sc || sc === 502 || sc === 503 || sc === 504 || sc === 0)) {
            await new Promise((r) => setTimeout(r, 1500 + attempt * 1000));
            continue;
          }
          throw e;
        }
      }

      setGenProgress(100);
      await openExternalOrBlob(resp, fname);
      activeJobId.current = null;
      registerDone();
      stopElapsed();
      addToast(`PDF downloaded (${fmtElapsed(elapsedSecs)})`, 'success');
    } catch (err) {
      console.error('downloadPDF error:', err?.response?.status, err?.response?.data, err?.message);
      let msg = err?.response?.data?.error || err?.message || 'Download failed';
      if (!err?.response && /network|failed|timeout/i.test(err?.message || '')) {
        msg = `${msg} — The server may still be working. Wait and try again.`;
      }
      addToast(msg, 'error', 8000);
      // Only cancel on server if the job never completed — if it's done the
      // file endpoint handles its own cleanup after streaming.
      if (jobId && !jobDoneRef.current) {
        axios.delete(`${API}/jobs/${jobId}`).catch(() => {});
        activeJobId.current = null;
      }
    } finally {
      if (pollTimer) window.clearInterval(pollTimer);
      setCardLoading(null);
      setGenProgress(0);
      setGenPhase('');
      setGenLabel('');
      stopElapsed();
    }
  };

  /**
   * viewPDF — uses jobs API for large batches too (avoids the old 5-min
   * streaming timeout that was causing the "error" on 488 students).
   * For previews we still use the direct /api/preview/all route but cap
   * at 100 students.  For viewing a specific class, if the class is small
   * (<= 50 students) we use direct preview; otherwise jobs flow.
   */
  const viewPDF = async (cls = null) => {
    const key   = cls ? `${cls}_view` : 'all_view';
    const count = cls ? (status.classCounts?.[cls] ?? 0) : (status.count ?? 0);

    setCardLoading(key);
    setGenProgress(0);
    setGenPhase('queued');
    setGenLabel(cls ? `Preview Class ${cls}` : 'Preview all');
    startElapsed();

    try {
      // For large classes / all-students, use the jobs flow to avoid timeout
      const useJobsFlow = count > 50;

      if (useJobsFlow) {
        // Kick off job
        const startUrl = cls
          ? `${API}/jobs/start?class=${encodeURIComponent(cls)}&template=${encodeURIComponent(selectedTemplate)}`
          : `${API}/jobs/start?template=${encodeURIComponent(selectedTemplate)}`;

        let startResp;
        try {
          startResp = await axios.post(startUrl, null);
        } catch {
          startResp = await axios.get(startUrl);
        }

        const startData = startResp.data || {};
        if (startData.error) throw new Error(startData.error);
        const jobId = startData.job_id;
        activeJobId.current = jobId;
        jobDoneRef.current = false;

        // Poll
        let consecutiveErrors = 0;
        await new Promise((resolve, reject) => {
          const t = window.setInterval(async () => {
            try {
              const { data } = await axios.get(`${API}/jobs/${jobId}/progress`);
              consecutiveErrors = 0;
              setGenProgress(Math.min(99, Math.round(data.progress || 0)));
              setGenPhase(data.phase || '');
              if (data.status === 'done')  { jobDoneRef.current = true; window.clearInterval(t); resolve(); }
              if (data.status === 'error') { window.clearInterval(t); reject(new Error(data.error || 'PDF generation failed')); }
            } catch {
              consecutiveErrors += 1;
              if (consecutiveErrors > 200) { window.clearInterval(t); reject(new Error('Connection lost while polling')); }
            }
          }, 700);
        });

        setGenPhase('downloading');
        const resp = await axios.get(`${API}/jobs/${jobId}/file`, {
          responseType: 'blob',
          timeout: 30 * 60 * 1000,
        });
        setGenProgress(100);
        await openExternalOrBlob(resp, 'preview.pdf', (u, ext) => {
          setModal({ url: u, title: cls ? `Class ${cls} — Preview` : 'All Students — Preview', external: ext });
        });
        activeJobId.current = null;
        registerDone();
      } else {
        // Small class — direct streaming route is fine
        const url = cls
          ? withTemplate(`${API}/preview/all`, { class: cls })
          : withTemplate(`${API}/preview/all`);
        const resp = await axios.get(url, {
          responseType: 'blob',
          timeout: 10 * 60 * 1000,   // 10-min — generous for small classes
        });
        await openExternalOrBlob(resp, 'preview.pdf', (u, ext) => {
          setModal({ url: u, title: cls ? `Class ${cls} — Preview` : 'All Students — Preview', external: ext });
        });
        registerDone();
      }
    } catch (err) {
      addToast(err?.response?.data?.error || err?.message || 'Preview failed', 'error', 6000);
    } finally {
      setCardLoading(null);
      setGenProgress(0);
      setGenPhase('');
      setGenLabel('');
      stopElapsed();
    }
  };

  const viewStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student', 'error'); return; }
    setStudentLoading('view');
    startElapsed();
    try {
      const resp = await axios.get(
        withTemplate(`${API}/preview/student`, { class: studentClass, name: studentName }),
        { responseType: 'blob', timeout: 10 * 60 * 1000 },
      );
      await openExternalOrBlob(resp, 'preview_student.pdf', (u, ext) =>
        setModal({ url: u, title: `${studentName} — Preview`, external: ext }));
      registerDone();
    } catch (err) {
      addToast(err.response?.data?.error || 'Preview failed', 'error');
    } finally { setStudentLoading(null); stopElapsed(); }
  };

  const downloadStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student', 'error'); return; }
    setStudentLoading('download');
    startElapsed();
    try {
      const resp = await axios.get(
        withTemplate(`${API}/download/student`, { class: studentClass, name: studentName }),
        { responseType: 'blob', timeout: 10 * 60 * 1000 },
      );
      const result = await openExternalOrBlob(resp, `id_${selectedTemplate}_${studentName.replace(/\s+/g, '_')}.pdf`);
      registerDone();
      addToast(result.external ? 'Card opened from cloud storage' : 'Card downloaded', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Download failed', 'error');
    } finally { setStudentLoading(null); stopElapsed(); }
  };

  const closeModal = () => {
    if (modal?.url && !modal?.external && modal.url.startsWith('blob:')) URL.revokeObjectURL(modal.url);
    setModal(null);
  };

  const confirmTemplate = () => {
    setTemplateConfirmed(true);
    setActiveStep(1);
    addToast(`Template set: ${activeTemplate?.label}`, 'success');
  };

  const resetWorkflow = () => {
    // cancel any running job
    if (activeJobId.current) {
      axios.delete(`${API}/jobs/${activeJobId.current}`).catch(() => {});
      activeJobId.current = null;
    }
    stopElapsed();
    setStatus(INITIAL_STATUS); setTemplateConfirmed(false); setSelectedSchool('');
    setDataSource('file'); setStudentClass(''); setStudentName(''); setStudentNames([]);
    setSearchQuery(''); setShowAdvanced(false); setGenerationDone(false); setActiveStep(0);
    setCardLoading(null); setGenProgress(0); setGenPhase(''); setGenLabel('');
    addToast('Workflow reset', 'info');
  };

  /* ─── Step completion logic ─── */
  const step1Done = templateConfirmed;
  const step2Done = status.loaded;
  const step3Done = generationDone;

  const canGoStep = (i) => {
    if (i === 0) return true;
    if (i === 1) return step1Done;
    if (i === 2) return step2Done;
    return false;
  };

  /* ─────────────────────────────────────────────────────────
     RENDER
     ───────────────────────────────────────────────────────── */
  // v3.1: gate the whole UI behind the access-code login.
  if (!authed) {
    return (
      <LoginScreen
        initialSeats={initialSeats}
        onSuccess={(data) => {
          setInitialSeats({ active: data.active_users, max: data.max_users });
          setAuthed(true);
        }}
      />
    );
  }

  const ramRefuse = sysStats?.ram_level === 'refuse' || sysStats?.refuse_new_jobs;
  const ramWarn   = sysStats?.ram_level === 'warn';

  return (
    <div className="app-shell">
      <Toast toasts={toasts} removeToast={removeToast} />
      {modal && <PDFModal url={modal.url} title={modal.title} external={modal.external} onClose={closeModal} />}

      {/* ── v3.1: red banner when server is memory-pressured ── */}
      {ramRefuse && (
        <div className="server-banner danger">
          <ShieldAlert size={16} />
          <div>
            <strong>Server memory pressured ({fmtBytes(sysStats.ram_used_mb)} / {fmtBytes(sysStats.ram_total_mb)})</strong>
            <span> — New PDF jobs are temporarily blocked. Please wait a minute and retry.</span>
          </div>
        </div>
      )}
      {!ramRefuse && ramWarn && (
        <div className="server-banner warn">
          <AlertCircle size={14} />
          <span>Server memory is getting high ({fmtBytes(sysStats.ram_used_mb)} / {fmtBytes(sysStats.ram_total_mb)}). Big jobs may slow down.</span>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-icon"><School size={18} /></div>
          ID Card Generator
        </div>
        <div className="topbar-right">
          <SystemMonitor stats={sysStats} />
          <div className={`backend-pill ${backendOk === true ? 'ok' : backendOk === false ? 'err' : ''}`}>
            {backendOk === true  && <><span className="status-dot" /> Connected</>}
            {backendOk === false && <><AlertCircle size={13} /> Offline</>}
            {backendOk === null  && <><span className="status-dot pulse" /> Checking…</>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetWorkflow}><RotateCcw size={14} /> Reset</button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out"><LogOut size={14} /> Logout</button>
        </div>
      </header>

      {/* ── Wizard outer ── */}
      <div className="wizard-outer">

        {/* ── Step progress track ── */}
        <div className="step-track">
          {['Select Template', 'Load Data', 'Generate'].map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && (
                <div className="step-connector">
                  <div className="step-connector-fill" style={{ width: (i === 1 ? step1Done : step1Done && step2Done) ? '100%' : '0%' }} />
                </div>
              )}
              <button
                className={`step-node ${activeStep === i ? 'active' : ''} ${[step1Done, step2Done, step3Done][i] ? 'done' : ''}`}
                onClick={() => canGoStep(i) && setActiveStep(i)}
                disabled={!canGoStep(i)}
              >
                <div className="step-bubble">
                  {[step1Done, step2Done, step3Done][i] ? <CheckCircle2 size={16} /> : i + 1}
                </div>
                <span className="step-label">{label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* ═══════════════════════════════════════════
            STEP 1 — SELECT TEMPLATE
            ═══════════════════════════════════════════ */}
        {activeStep === 0 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${step1Done ? 'done' : ''}`}>01</div>
                <div>
                  <div className="wizard-card-title">Choose a card layout</div>
                  <div className="wizard-card-subtitle">Pick the design for your school's ID cards</div>
                </div>
              </div>
              {step1Done && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Done</span>}
            </div>

            <div className="wizard-card-body">
              <div className="template-scroll">
                {loadingTemplates
                  ? [0, 1].map((i) => <TplSkeleton key={i} />)
                  : templates.map((t) => (
                    <TemplateCard
                      key={t.key}
                      template={t}
                      chosen={selectedTemplate === t.key}
                      onSelect={setSelectedTemplate}
                    />
                  ))}
              </div>
            </div>

            <div className="wizard-card-footer">
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Selected: <strong>{activeTemplate?.label || '—'}</strong>
              </span>
              <button className="btn btn-primary btn-lg" onClick={confirmTemplate} disabled={!selectedTemplate}>
                Continue with {activeTemplate?.label || 'template'} →
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 2 — LOAD DATA
            ═══════════════════════════════════════════ */}
        {activeStep === 1 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${step2Done ? 'done' : ''}`}>02</div>
                <div>
                  <div className="wizard-card-title">Load student data</div>
                  <div className="wizard-card-subtitle">Upload a spreadsheet or connect to a live school API</div>
                </div>
              </div>
              {step2Done && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> {status.count} students loaded</span>}
            </div>

            <div className="wizard-card-body">
              {/* Source tabs */}
              <div className="source-tabs">
                <button className={`source-tab ${dataSource === 'file' ? 'active' : ''}`} onClick={() => setDataSource('file')}>
                  <FileSpreadsheet size={14} /> Upload file
                </button>
                <button className={`source-tab ${dataSource === 'api' ? 'active' : ''}`} onClick={() => setDataSource('api')}>
                  <Globe size={14} /> Live API
                </button>
              </div>

              {/* File upload */}
              {dataSource === 'file' && (
                <div
                  className={`dropzone ${dragOver ? 'drag-over' : ''} ${uploadingFile ? 'uploading' : ''}`}
                  onClick={() => !uploadingFile && fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleFile(e.target.files[0])} />
                  {uploadingFile ? (
                    <>
                      <Loader2 size={32} className="spin-icon" style={{ color: 'var(--primary)' }} />
                      <div className="dropzone-title">Parsing student data<Dots /></div>
                      <div className="dropzone-sub">Grouping classes and preparing records…</div>
                    </>
                  ) : (
                    <>
                      <div className="dropzone-icon"><Upload size={22} /></div>
                      <div className="dropzone-title">Drop your spreadsheet here</div>
                      <div className="dropzone-sub">Excel (.xlsx, .xls) or CSV — click to browse</div>
                    </>
                  )}
                </div>
              )}

              {/* API fetch */}
              {dataSource === 'api' && (
                <div className="api-panel">
                  <div className="api-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">School</label>
                      <div className="custom-select">
                        <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
                          <option value="">Choose a school…</option>
                          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                      </div>
                    </div>
                    <button className="btn btn-primary btn-lg" onClick={fetchFromAPI} disabled={fetchingAPI || !selectedSchool} style={{ alignSelf: 'flex-end' }}>
                      {fetchingAPI ? <><span className="btn-spinner" /> Fetching<Dots /></> : <><RefreshCw size={14} /> Load students</>}
                    </button>
                  </div>
                  <div className="api-hint"><Building2 size={13} /> Pulls live student data for the selected school</div>
                </div>
              )}

              {/* Loaded success */}
              {status.loaded && (
                <div className="load-success">
                  <div className="load-success-icon"><CheckCircle2 size={18} /></div>
                  <div>
                    <strong>{status.count} students loaded</strong>
                    <p>{totalClasses} classes · {status.session || 'Session detected'} · {status.school_name || 'Uploaded file'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="wizard-card-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveStep(0)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={() => setActiveStep(2)} disabled={!status.loaded}>
                Continue to Generate →
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 3 — GENERATE CARDS
            ═══════════════════════════════════════════ */}
        {activeStep === 2 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${step3Done ? 'done' : ''}`}>03</div>
                <div>
                  <div className="wizard-card-title">Generate ID cards</div>
                  <div className="wizard-card-subtitle">
                    {activeTemplate?.label} · {status.count} students · {totalClasses} classes
                  </div>
                </div>
              </div>
              {step3Done && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Exported</span>}
            </div>

            <div className="wizard-card-body">
              {/* Hero action row */}
              <div className="gen-hero">
                <div>
                  <h3>Export all student ID cards</h3>
                  <p>
                    Download the full batch using <strong>{activeTemplate?.label}</strong> template
                    {status.count > 0 && (
                      <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                        · Est. {estimateTime(status.count, selectedTemplate)} on prod server
                      </span>
                    )}
                  </p>
                </div>
                <div className="gen-actions">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={() => downloadPDF(null)}
                    disabled={!!cardLoading || !!studentLoading}
                  >
                    {cardLoading === 'all_dl'
                      ? <><span className="btn-spinner" /> Generating…</>
                      : <><Download size={15} /> Download all</>}
                  </button>
                  <button
                    className="btn btn-secondary btn-lg"
                    onClick={() => viewPDF(null)}
                    disabled={!!cardLoading || !!studentLoading}
                  >
                    {cardLoading === 'all_view'
                      ? <><span className="btn-spinner" /> Loading…</>
                      : <><Eye size={15} /> Preview all</>}
                  </button>
                </div>
              </div>

              {/* Progress bar — shown whenever any generation is running */}
              {(cardLoading || studentLoading) && (
                <div className="status-banner">
                  <Loader2 size={15} className="spin-icon" />
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 4 }}>{generationProgressLabel}</div>
                    {genProgress > 0 && (
                      <div style={{
                        height: 7, width: '100%',
                        background: 'rgba(0,0,0,0.08)',
                        borderRadius: 999, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${genProgress}%`,
                          height: '100%',
                          background: 'var(--primary, #4F46E5)',
                          transition: 'width 300ms ease',
                          borderRadius: 999,
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search + filter row */}
              <div className="tools-row">
                <div className="search-field">
                  <Search size={15} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by class…"
                  />
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAdvanced((p) => !p)}>
                  <Filter size={14} /> {showAdvanced ? 'Hide' : 'Individual card'}
                </button>
              </div>

              {/* Class grid */}
              <div className="class-grid">
                {filteredClasses.length ? filteredClasses.map((cls) => (
                  <ClassCard
                    key={cls}
                    cls={cls}
                    count={status.classCounts?.[cls] ?? '?'}
                    onDownload={downloadPDF}
                    onView={viewPDF}
                    loading={cardLoading}
                  />
                )) : (
                  <div className="empty-state">
                    <div className="empty-icon"><Search size={20} /></div>
                    <p>No classes match your filter</p>
                  </div>
                )}
              </div>

              {/* Advanced: individual student */}
              {showAdvanced && (
                <div className="advanced-panel">
                  <div className="advanced-title">Generate individual student card</div>
                  <div className="student-row">
                    <div className="form-group">
                      <label className="form-label">Class</label>
                      <Select
                        value={studentClass}
                        onChange={(v) => { setStudentClass(v); setStudentName(''); }}
                        options={classOptions}
                        placeholder="Select class"
                        disabled={!status.loaded}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Student</label>
                      <div className="custom-select">
                        <select value={studentName} onChange={(e) => setStudentName(e.target.value)} disabled={!studentClass || studentNames.length === 0}>
                          <option value="">{!studentClass ? 'Select class first' : studentNames.length === 0 ? 'No students found' : 'Choose student…'}</option>
                          {studentNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={viewStudent} disabled={!studentName || !!studentLoading || !!cardLoading}>
                      {studentLoading === 'view' ? <><span className="btn-spinner" /> Loading…</> : <><Eye size={14} /> Preview</>}
                    </button>
                    <button className="btn btn-primary" onClick={downloadStudent} disabled={!studentName || !!studentLoading || !!cardLoading}>
                      {studentLoading === 'download' ? <><span className="btn-spinner" /> Generating…</> : <><Download size={14} /> Download</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="wizard-card-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveStep(1)}>← Back</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {generationDone ? '✓ Cards exported' : `${totalClasses} classes ready`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
