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

/* ─── Fallback templates ──────────────────────────────────── */
const FALLBACK_TEMPLATES = [
  {
    key: 'hebron',
    label: 'Hebron',
    display_name: 'Hebron Mission School',
    description: 'Red layout — includes section, roll number, blood group and parent details.',
    fields: ['student_name', 'class', 'section', 'roll', 'father_name', 'mother_name', 'dob', 'address', 'mobile', 'adm_no', 'blood_group', 'session'],
    preview_url: API_ORIGIN ? `${API_ORIGIN}/api/templates/hebron/preview.png` : null,
    color: '#DC2626',
  },
  {
    key: 'redeemer',
    label: 'Redeemer',
    display_name: 'My Redeemer Mission School',
    description: 'Blue layout — includes student name, class, father name, DOB, mobile and address.',
    fields: ['student_name', 'class', 'father_name', 'dob', 'mobile', 'address', 'session'],
    preview_url: API_ORIGIN ? `${API_ORIGIN}/api/templates/redeemer/preview.png` : null,
    color: '#4F46E5',
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
  URL.revokeObjectURL(a.href);
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

  const fileRef    = useRef(null);
  const toastIdRef = useRef(0);

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
  const isLargeBatch = Boolean(status.loaded) && Number(status.count || 0) > 70;

  const generationProgressLabel = (() => {
    if (cardLoading === 'all_dl')       return 'Generating PDF for all students…';
    if (cardLoading === 'all_view')     return 'Preparing preview for all students…';
    if (cardLoading?.endsWith('_dl'))   return `Generating Class ${cardLoading.replace('_dl', '')} PDF…`;
    if (cardLoading?.endsWith('_view')) return `Preparing Class ${cardLoading.replace('_view', '')} preview…`;
    if (studentLoading === 'download')  return 'Generating individual student card…';
    if (studentLoading === 'view')      return 'Preparing student preview…';
    return '';
  })();

  /* ── Boot ── */
  const refreshStatus = useCallback(() => {
    axios.get(`${API}/status`).then((r) => {
      setBackendOk(true);
      setStatus({ ...INITIAL_STATUS, ...r.data, classCounts: r.data?.classCounts || r.data?.class_counts || {} });
    }).catch(() => setBackendOk(false));
  }, []);

  useEffect(() => {
    refreshStatus();
    axios.get(`${API}/schools`).then((r) => setSchools(r.data || [])).catch(() => {});
    setLoadingTemplates(true);
    axios.get(`${API}/templates`).then((r) => {
      const raw = Array.isArray(r.data) && r.data.length ? r.data : FALLBACK_TEMPLATES;
      const list = raw.map((t) => ({
        ...t,
        color: t.color || (t.key === 'hebron' ? '#DC2626' : '#4F46E5'),
        preview_url: t.preview_url
          ? (t.preview_url.startsWith('http') ? t.preview_url : `${API_ORIGIN}${t.preview_url}`)
          : null,
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

  const downloadPDF = async (cls = null) => {
    const key = cls ? `${cls}_dl` : 'all_dl';
    setCardLoading(key);
    try {
      const url = cls ? withTemplate(`${API}/download/all`, { class: cls }) : withTemplate(`${API}/download/all`);
      const resp = await axios.get(url, { responseType: 'blob' });
      const result = await openExternalOrBlob(resp, cls ? `ids_${selectedTemplate}_${cls}.pdf` : `ids_${selectedTemplate}_ALL.pdf`);
      registerDone();
      addToast(result.external ? 'PDF opened from cloud storage' : 'PDF downloaded', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Download failed', 'error');
    } finally { setCardLoading(null); }
  };

  const viewPDF = async (cls = null) => {
    const key = cls ? `${cls}_view` : 'all_view';
    setCardLoading(key);
    try {
      const url = cls ? withTemplate(`${API}/preview/all`, { class: cls }) : withTemplate(`${API}/preview/all`);
      const resp = await axios.get(url, { responseType: 'blob' });
      await openExternalOrBlob(resp, 'preview.pdf', (u, ext) => {
        setModal({ url: u, title: cls ? `Class ${cls} — Preview` : 'All Students — Preview', external: ext });
      });
      registerDone();
    } catch (err) {
      addToast(err.response?.data?.error || 'Preview failed', 'error');
    } finally { setCardLoading(null); }
  };

  const viewStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student', 'error'); return; }
    setStudentLoading('view');
    try {
      const resp = await axios.get(withTemplate(`${API}/preview/student`, { class: studentClass, name: studentName }), { responseType: 'blob' });
      await openExternalOrBlob(resp, 'preview_student.pdf', (u, ext) => setModal({ url: u, title: `${studentName} — Preview`, external: ext }));
      registerDone();
    } catch (err) {
      addToast(err.response?.data?.error || 'Preview failed', 'error');
    } finally { setStudentLoading(null); }
  };

  const downloadStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student', 'error'); return; }
    setStudentLoading('download');
    try {
      const resp = await axios.get(withTemplate(`${API}/download/student`, { class: studentClass, name: studentName }), { responseType: 'blob' });
      const result = await openExternalOrBlob(resp, `id_${selectedTemplate}_${studentName.replace(/\s+/g, '_')}.pdf`);
      registerDone();
      addToast(result.external ? 'Card opened from cloud storage' : 'Card downloaded', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Download failed', 'error');
    } finally { setStudentLoading(null); }
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
    setStatus(INITIAL_STATUS); setTemplateConfirmed(false); setSelectedSchool('');
    setDataSource('file'); setStudentClass(''); setStudentName(''); setStudentNames([]);
    setSearchQuery(''); setShowAdvanced(false); setGenerationDone(false); setActiveStep(0);
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
                  <p>Download or preview the full batch using the <strong>{activeTemplate?.label}</strong> template</p>
                </div>
                <div className="gen-actions">
                  <button className="btn btn-primary btn-lg" onClick={() => downloadPDF(null)} disabled={!!cardLoading || !!studentLoading}>
                    {cardLoading === 'all_dl' ? <><span className="btn-spinner" /> Generating…</> : <><Download size={15} /> Download all</>}
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => viewPDF(null)} disabled={!!cardLoading || !!studentLoading}>
                    {cardLoading === 'all_view' ? <><span className="btn-spinner" /> Loading…</> : <><Eye size={15} /> Preview all</>}
                  </button>
                </div>
              </div>

              {/* Progress / large batch notice */}
              {(generationProgressLabel || isLargeBatch) && (
                <div className="status-banner">
                  {generationProgressLabel ? <Loader2 size={15} className="spin-icon" /> : <AlertCircle size={15} />}
                  <span>{generationProgressLabel || 'Large batch — preview mode recommended for reliability.'}</span>
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
                    <button className="btn btn-secondary" onClick={viewStudent} disabled={!studentName || !!studentLoading}>
                      {studentLoading === 'view' ? <><span className="btn-spinner" /> Loading…</> : <><Eye size={14} /> Preview</>}
                    </button>
                    <button className="btn btn-primary" onClick={downloadStudent} disabled={!studentName || !!studentLoading}>
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