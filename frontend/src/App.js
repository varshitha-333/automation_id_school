import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  School, Upload, Download, Eye, Users, BookOpen, Calendar,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, Search,
  RefreshCw, FileSpreadsheet, Globe, Building2, X, ZoomIn,
  GraduationCap, BadgeCheck, Wifi, HardDrive
} from 'lucide-react';
import './App.css';

const normalizeApiBase = (rawValue) => {
  const value = (rawValue || '').trim();
  if (!value) return '/api';
  const cleaned = value.replace(/\/+$/, '');
  return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
};

const API = normalizeApiBase(process.env.REACT_APP_API_URL || '/api');

const openExternalOrBlob = async (resp, fallbackName, onPreview) => {
  const contentType = (resp.headers?.['content-type'] || resp.data?.type || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const text = await resp.data.text();
    const payload = JSON.parse(text || '{}');
    if (payload.download_url) {
      if (onPreview) onPreview(payload.download_url);
      else window.open(payload.download_url, '_blank', 'noopener,noreferrer');
      return { external: true, payload };
    }
    throw new Error(payload.error || 'External file URL was not returned');
  }

  const blobUrl = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
  if (onPreview) {
    onPreview(blobUrl);
    return { external: false, blobUrl };
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(a.href);
  return { external: false, blobUrl };
};

// ─── Toast ────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? 'toast-out' : ''}`}>
          <span className="toast-icon">
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error'   && <AlertCircle size={16} />}
            {t.type === 'info'    && <RefreshCw size={16} />}
          </span>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}><X size={14}/></button>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, delay }) {
  return (
    <div className={`stat-card animate-fade-up delay-${delay}`}>
      <div className="stat-icon" style={{ background: color + '18', color }}>
        <Icon size={20} />
      </div>
      <div className="stat-body">
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────
function SectionHeader({ number, title, subtitle, badge }) {
  return (
    <div className="section-header">
      <div className="section-num">{number}</div>
      <div className="section-meta">
        <h2 className="section-title">{title}</h2>
        <p className="section-sub">{subtitle}</p>
      </div>
      {badge && <div className="section-badge">{badge}</div>}
    </div>
  );
}

// ─── Class Card ───────────────────────────────────────────────────
function ClassCard({ cls, count, onDownload, onView, loading }) {
  return (
    <div className="class-card animate-fade-up">
      <div className="class-card-top">
        <div className="class-icon"><GraduationCap size={18} /></div>
        <div className="class-info">
          <div className="class-name">Class {cls}</div>
          <div className="class-count">{count} student{count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="class-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onDownload(cls)}
          disabled={loading === cls + '_dl'}
        >
          {loading === cls + '_dl'
            ? <><span className="btn-spinner"/>{' '}Generating…</>
            : <><Download size={14}/>{' '}Download PDF</>}
        </button>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => onView(cls)}
          disabled={loading === cls + '_view'}
          title="Preview"
        >
          {loading === cls + '_view' ? <span className="btn-spinner small"/> : <Eye size={16}/>}
        </button>
      </div>
    </div>
  );
}

// ─── PDF Viewer Modal ─────────────────────────────────────────────
function PDFModal({ url, title, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title"><Eye size={16}/>{' '}{title}</span>
          <div className="modal-actions">
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              <ZoomIn size={14}/> Open full
            </a>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18}/></button>
          </div>
        </div>
        <div className="modal-body">
          <iframe src={url} title={title} className="pdf-iframe" />
        </div>
      </div>
    </div>
  );
}

// ─── Custom Select ────────────────────────────────────────────────
function Select({ value, onChange, options, placeholder, disabled }) {
  return (
    <div className={`custom-select ${disabled ? 'disabled' : ''}`}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="select-arrow" />
    </div>
  );
}

// ─── Loading Dots ─────────────────────────────────────────────────
function LoadingDots() {
  return (
    <span className="loading-dots">
      <span/><span/><span/>
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════
export default function App() {
  // ── State ──────────────────────────────────────────────────────
  const [status, setStatus]           = useState({ loaded: false });
  const [schools, setSchools]         = useState([]);
  const [dataSource, setDataSource]   = useState('file'); // 'file' | 'api'
  const [selectedSchool, setSelectedSchool] = useState('');
  const [fetchingAPI, setFetchingAPI] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [toasts, setToasts]           = useState([]);
  const [cardLoading, setCardLoading] = useState(null); // 'all_dl'|'all_view'|cls+'_dl'|cls+'_view'
  const [modal, setModal]             = useState(null); // { url, title }
  const [studentClass, setStudentClass]   = useState('');
  const [studentName, setStudentName]     = useState('');
  const [studentNames, setStudentNames]   = useState([]);
  const [studentLoading, setStudentLoading] = useState(null);
  const [backendOk, setBackendOk]     = useState(null);
  const fileRef = useRef();
  const toastIdRef = useRef(0);

  // ── Helpers ────────────────────────────────────────────────────
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 400);
    }, duration);
  }, []);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 400);
  }, []);

  // ── Init ───────────────────────────────────────────────────────
  useEffect(() => {
    // Check backend health
    axios.get(`${API}/status`).then(r => {
      setBackendOk(true);
      setStatus(r.data);
    }).catch(() => setBackendOk(false));

    axios.get(`${API}/schools`).then(r => setSchools(r.data)).catch(() => {});
  }, []);

  // ── Poll status when loading ───────────────────────────────────
  const refreshStatus = () => {
    axios.get(`${API}/status`).then(r => setStatus(r.data)).catch(() => {});
  };

  // ── Upload file ────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) {
      addToast('Please upload an Excel (.xlsx, .xls) or CSV file', 'error'); return;
    }
    setUploadingFile(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/upload`, fd);
      const counts = {};
      data.classes.forEach(c => { counts[c.class] = c.count; });
      setStatus({ loaded: true, count: data.count, classes: data.classes.map(c=>c.class),
                  classCounts: counts, session: data.session, source: 'file', school: 'Uploaded File', school_name: 'Uploaded File' });
      addToast(`✓ Imported ${data.count} students across ${data.classes.length} classes`, 'success', 5000);
      setStudentClass(''); setStudentName(''); setStudentNames([]);
    } catch (e) {
      addToast(e.response?.data?.error || 'Upload failed', 'error');
    } finally { setUploadingFile(false); }
  };

  const onDrop = e => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0]; handleFile(file);
  };

  // ── Fetch from API ─────────────────────────────────────────────
  const fetchFromAPI = async () => {
    if (!selectedSchool) { addToast('Please select a school first', 'error'); return; }
    setFetchingAPI(true);
    try {
      const { data } = await axios.get(`${API}/fetch-school/${selectedSchool}`);
      const counts = {};
      data.classes.forEach(c => { counts[c.class] = c.count; });
      setStatus({ loaded: true, count: data.count, classes: data.classes.map(c=>c.class),
                  classCounts: counts, session: data.session, source: 'api', school: data.school, school_name: data.school });
      addToast(`✓ Fetched ${data.count} students from ${data.school}`, 'success', 5000);
      setStudentClass(''); setStudentName(''); setStudentNames([]);
    } catch (e) {
      addToast(e.response?.data?.error || 'API fetch failed', 'error');
    } finally { setFetchingAPI(false); }
  };

  // ── Download / View handlers ───────────────────────────────────
  const downloadPDF = async (cls = null) => {
    const key = cls ? cls + '_dl' : 'all_dl';
    setCardLoading(key);
    try {
      const url = cls ? `${API}/download/all?class=${cls}` : `${API}/download/all`;
      const resp = await axios.get(url, { responseType: 'blob' });
      const result = await openExternalOrBlob(resp, cls ? `ids_${cls}.pdf` : 'ids_ALL.pdf');
      addToast(result.external ? 'PDF generated and opened from cloud storage' : 'PDF downloaded', 'success');
    } catch (e) {
      addToast('Download failed — check server', 'error');
    } finally { setCardLoading(null); }
  };

  const viewPDF = async (cls = null) => {
    const key = cls ? cls + '_view' : 'all_view';
    setCardLoading(key);
    try {
      const url = cls ? `${API}/preview/all?class=${cls}` : `${API}/preview/all`;
      // Get the PDF as a blob URL for the modal
      const resp = await axios.get(url, { responseType: 'blob' });
      await openExternalOrBlob(resp, 'preview.pdf', (urlToOpen) => {
        setModal({ url: urlToOpen, title: cls ? `Class ${cls} — Preview` : 'All Students — Preview' });
      });
    } catch (e) {
      addToast('Preview failed — check server', 'error');
    } finally { setCardLoading(null); }
  };

  // ── Student lookup ─────────────────────────────────────────────
  useEffect(() => {
    if (!studentClass) { setStudentNames([]); setStudentName(''); return; }
    axios.get(`${API}/students?class=${studentClass}`)
      .then(r => setStudentNames(r.data.map(s => s.student_name).filter(Boolean)))
      .catch(() => setStudentNames([]));
  }, [studentClass]);

  const viewStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student name', 'error'); return; }
    setStudentLoading('view');
    try {
      const resp = await axios.get(`${API}/preview/student?class=${studentClass}&name=${encodeURIComponent(studentName)}`, { responseType: 'blob' });
      await openExternalOrBlob(resp, 'preview_student.pdf', (urlToOpen) => {
        setModal({ url: urlToOpen, title: `${studentName} — Preview` });
      });
    } catch (e) {
      addToast(e.response?.data?.error || 'Preview failed', 'error');
    } finally { setStudentLoading(null); }
  };

  const downloadStudent = async () => {
    if (!studentClass || !studentName) { addToast('Select class and student name', 'error'); return; }
    setStudentLoading('download');
    try {
      const resp = await axios.get(`${API}/download/student?class=${studentClass}&name=${encodeURIComponent(studentName)}`, { responseType: 'blob' });
      const result = await openExternalOrBlob(resp, `id_${studentName.replace(/\s+/g,'_')}.pdf`);
      addToast(result.external ? 'Student card generated and opened from cloud storage' : 'Student card downloaded', 'success');
    } catch (e) {
      addToast('Download failed', 'error');
    } finally { setStudentLoading(null); }
  };

  const closeModal = () => {
    if (modal?.url) URL.revokeObjectURL(modal.url);
    setModal(null);
  };

  const classOptions = (status.classes || []).map(c => ({ value: c, label: `Class ${c}` }));

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="app">
      <Toast toasts={toasts} removeToast={removeToast} />
      {modal && <PDFModal url={modal.url} title={modal.title} onClose={closeModal} />}

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="app-header animate-fade-up">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-icon"><BadgeCheck size={22}/></div>
            <div>
              <div className="brand-name">ID Card Portal</div>
              <div className="brand-sub">School Admin Dashboard</div>
            </div>
          </div>
          <div className="header-right">
            <div className={`backend-status ${backendOk === true ? 'ok' : backendOk === false ? 'err' : 'checking'}`}>
              {backendOk === true  && <><span className="status-dot"/>{' '}Backend connected</>}
              {backendOk === false && <><AlertCircle size={13}/>{' '}Backend offline</>}
              {backendOk === null  && <><span className="status-dot pulse"/>{' '}Connecting…</>}
            </div>
            {status.loaded && (
              <div className="loaded-badge">
                <CheckCircle2 size={13}/>
                {' '}{status.source === 'api' ? (status.school_name || status.school || 'School loaded') : 'File loaded'}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── STATS ROW ──────────────────────────────────────── */}
        <div className="stats-row">
          <StatCard icon={Users} label="Students" value={status.loaded ? status.count : '—'} color="#c41e1e" delay={1}/>
          <StatCard icon={BookOpen} label="Classes" value={status.loaded ? (status.classes||[]).length : '—'} color="#1a7a4a" delay={2}/>
          <StatCard icon={Calendar} label="Session" value={status.loaded ? status.session : '—'} color="#b45309" delay={3}/>
          <StatCard icon={status.source === 'api' ? Wifi : HardDrive}
                    label="Source"
                    value={status.loaded ? (status.source === 'api' ? 'API' : 'File') : '—'}
                    color="#7c3aed" delay={4}/>
        </div>

        {/* ── SECTION 1: DATA SOURCE ─────────────────────────── */}
        <div className="card animate-fade-up delay-2">
          <SectionHeader number="1" title="Load Student Data"
            subtitle="Upload a file or pull live data from school API" />

          {/* Source Toggle */}
          <div className="source-tabs">
            <button className={`source-tab ${dataSource==='file'?'active':''}`}
                    onClick={() => setDataSource('file')}>
              <FileSpreadsheet size={16}/> Upload File
            </button>
            <button className={`source-tab ${dataSource==='api'?'active':''}`}
                    onClick={() => setDataSource('api')}>
              <Globe size={16}/> Live API
            </button>
          </div>

          {/* File Upload Panel */}
          {dataSource === 'file' && (
            <div className="panel animate-fade-in">
              <div
                className={`dropzone ${dragOver ? 'drag-over' : ''} ${uploadingFile ? 'uploading' : ''}`}
                onClick={() => !uploadingFile && fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden
                       onChange={e => handleFile(e.target.files[0])} />
                {uploadingFile ? (
                  <div className="dz-uploading">
                    <Loader2 size={32} className="spin-icon"/>
                    <p>Parsing file<LoadingDots /></p>
                  </div>
                ) : (
                  <div className="dz-idle">
                    <div className="dz-icon"><Upload size={28}/></div>
                    <p className="dz-main">Drop your student file here</p>
                    <p className="dz-sub">Excel (.xlsx, .xls) or CSV (.csv)</p>
                    <div className="dz-columns">
                      Required columns: <code>student_name, class, father_name, phone, section, roll_no, mother_name, dob, blood_group, address, adm_no, photo_url</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* API Panel */}
          {dataSource === 'api' && (
            <div className="panel animate-fade-in">
              <div className="api-panel">
                <div className="api-select-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Select School</label>
                    <div className="custom-select">
                      <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)}>
                        <option value="">Choose a school…</option>
                        {schools.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="select-arrow"/>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary api-fetch-btn"
                    onClick={fetchFromAPI}
                    disabled={fetchingAPI || !selectedSchool}
                  >
                    {fetchingAPI
                      ? <><span className="btn-spinner"/> Fetching<LoadingDots /></>
                      : <><RefreshCw size={15}/> Fetch Students</>}
                  </button>
                </div>
                <p className="api-hint">
                  <Building2 size={12}/> Pulls live data from titusattendence.com for the selected school
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: GENERATE ID CARDS ──────────────────── */}
        <div className={`card animate-fade-up delay-3 ${!status.loaded ? 'card-dimmed' : ''}`}>
          <SectionHeader
            number="2"
            title="Generate ID Cards"
            subtitle={status.loaded ? `${status.count} students · ${(status.classes||[]).length} classes` : 'Load data first'}
            badge={status.loaded ? 'Ready' : null}
          />

          {status.loaded ? (
            <>
              {/* All-students actions */}
              <div className="all-actions">
                <button className="btn btn-primary btn-lg"
                        onClick={() => viewPDF(null)}
                        disabled={!!cardLoading}>
                  {cardLoading === 'all_view'
                    ? <><span className="btn-spinner"/> Generating preview…</>
                    : <><Eye size={17}/> Preview All</>}
                </button>
                <button className="btn btn-green btn-lg"
                        onClick={() => downloadPDF(null)}
                        disabled={!!cardLoading}>
                  {cardLoading === 'all_dl'
                    ? <><span className="btn-spinner"/> Generating PDF…</>
                    : <><Download size={17}/> Download All</>}
                </button>
              </div>

              <div className="divider"><span>or by class</span></div>

              {/* Per-class grid */}
              <div className="class-grid">
                {(status.classes || []).map(cls => {
                  return (
                    <ClassCard
                      key={cls}
                      cls={cls}
                      count={status.classCounts?.[cls] ?? '?'}
                      onDownload={c => downloadPDF(c)}
                      onView={c => viewPDF(c)}
                      loading={cardLoading}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><GraduationCap size={40}/></div>
              <p>Load student data in Step 1 to generate ID cards</p>
            </div>
          )}
        </div>

        {/* ── SECTION 3: FIND ONE STUDENT ───────────────────── */}
        <div className={`card animate-fade-up delay-4 ${!status.loaded ? 'card-dimmed' : ''}`}>
          <SectionHeader number="3" title="Individual Student Card"
            subtitle="Generate ID card for a single student" />

          <div className="student-search">
            <div className="student-fields">
              <div className="form-group">
                <label className="form-label">Class <span className="required">*</span></label>
                <Select
                  value={studentClass}
                  onChange={v => { setStudentClass(v); setStudentName(''); }}
                  options={classOptions}
                  placeholder="Select class"
                  disabled={!status.loaded}
                />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Student Name <span className="required">*</span></label>
                <div className="custom-select">
                  <select
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    disabled={!studentClass || studentNames.length === 0}
                  >
                    <option value="">
                      {!studentClass ? 'Select class first' : studentNames.length === 0 ? 'No students found' : 'Choose student…'}
                    </option>
                    {studentNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown size={14} className="select-arrow"/>
                </div>
              </div>
            </div>
            <div className="student-actions">
              <button className="btn btn-primary btn-lg"
                      onClick={viewStudent}
                      disabled={!studentName || !!studentLoading}>
                {studentLoading === 'view'
                  ? <><span className="btn-spinner"/> Loading…</>
                  : <><Eye size={16}/> View Card</>}
              </button>
              <button className="btn btn-green btn-lg"
                      onClick={downloadStudent}
                      disabled={!studentName || !!studentLoading}>
                {studentLoading === 'download'
                  ? <><span className="btn-spinner"/> Generating…</>
                  : <><Download size={16}/> Download</>}
              </button>
            </div>
          </div>
        </div>

      </main>

      <footer className="app-footer">
        <span>ID Card Portal</span>
        <span className="footer-sep">·</span>
        <span>Preview &nbsp;|&nbsp; Download</span>
        <span className="footer-sep">·</span>
        <span>Flask + React</span>
      </footer>
    </div>
  );
}
