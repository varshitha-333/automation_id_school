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
} from 'lucide-react';
import './App.css';

/* ─── API helpers ─────────────────────────────────────────── */
const normalizeApiBase = (rawValue) => {
  const value = (rawValue || '').trim();
  if (!value) return '/api';
  const cleaned = value.replace(/\/+$/, '');
  return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
};

const API        = normalizeApiBase(process.env.REACT_APP_API_URL || '/api');
const API_ORIGIN = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

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
  const hasUrl = Boolean(template.preview_url);

  return (
    <button
      type="button"
      className={`template-option ${chosen ? 'chosen' : ''}`}
      onClick={() => onSelect(template.key)}
    >
      <div className="tpl-preview" style={{ background: `${template.color}18` }}>
        {hasUrl && !imgFailed ? (
          <img
            src={template.preview_url}
            alt={template.display_name}
            loading="lazy"
            onError={() => setImgFailed(true)}
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
      // Only cancel jobs that are still running — never delete a finished job,
      // otherwise the file gets wiped before the download can start.
      if (activeJobId.current && !jobDoneRef.current) {
        axios.delete(`${API}/jobs/${activeJobId.current}`).catch(() => {});
      }
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
    }).catch(() => setBackendOk(false));
  }, []);

  // Removed the 60-second fixed ping interval — it was causing
  // a React state update mid-download that triggered cleanup/DELETE
  // on the active job before the file could be fetched.

  useEffect(() => {
    refreshStatus();
    axios.get(`${API}/schools`).then((r) => setSchools(r.data || [])).catch(() => {});
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
  }, [refreshStatus]);

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

      // 3) Download the finished file
      setGenPhase('downloading');
      const fileUrl = `${API}/jobs/${jobId}/file`;

      let resp = null;
      // Retry once on transient gateway errors (502/503/504)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          resp = await axios.get(fileUrl, {
            responseType: 'blob',
            timeout: 30 * 60 * 1000,   // 30-min cap — more than enough for any batch
          });
          break;
        } catch (e) {
          const sc = e?.response?.status;
          if (attempt === 1 && (!sc || sc === 502 || sc === 503 || sc === 504)) {
            await new Promise((r) => setTimeout(r, 2000));
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
  return (
    <div className="app-shell">
      <Toast toasts={toasts} removeToast={removeToast} />
      {modal && <PDFModal url={modal.url} title={modal.title} external={modal.external} onClose={closeModal} />}

      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-brand-icon"><School size={18} /></div>
          ID Card Generator
        </div>
        <div className="topbar-right">
          <div className={`backend-pill ${backendOk === true ? 'ok' : backendOk === false ? 'err' : ''}`}>
            {backendOk === true  && <><span className="status-dot" /> Connected</>}
            {backendOk === false && <><AlertCircle size={13} /> Offline</>}
            {backendOk === null  && <><span className="status-dot pulse" /> Checking…</>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetWorkflow}><RotateCcw size={14} /> Reset</button>
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
