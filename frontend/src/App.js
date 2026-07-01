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
  jnanabharati: '#4570FF',
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
  {
    key: 'jnanabharati',
    label: 'Jnanabharati',
    display_name: 'Jnanabharati English School',
    description: 'Jnanabharati School layout — includes name, class, parent details, DOB, adm no and blood group.',
    fields: ['student_name', 'class', 'father_name', 'mother_name', 'dob', 'adm_no', 'blood_group'],
    preview_url: `${API_ORIGIN}/api/templates/jnanabharati/preview.png`,
    color: '#4570FF',
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
function LoginScreen({ onSuccess, sysStats, initialError }) {
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(initialError || '');

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const activeSeats = sysStats?.active_users ?? 0;
  const maxSeats = sysStats?.max_users ?? 2;
  const full = activeSeats >= maxSeats;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const resume    = getStoredToken();
      const r = await axios.post(`${API}/login`, { code: code.trim(), resume });
      saveStoredToken(r.data?.token);
      onSuccess(r.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Login failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo-container">
          <div className="login-logo-ring">
            <Lock size={22} className="login-logo-icon" />
          </div>
        </div>
        <h2 className="login-title">Railway ID Card Generator</h2>
        <p className="login-subtitle">Enter your access code to begin</p>
        
        <form onSubmit={submit} className="login-form">
          <div className="form-group-custom">
            <Key size={14} className="input-icon-custom" />
            <input
              className="form-input-custom"
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

        {sysStats && (
          <div className={`login-seats ${full ? 'full' : ''}`}>
            <Users size={13} />
            <span><strong>{activeSeats}</strong> / {maxSeats} users currently active</span>
          </div>
        )}
        <div className="login-fineprint">
          Up to {maxSeats} people can use this tool at once.
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

  // ── Mode: 'students' | 'employees' ──────────────────────────
  const [mode, setMode] = useState('students');

  // ── Employee state ───────────────────────────────────────────
  const [empStatus,          setEmpStatus]          = useState({ loaded: false, count: 0, classes: [], classCounts: {} });
  const [empTemplates,       setEmpTemplates]       = useState([]);
  const [selectedEmpTpl,     setSelectedEmpTpl]     = useState('');
  const [empTplConfirmed,    setEmpTplConfirmed]    = useState(false);
  const [empLoadingTpls,     setEmpLoadingTpls]     = useState(false);
  const [empUploading,       setEmpUploading]       = useState(false);
  const [empCardLoading,     setEmpCardLoading]     = useState(null);
  const [empActiveStep,      setEmpActiveStep]      = useState(0);
  const [empGenDone,         setEmpGenDone]         = useState(false);
  const [empGenProgress,     setEmpGenProgress]     = useState(0);
  const [empGenPhase,        setEmpGenPhase]        = useState('');
  const [empSearchQuery,     setEmpSearchQuery]     = useState('');
  const [empModal,           setEmpModal]           = useState(null);
  const [showEmpAdvanced,    setShowEmpAdvanced]    = useState(false);
  const [empDesigFilter,     setEmpDesigFilter]     = useState('');
  const [empSelectedName,    setEmpSelectedName]    = useState('');
  const [empNameOptions,     setEmpNameOptions]     = useState([]);
  const [empIndivLoading,    setEmpIndivLoading]    = useState(null);
  const [empElapsedSecs,     setEmpElapsedSecs]     = useState(0);
  const empFileRef       = useRef(null);
  const empElapsedTimer  = useRef(null);
  const empActiveJobId   = useRef(null);
  const empJobDoneRef    = useRef(false);

  const [zipFormat,          setZipFormat]          = useState('pdf');   // 'pdf' | 'jpeg'
  const [showZipFmtMenu,    setShowZipFmtMenu]    = useState(false);
  const [empZipFormat,      setEmpZipFormat]      = useState('pdf');
  const [showEmpZipFmtMenu, setShowEmpZipFmtMenu] = useState(false);

  const fileRef      = useRef(null);
  const toastIdRef   = useRef(0);
  const elapsedTimer = useRef(null);   // interval for wall-clock counter
  const activeJobId  = useRef(null);   // track running job so we can cancel on unmount
  const jobDoneRef   = useRef(false);  // true once server reports status=done — never DELETE then
  const isBusyRef    = useRef(false);
  const [loginScreenError, setLoginScreenError] = useState('');

  // Sync the isBusyRef with current activity state on every render
  isBusyRef.current = !!(activeJobId.current || cardLoading || studentLoading);

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

  /* ── Close ZIP format menus on outside click ── */
  useEffect(() => {
    if (!showZipFmtMenu && !showEmpZipFmtMenu) return;
    const handler = (e) => {
      if (!e.target.closest('.zip-split-btn')) {
        setShowZipFmtMenu(false);
        setShowEmpZipFmtMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showZipFmtMenu, showEmpZipFmtMenu]);

  /* cleanup on unmount */
  useEffect(() => {
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      if (sysStatsTimer.current) clearTimeout(sysStatsTimer.current);
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
  // v3.2: 4 consecutive failures required before flipping the
  // "Connected" pill to "Offline" — stops single network hiccups
  // from making the indicator flicker. Tolerates CPU-heavy queuing delays.
  const failStreakRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      axios.get(`${API}/system/stats`, { timeout: 4000 }).then((r) => {
        if (cancelled) return;
        setSysStats(r.data);
        failStreakRef.current = 0;
        // /api/system/stats is open — reaching it is proof the backend
        // is alive, even before the user is logged in.
        setBackendOk(true);
        sysStatsTimer.current = window.setTimeout(tick, 15000);
      }).catch(() => {
        if (cancelled) return;
        
        const isBusy = isBusyRef.current;
        if (!isBusy) {
          failStreakRef.current += 1;
          // Require 4 consecutive failures before flipping to "Offline".
          if (failStreakRef.current >= 4) {
            setBackendOk(false);
          }
        }
        
        // On the FIRST failure, retry quickly (after 500 ms) so a real
        // outage is still surfaced fast (~2.5 s total) while transient
        // glitches are just re-tried.
        const delay = (!isBusy && failStreakRef.current === 1) ? 500 : 15000;
        sysStatsTimer.current = window.setTimeout(tick, delay);
      });
    };
    tick();
    return () => { cancelled = true; if (sysStatsTimer.current) window.clearTimeout(sysStatsTimer.current); };
  }, [authed]);

  /* ─── Detect a kicked / expired session and force re-login ────────── */
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (resp) => resp,
      (err) => {
        const r = err?.response;
        if (
          r?.status === 401 &&
          (r.data?.code === 'NO_SESSION' || r.data?.code === 'BAD_SESSION' || r.data?.code === 'SESSION_TIMEOUT')
        ) {
          setStoredToken('');
          setAuthed(false);
          setSysStats(null);
          if (r.data?.code === 'SESSION_TIMEOUT') {
            setLoginScreenError('Your session has expired due to 15 minutes of inactivity. Please log in again.');
            addToast('Your session has expired due to 15 minutes of inactivity. Please log in again.', 'error', 6000);
          } else {
            setLoginScreenError('Your session has expired or is invalid. Please log in again.');
            addToast('Your session has expired or is invalid. Please log in again.', 'error', 6000);
          }
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [addToast]);

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
    const tok = getStoredToken();
    const params = new URLSearchParams({ ...extra, template: selectedTemplate });
    if (tok) params.append('token', tok);
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

  // Load employee templates — gated on authed (endpoint requires session)
  useEffect(() => {
    if (!authed) return;
    setEmpLoadingTpls(true);
    axios.get(`${API}/employees/templates`).then((r) => {
      const raw = Array.isArray(r.data) && r.data.length ? r.data : [];
      const list = raw.map((t) => ({
        ...t,
        color: t.color || TEMPLATE_COLORS[t.key] || '#4F46E5',
        preview_url: t.preview_url
          ? (t.preview_url.startsWith('http') ? t.preview_url : `${API_ORIGIN}${t.preview_url.startsWith('/') ? '' : '/'}${t.preview_url}`)
          : `${API_ORIGIN}/api/templates/${t.key}/preview.png`,
      }));
      setEmpTemplates(list);
      if (list.length) setSelectedEmpTpl(list[0].key);
    }).catch(() => {}).finally(() => setEmpLoadingTpls(false));
  }, [authed]);

  // Once authed, also refresh employee status
  useEffect(() => {
    if (!authed) return;
    axios.get(`${API}/employees/status`).then((r) => {
      if (r.data?.loaded) {
        const counts = {};
        (r.data.classes || []).forEach((c) => { counts[c] = r.data.classCounts?.[c] ?? 0; });
        setEmpStatus({
          loaded: true,
          count: r.data.count,
          classes: r.data.classes || [],
          classCounts: r.data.classCounts || counts,
          school_name: r.data.school_name,
        });
      }
    }).catch(() => {});
  }, [authed]);



  // Once the user is authed, refresh status + load schools.
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
        let isStopped = false;
        const poll = async () => {
          if (isStopped) return;
          try {
            const { data } = await axios.get(
              `${API}/jobs/${jobId}/progress`,
            );
            if (isStopped) return;
            consecutiveErrors = 0;
            setGenProgress(Math.min(99, Math.round(data.progress || 0)));
            setGenPhase(data.phase || '');

            if (data.status === 'done') {
              jobDoneRef.current = true;
              isStopped = true;
              resolve();
              return;
            }
            if (data.status === 'error') {
              isStopped = true;
              reject(new Error(data.error || 'PDF generation failed on server'));
              return;
            }
          } catch {
            if (isStopped) return;
            consecutiveErrors += 1;
            if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
              isStopped = true;
              reject(new Error(
                'Lost connection to server for >2 minutes while waiting. ' +
                'The PDF may still be generating — please check back or retry.'
              ));
              return;
            }
          }
          pollTimer = window.setTimeout(poll, 700);
        };
        poll();
      });

      // 3) Trigger download via a plain <a> tag.
      //
      // WHY NOT XHR/fetch: Chrome's XHR blob pipeline aborts cross-origin
      // responses over ~16 MB with net::ERR_FAILED 200 (OK) — a Chrome-internal
      // limit that cannot be worked around in JS.
      //
      // WHY <a href>: the browser's native download manager has no size limit.
      // It can't send custom headers, so we append ?token= to the URL so Flask
      // auth passes the token via query-string instead.
      setGenPhase('downloading');
      setGenProgress(100);

      const token = getStoredToken();
      const directFileUrl = (() => {
        const base = window.location.port === '3000'
          ? `${window.location.protocol}//${window.location.hostname}:5000/api/jobs/${jobId}/file`
          : `${API}/jobs/${jobId}/file`;
        return token ? `${base}?token=${encodeURIComponent(token)}` : base;
      })();

      const a = document.createElement('a');
      a.href     = directFileUrl;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch(_){} }, 500);

      activeJobId.current = null;
      registerDone();
      stopElapsed();
      addToast(`PDF download started! Check your Downloads folder. (${fmtElapsed(elapsedSecs)})`, 'success');
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
      if (pollTimer) window.clearTimeout(pollTimer);
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
          let isStopped = false;
          let t = null;
          const poll = async () => {
            if (isStopped) return;
            try {
              const { data } = await axios.get(`${API}/jobs/${jobId}/progress`);
              if (isStopped) return;
              consecutiveErrors = 0;
              setGenProgress(Math.min(99, Math.round(data.progress || 0)));
              setGenPhase(data.phase || '');
              if (data.status === 'done')  { jobDoneRef.current = true; isStopped = true; resolve(); return; }
              if (data.status === 'error') { isStopped = true; reject(new Error(data.error || 'PDF generation failed')); return; }
            } catch {
              if (isStopped) return;
              consecutiveErrors += 1;
              if (consecutiveErrors > 200) { isStopped = true; reject(new Error('Connection lost while polling')); return; }
            }
            t = window.setTimeout(poll, 700);
          };
          poll();
        });

        setGenPhase('downloading');
        // v3.7 LARGE-BLOB FIX: same XHR-with-onerror-salvage pattern as downloadPDF.
        const resp = await new Promise((resolve, reject) => {
          const token    = getStoredToken();
          const clientId = getClientId();
          const xhr = new XMLHttpRequest();
          xhr.open('GET', `${API}/jobs/${jobId}/file`, true);
          xhr.responseType = 'blob';
          xhr.timeout = 30 * 60 * 1000;
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          if (token)    xhr.setRequestHeader('X-Session-Token', token);
          if (clientId) xhr.setRequestHeader('X-Client-ID',     clientId);

          const buildResp = (blob, status) => ({
            status,
            headers: {
              'content-type':        xhr.getResponseHeader('content-type') || 'application/pdf',
              'content-disposition': xhr.getResponseHeader('content-disposition') || '',
              'content-length':      String(blob.size),
            },
            data: blob,
          });

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(buildResp(xhr.response, xhr.status));
            else reject(new Error(`Request failed with status ${xhr.status}`));
          };
          xhr.onerror = () => {
            if (xhr.response instanceof Blob && xhr.response.size > 0) {
              resolve(buildResp(xhr.response, 200));
            } else {
              reject(new Error('Network Error'));
            }
          };
          xhr.ontimeout = () => reject(new Error('Request timed out'));
          xhr.send();
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

  const downloadZip = async (cls = null, fmt = zipFormat) => {
    if (cardLoading || studentLoading) return;

    const key   = cls ? `${cls}_zip` : 'all_zip';
    const label = cls ? `Class ${cls} ZIP` : 'All students ZIP';
    setCardLoading(key);
    setGenProgress(0);
    setGenPhase('queued');
    setGenLabel(label);
    startElapsed();

    let jobId = null;
    let pollTimer = null;

    try {
      // 1) Start the ZIP job
      const startUrl = cls
        ? `${API}/jobs/start-zip?class=${encodeURIComponent(cls)}&template=${encodeURIComponent(selectedTemplate)}&format=${encodeURIComponent(fmt)}`
        : `${API}/jobs/start-zip?template=${encodeURIComponent(selectedTemplate)}&format=${encodeURIComponent(fmt)}`;

      jobDoneRef.current = false;
      let startResp;
      try { startResp = await axios.post(startUrl, null); }
      catch { startResp = await axios.get(startUrl); }

      const startData = startResp.data || {};
      if (startData.error) throw new Error(startData.error);
      jobId = startData.job_id;
      activeJobId.current = jobId;
      const fname = startData.download_name || `student_id_cards_${selectedTemplate}.zip`;

      // 2) Poll progress
      let consecutiveErrors = 0;
      await new Promise((resolve, reject) => {
        let isStopped = false;
        const poll = async () => {
          if (isStopped) return;
          try {
            const { data } = await axios.get(`${API}/jobs/${jobId}/progress`);
            if (isStopped) return;
            consecutiveErrors = 0;
            setGenProgress(Math.min(99, Math.round(data.progress || 0)));
            setGenPhase(data.phase || '');
            if (data.status === 'done') { jobDoneRef.current = true; isStopped = true; resolve(); return; }
            if (data.status === 'error') { isStopped = true; reject(new Error(data.error || 'ZIP generation failed')); return; }
          } catch {
            if (isStopped) return;
            consecutiveErrors += 1;
            if (consecutiveErrors > 200) { isStopped = true; reject(new Error('Lost connection while building ZIP')); return; }
          }
          pollTimer = window.setTimeout(poll, 700);
        };
        poll();
      });

      // 3) Download the finished ZIP via native <a> (no size limit)
      setGenPhase('downloading');
      setGenProgress(100);

      const token = getStoredToken();
      const baseZipUrl = window.location.port === '3000'
        ? `${window.location.protocol}//${window.location.hostname}:5000/api/jobs/${jobId}/zip-file`
        : `${API}/jobs/${jobId}/zip-file`;
      const zipUrl = token ? `${baseZipUrl}?token=${encodeURIComponent(token)}` : baseZipUrl;

      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch (_) {} }, 500);

      activeJobId.current = null;
      registerDone();
      stopElapsed();
      addToast(`ZIP download started! Each student has their own ${fmt === "jpeg" ? "PNG (lossless)" : "PDF"} inside. (${fmtElapsed(elapsedSecs)})`, 'success', 7000);
    } catch (err) {
      addToast(err?.response?.data?.error || err?.message || 'ZIP download failed', 'error', 8000);
      if (jobId && !jobDoneRef.current) {
        axios.delete(`${API}/jobs/${jobId}`).catch(() => {});
        activeJobId.current = null;
      }
    } finally {
      if (pollTimer) window.clearTimeout(pollTimer);
      setCardLoading(null);
      setGenProgress(0);
      setGenPhase('');
      setGenLabel('');
      stopElapsed();
    }
  };

  const downloadEmpZip = async (designation = null, fmt = empZipFormat) => {
    if (empCardLoading) return;

    const key   = designation ? `${designation}_zip` : 'all_emp_zip';
    setEmpCardLoading(key);
    setEmpGenProgress(0);
    setEmpGenPhase('queued');
    startEmpElapsed();

    let jobId = null;
    let pollTimer = null;

    try {
      // 1) Start the employee ZIP job
      const startUrl = designation
        ? `${API}/employees/jobs/start-zip?class=${encodeURIComponent(designation)}&template=${encodeURIComponent(selectedEmpTpl)}&format=${encodeURIComponent(fmt)}`
        : `${API}/employees/jobs/start-zip?template=${encodeURIComponent(selectedEmpTpl)}&format=${encodeURIComponent(fmt)}`;

      empJobDoneRef.current = false;
      let startResp;
      try { startResp = await axios.post(startUrl, null); }
      catch { startResp = await axios.get(startUrl); }

      const startData = startResp.data || {};
      if (startData.error) throw new Error(startData.error);
      jobId = startData.job_id;
      empActiveJobId.current = jobId;
      const fname = startData.download_name || `employees_individual.zip`;

      // 2) Poll progress
      let consecutive = 0;
      await new Promise((resolve, reject) => {
        let stopped = false;
        const poll = async () => {
          if (stopped) return;
          try {
            const { data } = await axios.get(`${API}/jobs/${jobId}/progress`);
            if (stopped) return;
            consecutive = 0;
            setEmpGenProgress(Math.min(99, Math.round(data.progress || 0)));
            setEmpGenPhase(data.phase || '');
            if (data.status === 'done') { empJobDoneRef.current = true; stopped = true; resolve(); return; }
            if (data.status === 'error') { stopped = true; reject(new Error(data.error || 'ZIP generation failed')); return; }
          } catch {
            if (stopped) return;
            consecutive += 1;
            if (consecutive > 200) { stopped = true; reject(new Error('Lost connection while building ZIP')); return; }
          }
          pollTimer = window.setTimeout(poll, 700);
        };
        poll();
      });

      // 3) Download via native <a>
      setEmpGenPhase('downloading');
      setEmpGenProgress(100);

      const token = getStoredToken();
      const baseZipUrl = window.location.port === '3000'
        ? `${window.location.protocol}//${window.location.hostname}:5000/api/jobs/${jobId}/zip-file`
        : `${API}/jobs/${jobId}/zip-file`;
      const zipUrl = token ? `${baseZipUrl}?token=${encodeURIComponent(token)}` : baseZipUrl;

      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch (_) {} }, 500);

      empActiveJobId.current = null;
      setEmpGenDone(true);
      stopEmpElapsed();
      addToast(`Employee ZIP download started! Each employee has their own ${fmt === "jpeg" ? "PNG (lossless)" : "PDF"} inside. (${fmtElapsed(empElapsedSecs)})`, 'success', 7000);
    } catch (err) {
      addToast(err?.response?.data?.error || err?.message || 'Employee ZIP download failed', 'error', 8000);
      if (jobId && !empJobDoneRef.current) {
        axios.delete(`${API}/jobs/${jobId}`).catch(() => {});
        empActiveJobId.current = null;
      }
    } finally {
      if (pollTimer) window.clearTimeout(pollTimer);
      setEmpCardLoading(null);
      setEmpGenProgress(0);
      setEmpGenPhase('');
      stopEmpElapsed();
    }
  };

  const closeModal = () => {
    if (modal?.url && !modal?.external && modal.url.startsWith('blob:')) URL.revokeObjectURL(modal.url);
    setModal(null);
  };

  const closeEmpModal = () => {
    if (empModal?.url && !empModal?.external && empModal.url.startsWith('blob:')) URL.revokeObjectURL(empModal.url);
    setEmpModal(null);
  };

  /* ── Employee helpers ── */
  const startEmpElapsed = useCallback(() => {
    setEmpElapsedSecs(0);
    if (empElapsedTimer.current) clearInterval(empElapsedTimer.current);
    empElapsedTimer.current = setInterval(() => setEmpElapsedSecs((s) => s + 1), 1000);
  }, []);
  const stopEmpElapsed = useCallback(() => {
    if (empElapsedTimer.current) { clearInterval(empElapsedTimer.current); empElapsedTimer.current = null; }
  }, []);

  const handleEmpFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { addToast('Please upload an Excel or CSV file', 'error'); return; }
    setEmpUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/employees/upload`, fd);
      const counts = {};
      (data.classes || []).forEach((c) => { counts[c.class] = c.count; });
      setEmpStatus({
        loaded: true,
        count: data.count,
        classes: (data.classes || []).map((c) => c.class || c),
        classCounts: counts,
        school_name: data.school_name || 'Uploaded File',
      });
      setEmpActiveStep(2);
      setEmpGenDone(false);
      addToast(`Imported ${data.count} employees`, 'success', 5000);
    } catch (err) {
      addToast(err.response?.data?.error || 'Upload failed', 'error');
    } finally { setEmpUploading(false); }
  };

  const downloadEmpPDF = async (designation = null) => {
    if (empCardLoading) return;
    const key   = designation ? `${designation}_dl` : 'all_dl';
    const label = designation ? designation : 'All employees';
    setEmpCardLoading(key);
    setEmpGenProgress(0);
    setEmpGenPhase('queued');
    startEmpElapsed();
    let jobId = null;
    try {
      const startUrl = designation
        ? `${API}/employees/jobs/start?class=${encodeURIComponent(designation)}&template=${encodeURIComponent(selectedEmpTpl)}`
        : `${API}/employees/jobs/start?template=${encodeURIComponent(selectedEmpTpl)}`;
      empJobDoneRef.current = false;
      let startResp;
      try { startResp = await axios.post(startUrl, null); }
      catch { startResp = await axios.get(startUrl); }
      const startData = startResp.data || {};
      if (startData.error) throw new Error(startData.error);
      jobId = startData.job_id;
      empActiveJobId.current = jobId;
      const fname = startData.download_name || `employees_${selectedEmpTpl}.pdf`;

      // Poll
      let consecutive = 0;
      await new Promise((resolve, reject) => {
        let stopped = false;
        const poll = async () => {
          if (stopped) return;
          try {
            const { data } = await axios.get(`${API}/jobs/${jobId}/progress`);
            if (stopped) return;
            consecutive = 0;
            setEmpGenProgress(Math.min(99, Math.round(data.progress || 0)));
            setEmpGenPhase(data.phase || '');
            if (data.status === 'done') { empJobDoneRef.current = true; stopped = true; resolve(); return; }
            if (data.status === 'error') { stopped = true; reject(new Error(data.error || 'Generation failed')); return; }
          } catch {
            if (stopped) return;
            consecutive += 1;
            if (consecutive > 200) { stopped = true; reject(new Error('Lost connection while waiting')); return; }
          }
          window.setTimeout(poll, 700);
        };
        poll();
      });

      // Download with XHR (avoids both axios false-error and fetch unrecoverable-error
      // on large blobs — see v3.7 comment in downloadPDF)
      setEmpGenPhase('downloading');
      const resp = await new Promise((resolve, reject) => {
        const token    = getStoredToken();
        const clientId = getClientId();
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${API}/jobs/${jobId}/file`, true);
        xhr.responseType = 'blob';
        xhr.timeout = 30 * 60 * 1000;
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        if (token)    xhr.setRequestHeader('X-Session-Token', token);
        if (clientId) xhr.setRequestHeader('X-Client-ID',     clientId);

        const buildResp = (blob, status) => ({
          status,
          headers: {
            'content-type':        xhr.getResponseHeader('content-type') || 'application/pdf',
            'content-disposition': xhr.getResponseHeader('content-disposition') || '',
            'content-length':      String(blob.size),
          },
          data: blob,
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(buildResp(xhr.response, xhr.status));
          else { const e = new Error(`Request failed with status ${xhr.status}`); e.response = { status: xhr.status }; reject(e); }
        };
        xhr.onerror = () => {
          if (xhr.response instanceof Blob && xhr.response.size > 0) resolve(buildResp(xhr.response, 200));
          else reject(new Error('Network Error'));
        };
        xhr.ontimeout = () => reject(new Error('Request timed out'));
        xhr.send();
      });
      setEmpGenProgress(100);
      await openExternalOrBlob(resp, fname);
      empActiveJobId.current = null;
      setEmpGenDone(true);
      stopEmpElapsed();
      addToast(`Employee PDF downloaded (${fmtElapsed(empElapsedSecs)})`, 'success');
    } catch (err) {
      addToast(err?.response?.data?.error || err?.message || 'Download failed', 'error', 8000);
      if (jobId && !empJobDoneRef.current) {
        axios.delete(`${API}/jobs/${jobId}`).catch(() => {});
        empActiveJobId.current = null;
      }
    } finally {
      setEmpCardLoading(null);
      setEmpGenProgress(0);
      setEmpGenPhase('');
      stopEmpElapsed();
    }
  };

  // Preview all employees (or by designation) — opens PDF in modal
  const viewEmpPDF = async (designation = null) => {
    if (empCardLoading) return;
    const key = designation ? `${designation}_view` : 'all_view';
    setEmpCardLoading(key);
    try {
      const url = designation
        ? `${API}/employees/preview/all?class=${encodeURIComponent(designation)}&template=${encodeURIComponent(selectedEmpTpl)}`
        : `${API}/employees/preview/all?template=${encodeURIComponent(selectedEmpTpl)}`;
      const resp = await axios.get(url, { responseType: 'blob', timeout: 10 * 60 * 1000 });
      await openExternalOrBlob(resp, 'preview_employees.pdf', (u, ext) =>
        setEmpModal({ url: u, title: designation ? `${designation} — Preview` : 'All Employees — Preview', external: ext }));
    } catch (err) {
      addToast(err?.response?.data?.error || err?.message || 'Preview failed', 'error', 6000);
    } finally {
      setEmpCardLoading(null);
    }
  };

  // Fetch employee names for a given designation (for individual card panel)
  const loadEmpNames = async (desig) => {
    setEmpDesigFilter(desig);
    setEmpSelectedName('');
    setEmpNameOptions([]);
    if (!desig) return;
    try {
      const { data } = await axios.get(`${API}/employees/list?class=${encodeURIComponent(desig)}`);
      const names = (data || []).map((e) => e.employee_name || e.name || '').filter(Boolean);
      setEmpNameOptions(names);
    } catch {
      setEmpNameOptions([]);
    }
  };

  // Preview a single employee card
  const viewEmpEmployee = async () => {
    if (!empDesigFilter || !empSelectedName) { addToast('Select designation and employee', 'error'); return; }
    setEmpIndivLoading('view');
    try {
      const resp = await axios.get(
        `${API}/employees/preview/student?class=${encodeURIComponent(empDesigFilter)}&name=${encodeURIComponent(empSelectedName)}&template=${encodeURIComponent(selectedEmpTpl)}`,
        { responseType: 'blob', timeout: 10 * 60 * 1000 },
      );
      await openExternalOrBlob(resp, 'preview_employee.pdf', (u, ext) =>
        setEmpModal({ url: u, title: `${empSelectedName} — Preview`, external: ext }));
    } catch (err) {
      addToast(err?.response?.data?.error || 'Preview failed', 'error');
    } finally { setEmpIndivLoading(null); }
  };

  // Download a single employee card
  const downloadEmpEmployee = async () => {
    if (!empDesigFilter || !empSelectedName) { addToast('Select designation and employee', 'error'); return; }
    setEmpIndivLoading('download');
    try {
      const resp = await axios.get(
        `${API}/employees/download/student?class=${encodeURIComponent(empDesigFilter)}&name=${encodeURIComponent(empSelectedName)}&template=${encodeURIComponent(selectedEmpTpl)}`,
        { responseType: 'blob', timeout: 10 * 60 * 1000 },
      );
      await openExternalOrBlob(resp, `employee_${empSelectedName.replace(/\s+/g, '_')}.pdf`);
      addToast('Employee card downloaded', 'success');
    } catch (err) {
      addToast(err?.response?.data?.error || 'Download failed', 'error');
    } finally { setEmpIndivLoading(null); }
  };

  const activeEmpTemplate = empTemplates.find((t) => t.key === selectedEmpTpl) || empTemplates[0];
  const empFilteredDesignations = useMemo(() => {
    const q = empSearchQuery.trim().toLowerCase();
    return q
      ? (empStatus.classes || []).filter((c) => String(c).toLowerCase().includes(q))
      : (empStatus.classes || []);
  }, [empSearchQuery, empStatus.classes]);

  const confirmTemplate = () => {
    setTemplateConfirmed(true);
    setActiveStep(1);
    addToast(`Template set: ${activeTemplate?.label}`, 'success');
  };

  const resetWorkflow = () => {
    // cancel any running student job
    if (activeJobId.current) {
      axios.delete(`${API}/jobs/${activeJobId.current}`).catch(() => {});
      activeJobId.current = null;
    }
    // cancel any running employee job
    if (empActiveJobId.current) {
      axios.delete(`${API}/jobs/${empActiveJobId.current}`).catch(() => {});
      empActiveJobId.current = null;
    }
    stopElapsed();
    stopEmpElapsed();
    // reset student state
    setStatus(INITIAL_STATUS); setTemplateConfirmed(false); setSelectedSchool('');
    setDataSource('file'); setStudentClass(''); setStudentName(''); setStudentNames([]);
    setSearchQuery(''); setShowAdvanced(false); setGenerationDone(false); setActiveStep(0);
    setCardLoading(null); setGenProgress(0); setGenPhase(''); setGenLabel('');
    // reset employee state
    setEmpStatus({ loaded: false, count: 0, classes: [], classCounts: {} });
    setEmpTplConfirmed(false); setEmpActiveStep(0); setEmpGenDone(false);
    setEmpCardLoading(null); setEmpGenProgress(0); setEmpGenPhase('');
    setEmpSearchQuery(''); setShowEmpAdvanced(false);
    setEmpDesigFilter(''); setEmpSelectedName(''); setEmpNameOptions([]);
    setEmpIndivLoading(null);
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
        sysStats={sysStats}
        initialError={loginScreenError}
        onSuccess={(data) => {
          setInitialSeats({ active: data.active_users, max: data.max_users });
          setAuthed(true);
          setLoginScreenError('');
        }}
      />
    );
  }

  const ramRefuse = sysStats?.ram_level === 'refuse' || sysStats?.refuse_new_jobs;
  const ramWarn   = sysStats?.ram_level === 'warn';

  return (
    <div className="app-shell">
      <Toast toasts={toasts} removeToast={removeToast} />
      {modal    && <PDFModal url={modal.url}    title={modal.title}    external={modal.external}    onClose={closeModal} />}
      {empModal && <PDFModal url={empModal.url} title={empModal.title} external={empModal.external} onClose={closeEmpModal} />}

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
          {/* ── Students / Employees mode toggle ── */}
          <div className="mode-tabs">
            <button className={`mode-tab ${mode === 'students' ? 'active' : ''}`} onClick={() => setMode('students')}>
              <GraduationCap size={13} /> Students
            </button>
            <button className={`mode-tab ${mode === 'employees' ? 'active' : ''}`} onClick={() => setMode('employees')}>
              <Users size={13} /> Employees
            </button>
          </div>
          <div className={`backend-pill ${backendOk === true ? 'ok' : backendOk === false ? 'err' : ''}`}>
            {backendOk === true  && <><span className="status-dot" /> Connected</>}
            {backendOk === false && <><AlertCircle size={13} /> Offline</>}
            {backendOk === null  && <><span className="status-dot pulse" /> Checking…</>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetWorkflow}><RotateCcw size={14} /> Reset</button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out"><LogOut size={14} /> Logout</button>
        </div>
      </header>

      {/* ── Students wizard ── */}
      {mode === 'students' && (
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
                  <div className="zip-split-btn" style={{ position: 'relative', display: 'inline-flex' }}>
                    <button
                      className="btn btn-secondary btn-lg zip-main"
                      onClick={() => { setShowZipFmtMenu(false); downloadZip(null, zipFormat); }}
                      disabled={!!cardLoading || !!studentLoading}
                      title={`Download one ${zipFormat === "jpeg" ? "PNG (lossless)" : "PDF"} per student, packed into a ZIP`}
                      style={{ borderRadius: '8px 0 0 8px', paddingRight: 10 }}
                    >
                      {cardLoading === 'all_zip'
                        ? (genPhase === 'downloading'
                            ? <><span className="btn-spinner" /> Downloading…</>
                            : genPhase === 'prefetch'
                            ? <><span className="btn-spinner" /> Fetching photos…</>
                            : <><span className="btn-spinner" /> Packing {genProgress > 0 ? `${genProgress}%` : '…'}</>)
                        : <><Download size={15} /> Download ZIP ({zipFormat === 'jpeg' ? 'PNG' : 'PDF'})</>}
                    </button>
                    <button
                      className="btn btn-secondary btn-lg zip-arrow"
                      onClick={() => setShowZipFmtMenu((v) => !v)}
                      disabled={!!cardLoading || !!studentLoading}
                      title="Choose ZIP format"
                      style={{ borderRadius: '0 8px 8px 0', borderLeft: '1px solid rgba(0,0,0,0.15)', paddingLeft: 8, paddingRight: 8 }}
                    >
                      <ChevronDown size={14} />
                    </button>
                    {showZipFmtMenu && (
                      <div className="zip-fmt-menu" style={{
                        position: 'absolute', top: '110%', right: 0, zIndex: 200,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
                        minWidth: 170, overflow: 'hidden',
                      }}>
                        <div style={{ padding: '6px 0' }}>
                          {[
                            { val: 'pdf',  label: '📄 PDF', sub: 'Vector — smallest file' },
                            { val: 'jpeg', label: '🖼️ PNG', sub: '8K lossless PNG — print & zoom proof' },
                          ].map(({ val, label, sub }) => (
                            <button
                              key={val}
                              onClick={() => { setZipFormat(val); setShowZipFmtMenu(false); }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '8px 14px', border: 'none', cursor: 'pointer',
                                background: zipFormat === val ? 'var(--primary-10, #eef2ff)' : 'transparent',
                                color: 'var(--text-1)',
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
      )} {/* end mode === 'students' */}

      {/* ══════════════════════════════════════════════════════
          EMPLOYEES SECTION
          ══════════════════════════════════════════════════════ */}
      {mode === 'employees' && (
      <div className="wizard-outer">

        {/* Step progress track */}
        <div className="step-track">
          {['Select Template', 'Upload Data', 'Generate'].map((label, i) => {
            const dones = [empTplConfirmed, empStatus.loaded, empGenDone];
            const canGo = i === 0 ? true : i === 1 ? empTplConfirmed : empTplConfirmed && empStatus.loaded;
            return (
              <React.Fragment key={label}>
                {i > 0 && (
                  <div className="step-connector">
                    <div className="step-connector-fill" style={{ width: (i === 1 ? empTplConfirmed : empTplConfirmed && empStatus.loaded) ? '100%' : '0%' }} />
                  </div>
                )}
                <button
                  className={`step-node ${empActiveStep === i ? 'active' : ''} ${dones[i] ? 'done' : ''}`}
                  onClick={() => canGo && setEmpActiveStep(i)}
                  disabled={!canGo}
                >
                  <div className="step-bubble">{dones[i] ? <CheckCircle2 size={16} /> : i + 1}</div>
                  <span className="step-label">{label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* ── STEP 1: Select employee template ── */}
        {empActiveStep === 0 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${empTplConfirmed ? 'done' : ''}`}>01</div>
                <div>
                  <div className="wizard-card-title">Choose employee card layout</div>
                  <div className="wizard-card-subtitle">Pick the design for your school's employee ID cards</div>
                </div>
              </div>
              {empTplConfirmed && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Done</span>}
            </div>
            <div className="wizard-card-body">
              <div className="template-scroll">
                {empLoadingTpls
                  ? [0, 1].map((i) => <TplSkeleton key={i} />)
                  : empTemplates.length === 0
                    ? <div className="empty-state"><AlertCircle size={20} /><p>No employee templates found. Check the backend is running.</p></div>
                    : empTemplates.map((t) => (
                      <TemplateCard key={t.key} template={t} chosen={selectedEmpTpl === t.key} onSelect={setSelectedEmpTpl} />
                    ))}
              </div>
            </div>
            <div className="wizard-card-footer">
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Selected: <strong>{activeEmpTemplate?.label || '—'}</strong>
              </span>
              <button className="btn btn-primary btn-lg"
                onClick={() => { setEmpTplConfirmed(true); setEmpActiveStep(1); addToast(`Template set: ${activeEmpTemplate?.label}`, 'success'); }}
                disabled={!selectedEmpTpl}
              >
                Continue with {activeEmpTemplate?.label || 'template'} →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Upload employee file ── */}
        {empActiveStep === 1 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${empStatus.loaded ? 'done' : ''}`}>02</div>
                <div>
                  <div className="wizard-card-title">Upload employee data</div>
                  <div className="wizard-card-subtitle">Excel or CSV with columns: name, designation, emp_id, photo_url, etc.</div>
                </div>
              </div>
              {empStatus.loaded && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> {empStatus.count} employees loaded</span>}
            </div>
            <div className="wizard-card-body">
              <div
                className={`dropzone ${empUploading ? 'uploading' : ''}`}
                onClick={() => !empUploading && empFileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleEmpFile(e.dataTransfer.files[0]); }}
              >
                <input ref={empFileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleEmpFile(e.target.files[0])} />
                {empUploading ? (
                  <>
                    <Loader2 size={32} className="spin-icon" style={{ color: 'var(--primary)' }} />
                    <div className="dropzone-title">Parsing employee data<Dots /></div>
                    <div className="dropzone-sub">Reading rows and grouping by designation…</div>
                  </>
                ) : (
                  <>
                    <div className="dropzone-icon"><Upload size={22} /></div>
                    <div className="dropzone-title">Drop your employee spreadsheet here</div>
                    <div className="dropzone-sub">Columns: name, designation, emp_id, dob, mobile, address, photo_url</div>
                  </>
                )}
              </div>
              {empStatus.loaded && (
                <div className="load-success">
                  <div className="load-success-icon"><CheckCircle2 size={18} /></div>
                  <div>
                    <strong>{empStatus.count} employees loaded</strong>
                    <p>{(empStatus.classes || []).length} designations · {empStatus.school_name || 'Uploaded file'}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="wizard-card-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEmpActiveStep(0)}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={() => setEmpActiveStep(2)} disabled={!empStatus.loaded}>
                Continue to Generate →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Generate employee ID cards ── */}
        {empActiveStep === 2 && (
          <div className="wizard-card" style={{ animation: 'slideFade .22s ease' }}>
            <div className="wizard-card-header">
              <div className="wizard-card-header-left">
                <div className={`wizard-step-badge ${empGenDone ? 'done' : ''}`}>03</div>
                <div>
                  <div className="wizard-card-title">Generate Employee ID cards</div>
                  <div className="wizard-card-subtitle">
                    {activeEmpTemplate?.label} · {empStatus.count} employees · {(empStatus.classes || []).length} designations
                  </div>
                </div>
              </div>
              {empGenDone && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} /> Exported</span>}
            </div>
            <div className="wizard-card-body">
              {/* Hero action */}
              <div className="gen-hero">
                <div>
                  <h3>Export all employee ID cards</h3>
                  <p>Download the full batch using <strong>{activeEmpTemplate?.label}</strong> template</p>
                </div>
                <div className="gen-actions">
                  <button className="btn btn-primary btn-lg" onClick={() => downloadEmpPDF(null)} disabled={!!empCardLoading}>
                    {empCardLoading === 'all_dl'
                      ? <><span className="btn-spinner" /> Generating…</>
                      : <><Download size={15} /> Download all</>}
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => viewEmpPDF(null)} disabled={!!empCardLoading}>
                    {empCardLoading === 'all_view'
                      ? <><span className="btn-spinner" /> Loading…</>
                      : <><Eye size={15} /> Preview all</>}
                  </button>
                  <div className="zip-split-btn" style={{ position: 'relative', display: 'inline-flex' }}>
                    <button
                      className="btn btn-secondary btn-lg zip-main"
                      onClick={() => { setShowEmpZipFmtMenu(false); downloadEmpZip(null, empZipFormat); }}
                      disabled={!!empCardLoading}
                      title={`Download one ${empZipFormat === "jpeg" ? "PNG (lossless)" : "PDF"} per employee, packed into a ZIP`}
                      style={{ borderRadius: '8px 0 0 8px', paddingRight: 10 }}
                    >
                      {empCardLoading === 'all_emp_zip'
                        ? (empGenPhase === 'downloading'
                            ? <><span className="btn-spinner" /> Downloading…</>
                            : empGenPhase === 'prefetch'
                            ? <><span className="btn-spinner" /> Fetching photos…</>
                            : <><span className="btn-spinner" /> Packing {empGenProgress > 0 ? `${empGenProgress}%` : '…'}</>)
                        : <><Download size={15} /> Download ZIP ({empZipFormat === 'jpeg' ? 'PNG' : 'PDF'})</>}
                    </button>
                    <button
                      className="btn btn-secondary btn-lg zip-arrow"
                      onClick={() => setShowEmpZipFmtMenu((v) => !v)}
                      disabled={!!empCardLoading}
                      title="Choose ZIP format"
                      style={{ borderRadius: '0 8px 8px 0', borderLeft: '1px solid rgba(0,0,0,0.15)', paddingLeft: 8, paddingRight: 8 }}
                    >
                      <ChevronDown size={14} />
                    </button>
                    {showEmpZipFmtMenu && (
                      <div className="zip-fmt-menu" style={{
                        position: 'absolute', top: '110%', right: 0, zIndex: 200,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.13)',
                        minWidth: 170, overflow: 'hidden',
                      }}>
                        <div style={{ padding: '6px 0' }}>
                          {[
                            { val: 'pdf',  label: '📄 PDF', sub: 'Vector — smallest file' },
                            { val: 'jpeg', label: '🖼️ PNG', sub: '8K lossless PNG — print & zoom proof' },
                          ].map(({ val, label, sub }) => (
                            <button
                              key={val}
                              onClick={() => { setEmpZipFormat(val); setShowEmpZipFmtMenu(false); }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '8px 14px', border: 'none', cursor: 'pointer',
                                background: empZipFormat === val ? 'var(--primary-10, #eef2ff)' : 'transparent',
                                color: 'var(--text-1)',
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {empCardLoading && (
                <div className="status-banner">
                  <Loader2 size={15} className="spin-icon" />
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 4 }}>{phaseMap[empGenPhase] || empGenPhase || 'Processing…'} ({empElapsedSecs}s)</div>
                    {empGenProgress > 0 && (
                      <div style={{ height: 7, width: '100%', background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${empGenProgress}%`, height: '100%', background: 'var(--primary, #4F46E5)', transition: 'width 300ms ease', borderRadius: 999 }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search + filter row */}
              <div className="tools-row">
                <div className="search-field">
                  <Search size={15} />
                  <input type="text" value={empSearchQuery} onChange={(e) => setEmpSearchQuery(e.target.value)} placeholder="Filter by designation…" />
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowEmpAdvanced((p) => !p)}>
                  <Filter size={14} /> {showEmpAdvanced ? 'Hide' : 'Individual card'}
                </button>
              </div>

              <div className="class-grid">
                {empFilteredDesignations.length ? empFilteredDesignations.map((des) => (
                  <ClassCard
                    key={des}
                    cls={des}
                    count={empStatus.classCounts?.[des] ?? '?'}
                    onDownload={downloadEmpPDF}
                    onView={viewEmpPDF}
                    loading={empCardLoading}
                  />
                )) : (
                  <div className="empty-state"><Search size={20} /><p>No designations match your filter</p></div>
                )}
              </div>

              {/* Individual employee card panel */}
              {showEmpAdvanced && (
                <div className="advanced-panel">
                  <div className="advanced-title">Generate individual employee card</div>
                  <div className="student-row">
                    <div className="form-group">
                      <label className="form-label">Designation</label>
                      <div className="custom-select">
                        <select value={empDesigFilter} onChange={(e) => loadEmpNames(e.target.value)}>
                          <option value="">Choose designation…</option>
                          {(empStatus.classes || []).map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Employee</label>
                      <div className="custom-select">
                        <select value={empSelectedName} onChange={(e) => setEmpSelectedName(e.target.value)} disabled={!empDesigFilter || empNameOptions.length === 0}>
                          <option value="">{!empDesigFilter ? 'Select designation first' : empNameOptions.length === 0 ? 'No employees found' : 'Choose employee…'}</option>
                          {empNameOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={viewEmpEmployee} disabled={!empSelectedName || !!empIndivLoading || !!empCardLoading}>
                      {empIndivLoading === 'view' ? <><span className="btn-spinner" /> Loading…</> : <><Eye size={14} /> Preview</>}
                    </button>
                    <button className="btn btn-primary" onClick={downloadEmpEmployee} disabled={!empSelectedName || !!empIndivLoading || !!empCardLoading}>
                      {empIndivLoading === 'download' ? <><span className="btn-spinner" /> Generating…</> : <><Download size={14} /> Download</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="wizard-card-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEmpActiveStep(1)}>← Back</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {empGenDone ? '✓ Cards exported' : `${(empStatus.classes || []).length} designations ready`}
              </span>
            </div>
          </div>
        )}
      </div>
      )} {/* end mode === 'employees' */}

    </div>
  );
}