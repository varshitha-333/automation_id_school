import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  School,
  Upload,
  Download,
  Eye,
  Users,
  BookOpen,
  Calendar,
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
  Wifi,
  HardDrive,
  Sparkles,
  ChevronRight,
  Search,
  Filter,
  RotateCcw,
  Clock3,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import './App.css';

const normalizeApiBase = (rawValue) => {
  const value = (rawValue || '').trim();
  if (!value) return '/api';
  const cleaned = value.replace(/\/+$/, '');
  return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
};

const API = normalizeApiBase(process.env.REACT_APP_API_URL || '/api');

const FALLBACK_TEMPLATES = [
  {
    key: 'hebron',
    label: 'Hebron',
    display_name: 'Hebron Mission School',
    description: 'Red layout with section, roll, blood group and parent details.',
    fields: ['student_name', 'class', 'section', 'roll', 'father_name', 'mother_name', 'dob', 'address', 'mobile', 'adm_no', 'blood_group', 'session'],
    preview_url: '/api/templates/hebron/preview.png',
  },
  {
    key: 'redeemer',
    label: 'Redeemer',
    display_name: 'My Redeemer Mission School',
    description: 'Blue layout with student name, class, father name, DOB, mobile and address.',
    fields: ['student_name', 'class', 'father_name', 'dob', 'mobile', 'address', 'session'],
    preview_url: '/api/templates/redeemer/preview.png',
  },
];

const INITIAL_STATUS = { loaded: false, count: 0, classes: [], classCounts: {} };

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
  if (onPreview) {
    onPreview(blobUrl, false);
    return { external: false, blobUrl };
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(a.href);
  return { external: false, blobUrl };
};

const formatTimeAgo = (date) => {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  let duration = seconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return 'just now';
};

function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type} ${toast.leaving ? 'toast-out' : ''}`}>
          <span className="toast-icon">
            {toast.type === 'success' && <CheckCircle2 size={16} />}
            {toast.type === 'error' && <AlertCircle size={16} />}
            {toast.type === 'info' && <Sparkles size={16} />}
          </span>
          <span className="toast-copy">{toast.message}</span>
          <button className="toast-close" onClick={() => removeToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <div className="stat-copy">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value ?? '—'}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

function StepperItem({ step, index, isActive, isCompleted, isLocked, onClick }) {
  const Icon = step.icon;
  return (
    <button
      type="button"
      className={`stepper-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
      onClick={onClick}
      disabled={isLocked}
    >
      <span className="stepper-icon-wrap">
        <span className="stepper-icon">
          {isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}
        </span>
        {index < 2 && <span className="stepper-line" />}
      </span>
      <span className="stepper-copy">
        <span className="stepper-label">Step {index + 1}</span>
        <span className="stepper-title">{step.title}</span>
        <span className="stepper-desc">{step.description}</span>
      </span>
      <span className="stepper-state">
        {isCompleted ? 'Done' : isLocked ? 'Locked' : isActive ? 'Open' : 'Ready'}
      </span>
    </button>
  );
}

function TemplateSkeleton() {
  return (
    <div className="template-card skeleton-card" aria-hidden="true">
      <div className="skeleton-block skeleton-media" />
      <div className="template-card-body">
        <div className="skeleton-block skeleton-title" />
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-chip-row">
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
          <span className="skeleton-chip" />
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }) {
  const visibleFields = (template.fields || []).slice(0, 4);
  const extraCount = Math.max((template.fields || []).length - visibleFields.length, 0);

  return (
    <button type="button" className={`template-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(template.key)}>
      <div className="template-card-media">
        <img
          src={template.preview_url}
          alt={template.display_name || template.label}
          className="template-preview-img"
          loading="lazy"
        />
        <div className="template-card-badge">{selected ? 'Active' : 'Preview'}</div>
      </div>

      <div className="template-card-body">
        <div className="template-card-top">
          <div>
            <div className="template-card-title">{template.label}</div>
            <div className="template-card-subtitle">{template.display_name}</div>
          </div>
          {selected && (
            <div className="template-checkmark">
              <CheckCircle2 size={16} />
            </div>
          )}
        </div>
        <p className="template-card-desc">{template.description}</p>
        <div className="template-field-list">
          {visibleFields.map((field) => (
            <span key={field} className="template-field-chip">{field}</span>
          ))}
          {extraCount > 0 && <span className="template-field-chip muted">+{extraCount}</span>}
        </div>
      </div>
    </button>
  );
}

function ClassCard({ cls, count, onDownload, onView, loading }) {
  const isDownloading = loading === `${cls}_dl`;
  const isViewing = loading === `${cls}_view`;

  return (
    <div className="class-card">
      <div className="class-card-head">
        <div className="class-icon"><GraduationCap size={18} /></div>
        <div>
          <div className="class-name">Class {cls}</div>
          <div className="class-count">{count} student{count !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="class-meta-row">
        <span className="class-meta-pill">Batch ready</span>
        <span className="class-meta-pill muted">Template PDF</span>
      </div>

      <div className="class-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onDownload(cls)} disabled={!!loading}>
          {isDownloading ? <><span className="btn-spinner" /> Generating…</> : <><Download size={14} /> Download</>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => onView(cls)} disabled={!!loading}>
          {isViewing ? <><span className="btn-spinner dark" /> Opening…</> : <><Eye size={14} /> Preview</>}
        </button>
      </div>
    </div>
  );
}

function PDFModal({ url, title, onClose, external }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Eye size={16} /> {title}</div>
          <div className="modal-actions">
            {external && <span className="modal-pill">Cloud file</span>}
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              Open full
            </a>
            <button className="btn btn-icon btn-secondary" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <iframe src={url} title={title} className="pdf-iframe" />
        </div>
      </div>
    </div>
  );
}

function Select({ value, onChange, options, placeholder, disabled }) {
  return (
    <div className={`custom-select ${disabled ? 'disabled' : ''}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="select-arrow" />
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="loading-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function App() {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [schools, setSchools] = useState([]);
  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState('redeemer');
  const [templateConfirmed, setTemplateConfirmed] = useState(false);
  const [dataSource, setDataSource] = useState('file');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [fetchingAPI, setFetchingAPI] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [cardLoading, setCardLoading] = useState(null);
  const [modal, setModal] = useState(null);
  const [studentClass, setStudentClass] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentNames, setStudentNames] = useState([]);
  const [studentLoading, setStudentLoading] = useState(null);
  const [backendOk, setBackendOk] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);

  const fileRef = useRef(null);
  const toastIdRef = useRef(0);
  const activityIdRef = useRef(0);
  const stepRefs = useRef({});

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 350);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 350);
  }, []);

  const pushActivity = useCallback((label, tone = 'neutral') => {
    const id = ++activityIdRef.current;
    setRecentActivity((prev) => [{ id, label, tone, date: new Date() }, ...prev].slice(0, 6));
  }, []);

  const activeTemplate = useMemo(() => {
    return templates.find((template) => template.key === selectedTemplate) || templates[0] || FALLBACK_TEMPLATES[0];
  }, [templates, selectedTemplate]);

  const withTemplate = useCallback((baseUrl, extra = {}) => {
    const params = new URLSearchParams({ ...extra, template: selectedTemplate });
    return `${baseUrl}?${params.toString()}`;
  }, [selectedTemplate]);

  const refreshStatus = useCallback(() => {
    axios.get(`${API}/status`).then((response) => {
      setBackendOk(true);
      setStatus({
        ...INITIAL_STATUS,
        ...response.data,
        classCounts: response.data?.classCounts || response.data?.class_counts || {},
      });
    }).catch(() => setBackendOk(false));
  }, []);

  useEffect(() => {
    refreshStatus();

    axios.get(`${API}/schools`).then((response) => {
      setSchools(response.data || []);
    }).catch(() => {});

    setLoadingTemplates(true);
    axios.get(`${API}/templates`).then((response) => {
      const list = Array.isArray(response.data) && response.data.length ? response.data : FALLBACK_TEMPLATES;
      setTemplates(list);
      if (!list.some((template) => template.key === selectedTemplate)) {
        setSelectedTemplate(list[0]?.key || 'hebron');
      }
    }).catch(() => {
      setTemplates(FALLBACK_TEMPLATES);
    }).finally(() => {
      setLoadingTemplates(false);
    });
  }, [refreshStatus, selectedTemplate]);

  useEffect(() => {
    const node = stepRefs.current[activeStep];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeStep]);

  useEffect(() => {
    if (!studentClass) {
      setStudentNames([]);
      setStudentName('');
      return;
    }

    axios.get(`${API}/students?class=${encodeURIComponent(studentClass)}`).then((response) => {
      setStudentNames(response.data.map((student) => student.student_name).filter(Boolean));
    }).catch(() => setStudentNames([]));
  }, [studentClass]);

  const handleSuccessfulLoad = useCallback((data, sourceLabel, schoolName) => {
    const counts = {};
    (data.classes || []).forEach((cls) => {
      counts[cls.class] = cls.count;
    });

    setStatus({
      loaded: true,
      count: data.count,
      classes: (data.classes || []).map((cls) => cls.class),
      classCounts: counts,
      session: data.session,
      source: sourceLabel,
      school: schoolName,
      school_name: schoolName,
    });

    setStudentClass('');
    setStudentName('');
    setStudentNames([]);
    setSearchQuery('');
    setShowAdvanced(false);
    setActiveStep(2);
    setGenerationDone(false);
    pushActivity(`Student data loaded from ${sourceLabel === 'api' ? schoolName : 'uploaded file'}`, 'success');
  }, [pushActivity]);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      addToast('Please upload an Excel (.xlsx, .xls) or CSV file', 'error');
      return;
    }

    setUploadingFile(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const { data } = await axios.post(`${API}/upload`, fd);
      handleSuccessfulLoad(data, 'file', 'Uploaded File');
      addToast(`Imported ${data.count} students across ${(data.classes || []).length} classes`, 'success', 5000);
    } catch (error) {
      addToast(error.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const fetchFromAPI = async () => {
    if (!selectedSchool) {
      addToast('Please select a school first', 'error');
      return;
    }

    setFetchingAPI(true);
    try {
      const { data } = await axios.get(`${API}/fetch-school/${selectedSchool}`);
      handleSuccessfulLoad(data, 'api', data.school);
      addToast(`Fetched ${data.count} students from ${data.school}`, 'success', 5000);
    } catch (error) {
      addToast(error.response?.data?.error || 'API fetch failed', 'error');
    } finally {
      setFetchingAPI(false);
    }
  };

  const registerGenerationSuccess = useCallback((label) => {
    setGenerationDone(true);
    pushActivity(label, 'success');
  }, [pushActivity]);

  const downloadPDF = async (cls = null) => {
    const key = cls ? `${cls}_dl` : 'all_dl';
    setCardLoading(key);

    try {
      const url = cls ? withTemplate(`${API}/download/all`, { class: cls }) : withTemplate(`${API}/download/all`);
      const resp = await axios.get(url, { responseType: 'blob' });
      const result = await openExternalOrBlob(resp, cls ? `ids_${selectedTemplate}_${cls}.pdf` : `ids_${selectedTemplate}_ALL.pdf`);
      registerGenerationSuccess(cls ? `Downloaded Class ${cls} PDF` : 'Downloaded all student ID cards');
      addToast(result.external ? 'PDF generated and opened from cloud storage' : 'PDF downloaded', 'success');
    } catch (error) {
      addToast(error.response?.data?.error || 'Download failed — check server', 'error');
    } finally {
      setCardLoading(null);
    }
  };

  const viewPDF = async (cls = null) => {
    const key = cls ? `${cls}_view` : 'all_view';
    setCardLoading(key);

    try {
      const url = cls ? withTemplate(`${API}/preview/all`, { class: cls }) : withTemplate(`${API}/preview/all`);
      const resp = await axios.get(url, { responseType: 'blob' });
      await openExternalOrBlob(resp, 'preview.pdf', (urlToOpen, external) => {
        setModal({
          url: urlToOpen,
          title: cls ? `Class ${cls} — Preview` : 'All Students — Preview',
          external,
        });
      });
      registerGenerationSuccess(cls ? `Previewed Class ${cls} cards` : 'Previewed all student cards');
    } catch (error) {
      addToast(error.response?.data?.error || 'Preview failed — check server', 'error');
    } finally {
      setCardLoading(null);
    }
  };

  const viewStudent = async () => {
    if (!studentClass || !studentName) {
      addToast('Select class and student name', 'error');
      return;
    }

    setStudentLoading('view');
    try {
      const resp = await axios.get(withTemplate(`${API}/preview/student`, { class: studentClass, name: studentName }), {
        responseType: 'blob',
      });
      await openExternalOrBlob(resp, 'preview_student.pdf', (urlToOpen, external) => {
        setModal({ url: urlToOpen, title: `${studentName} — Preview`, external });
      });
      registerGenerationSuccess(`Previewed individual card for ${studentName}`);
    } catch (error) {
      addToast(error.response?.data?.error || 'Preview failed', 'error');
    } finally {
      setStudentLoading(null);
    }
  };

  const downloadStudent = async () => {
    if (!studentClass || !studentName) {
      addToast('Select class and student name', 'error');
      return;
    }

    setStudentLoading('download');
    try {
      const resp = await axios.get(withTemplate(`${API}/download/student`, { class: studentClass, name: studentName }), {
        responseType: 'blob',
      });
      const result = await openExternalOrBlob(resp, `id_${selectedTemplate}_${studentName.replace(/\s+/g, '_')}.pdf`);
      registerGenerationSuccess(`Downloaded individual card for ${studentName}`);
      addToast(result.external ? 'Student card generated and opened from cloud storage' : 'Student card downloaded', 'success');
    } catch (error) {
      addToast(error.response?.data?.error || 'Download failed', 'error');
    } finally {
      setStudentLoading(null);
    }
  };

  const closeModal = () => {
    if (modal?.url && !modal?.external && modal.url.startsWith('blob:')) {
      URL.revokeObjectURL(modal.url);
    }
    setModal(null);
  };

  const confirmTemplate = () => {
    setTemplateConfirmed(true);
    setActiveStep(1);
    pushActivity(`Template selected: ${activeTemplate?.label || 'Default template'}`, 'neutral');
    addToast(`Template locked in: ${activeTemplate?.label || 'Selected template'}`, 'success');
  };

  const resetWorkflow = () => {
    setStatus(INITIAL_STATUS);
    setTemplateConfirmed(false);
    setSelectedSchool('');
    setDataSource('file');
    setStudentClass('');
    setStudentName('');
    setStudentNames([]);
    setSearchQuery('');
    setShowAdvanced(false);
    setGenerationDone(false);
    setActiveStep(0);
    pushActivity('Workflow reset for a new run', 'neutral');
    addToast('Workflow reset', 'info');
  };

  const totalClasses = (status.classes || []).length;
  const classOptions = (status.classes || []).map((cls) => ({ value: cls, label: `Class ${cls}` }));
  const visibleTemplateFields = (activeTemplate?.fields || []).slice(0, 8).join(', ');
  const filteredClasses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return status.classes || [];
    return (status.classes || []).filter((cls) => String(cls).toLowerCase().includes(query));
  }, [searchQuery, status.classes]);
  const isLargeBatch = Boolean(status.loaded) && Number(status.count || 0) > 70;
  const lastGenerated = recentActivity.find((item) => item.label.toLowerCase().includes('downloaded') || item.label.toLowerCase().includes('previewed'));

  const steps = [
    {
      title: 'Select Template',
      description: 'Choose the card layout and lock the design direction.',
      icon: BadgeCheck,
      completed: templateConfirmed,
      locked: false,
    },
    {
      title: 'Load Data',
      description: 'Upload a file or pull students from the live school API.',
      icon: FileSpreadsheet,
      completed: status.loaded,
      locked: !templateConfirmed,
    },
    {
      title: 'Generate Cards',
      description: 'Preview, filter, and export cards with one clear primary action.',
      icon: Wand2,
      completed: generationDone,
      locked: !status.loaded,
    },
  ];

  const completionCount = steps.filter((step) => step.completed).length;
  const completionPercent = Math.round((completionCount / steps.length) * 100);
  const activeStepTitle = steps[activeStep]?.title || 'Workflow';
  const nextPrimaryAction = !templateConfirmed
    ? 'Confirm a template to unlock data loading'
    : !status.loaded
      ? 'Load student data to enable generation'
      : 'Generate cards for all students or drill into a class';

  const generationProgressLabel = (() => {
    if (cardLoading === 'all_dl') return 'Generating downloadable PDF for all students';
    if (cardLoading === 'all_view') return 'Preparing preview for all students';
    if (cardLoading?.endsWith('_dl')) return `Generating Class ${cardLoading.replace('_dl', '')} PDF`;
    if (cardLoading?.endsWith('_view')) return `Preparing Class ${cardLoading.replace('_view', '')} preview`;
    if (studentLoading === 'download') return 'Generating individual student card';
    if (studentLoading === 'view') return 'Preparing individual student preview';
    return '';
  })();

  return (
    <div className="app-shell">
      <Toast toasts={toasts} removeToast={removeToast} />
      {modal && <PDFModal url={modal.url} title={modal.title} external={modal.external} onClose={closeModal} />}

      <header className="hero-card">
        <div className="hero-copy">
          <div className="hero-topline">
            <div className="eyebrow">
              <Sparkles size={14} /> Premium workflow
            </div>
            <div className="hero-meta-pills">
              <span className="hero-meta-pill">
                <School size={14} /> {status.school_name || 'Multi-school ready'}
              </span>
              <span className="hero-meta-pill subtle">
                <BadgeCheck size={14} /> {activeTemplate?.label || 'Template pending'}
              </span>
            </div>
          </div>

          <div className="hero-heading-group">
            <h1>Generate premium student ID cards with a guided SaaS workflow.</h1>
            <p>
              A clean, production-ready control center for template selection, student data loading,
              and polished PDF exports — with one focused action at every stage.
            </p>
          </div>

          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => (status.loaded ? downloadPDF(null) : setActiveStep(templateConfirmed ? 1 : 0))}>
              {status.loaded ? <><Download size={16} /> Generate all cards</> : <><ChevronRight size={16} /> Start workflow</>}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => setActiveStep(templateConfirmed ? 1 : 0)}>
              <Upload size={16} /> Upload data
            </button>
          </div>

          <div className="hero-utility-grid">
            <div className="hero-utility-card">
              <span className="hero-utility-label">Current focus</span>
              <strong>{activeStepTitle}</strong>
              <span>{nextPrimaryAction}</span>
            </div>
            <div className="hero-utility-card">
              <span className="hero-utility-label">Quick action</span>
              <strong>{status.loaded ? 'Generate batch' : 'Load students'}</strong>
              <span>{status.loaded ? `${status.count} students are ready for export` : 'Complete the first two steps to unlock generation'}</span>
            </div>
            <div className="hero-utility-card">
              <span className="hero-utility-label">Session</span>
              <strong>{status.session || 'Awaiting source'}</strong>
              <span>{status.source === 'api' ? 'Connected to live API' : status.source === 'file' ? 'Spreadsheet import ready' : 'Choose file upload or API sync'}</span>
            </div>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-status-card glass-panel">
            <div className="hero-status-head">
              <div>
                <div className="panel-kicker">System status</div>
                <strong>Control center health</strong>
              </div>
              <div className={`backend-pill ${backendOk === true ? 'ok' : backendOk === false ? 'err' : 'checking'}`}>
                {backendOk === true && <><span className="status-dot" /> Connected</>}
                {backendOk === false && <><AlertCircle size={14} /> Offline</>}
                {backendOk === null && <><span className="status-dot pulse" /> Checking</>}
              </div>
            </div>

            <div className="hero-progress-card">
              <div className="hero-progress-copy">
                <div>
                  <div className="panel-kicker">Workflow completion</div>
                  <strong>{completionPercent}% complete</strong>
                </div>
                <span className="panel-badge">{completionCount}/3 steps</span>
              </div>
              <div className="hero-progress-track" aria-hidden="true">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </div>

            <div className="hero-status-list">
              <div>
                <span>Current template</span>
                <strong>{activeTemplate?.label || '—'}</strong>
              </div>
              <div>
                <span>Data source</span>
                <strong>{status.loaded ? (status.source === 'api' ? 'Live API' : 'Uploaded file') : 'Not loaded'}</strong>
              </div>
              <div>
                <span>Last generated</span>
                <strong>{lastGenerated ? formatTimeAgo(lastGenerated.date) : 'No exports yet'}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard icon={Users} label="Students" value={status.loaded ? status.count : '—'} hint={status.loaded ? 'Ready for generation' : 'Load data to unlock'} tone="primary" />
        <StatCard icon={BookOpen} label="Classes" value={status.loaded ? totalClasses : '—'} hint={status.loaded ? 'Grouped for batch export' : 'Waiting for data'} tone="indigo" />
        <StatCard icon={Calendar} label="Session" value={status.loaded ? status.session : '—'} hint="Auto-detected from source" tone="emerald" />
        <StatCard icon={status.source === 'api' ? Wifi : HardDrive} label="Source" value={status.loaded ? (status.source === 'api' ? 'API' : 'File') : '—'} hint={status.school_name || 'Choose file or API'} tone="slate" />
      </section>

      <main className="workflow-layout">
        <aside className="sidebar-stack">
          <section className="glass-panel sidebar-panel">
            <div className="panel-head">
              <div>
                <div className="panel-kicker">Workflow</div>
                <h2>3-step generator</h2>
              </div>
              <span className="panel-badge">Guided</span>
            </div>

            <div className="stepper-list">
              {steps.map((step, index) => (
                <StepperItem
                  key={step.title}
                  step={step}
                  index={index}
                  isActive={activeStep === index}
                  isCompleted={step.completed}
                  isLocked={step.locked}
                  onClick={() => !step.locked && setActiveStep(index)}
                />
              ))}
            </div>
          </section>

          <section className="glass-panel sidebar-panel">
            <div className="panel-head compact">
              <div>
                <div className="panel-kicker">Recent activity</div>
                <h3>Latest actions</h3>
              </div>
              <Clock3 size={16} className="subtle-icon" />
            </div>

            {recentActivity.length ? (
              <div className="activity-list">
                {recentActivity.map((item) => (
                  <div key={item.id} className={`activity-item tone-${item.tone}`}>
                    <div className="activity-dot" />
                    <div>
                      <div className="activity-label">{item.label}</div>
                      <div className="activity-time">{formatTimeAgo(item.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-mini">
                Your workflow milestones will appear here as you progress.
              </div>
            )}
          </section>
        </aside>

        <section className="workflow-main">
          <article
            ref={(node) => { stepRefs.current[0] = node; }}
            className={`workflow-card ${activeStep === 0 ? 'expanded' : 'collapsed'} ${templateConfirmed ? 'completed' : ''}`}
          >
            <button className="workflow-header" onClick={() => setActiveStep(0)}>
              <div className="workflow-header-left">
                <div className="workflow-index">01</div>
                <div>
                  <div className="workflow-title-row">
                    <h2>Select Template</h2>
                    {templateConfirmed && <span className="success-chip"><CheckCircle2 size={14} /> Complete</span>}
                  </div>
                  <p>Choose one premium card style. Keep the decision lightweight and proceed.</p>
                </div>
              </div>
              <div className="workflow-header-right">
                <span className="workflow-caption">{activeTemplate?.label || 'No template'}</span>
                <ChevronRight size={18} className={`workflow-chevron ${activeStep === 0 ? 'open' : ''}`} />
              </div>
            </button>

            {activeStep === 0 && (
              <div className="workflow-body">
                <div className="template-grid">
                  {loadingTemplates
                    ? Array.from({ length: 3 }).map((_, index) => <TemplateSkeleton key={index} />)
                    : templates.map((template) => (
                      <TemplateCard
                        key={template.key}
                        template={template}
                        selected={selectedTemplate === template.key}
                        onSelect={setSelectedTemplate}
                      />
                    ))}
                </div>

                <div className="info-banner">
                  <div className="info-banner-icon"><ShieldCheck size={16} /></div>
                  <div>
                    <strong>Active layout: {activeTemplate?.display_name || '—'}</strong>
                    <p>Supported fields: <code>{visibleTemplateFields || 'student_name, class, father_name, dob, address, mobile, session'}</code></p>
                  </div>
                </div>

                <div className="section-actions">
                  <button className="btn btn-primary btn-lg" onClick={confirmTemplate}>
                    <ChevronRight size={16} /> Continue with {activeTemplate?.label || 'template'}
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => setActiveStep(1)} disabled={!selectedTemplate}>
                    Review next step
                  </button>
                </div>
              </div>
            )}
          </article>

          <article
            ref={(node) => { stepRefs.current[1] = node; }}
            className={`workflow-card ${activeStep === 1 ? 'expanded' : 'collapsed'} ${status.loaded ? 'completed' : ''} ${!templateConfirmed ? 'locked-card' : ''}`}
          >
            <button className="workflow-header" onClick={() => templateConfirmed && setActiveStep(1)} disabled={!templateConfirmed}>
              <div className="workflow-header-left">
                <div className="workflow-index">02</div>
                <div>
                  <div className="workflow-title-row">
                    <h2>Load Data</h2>
                    {status.loaded && <span className="success-chip"><CheckCircle2 size={14} /> Complete</span>}
                  </div>
                  <p>Import student records from a spreadsheet or connect directly to the school API.</p>
                </div>
              </div>
              <div className="workflow-header-right">
                <span className="workflow-caption">{status.loaded ? `${status.count} students loaded` : 'Pending data'}</span>
                <ChevronRight size={18} className={`workflow-chevron ${activeStep === 1 ? 'open' : ''}`} />
              </div>
            </button>

            {activeStep === 1 && templateConfirmed && (
              <div className="workflow-body">
                <div className="source-switch">
                  <button className={`source-pill ${dataSource === 'file' ? 'active' : ''}`} onClick={() => setDataSource('file')}>
                    <FileSpreadsheet size={15} /> Upload file
                  </button>
                  <button className={`source-pill ${dataSource === 'api' ? 'active' : ''}`} onClick={() => setDataSource('api')}>
                    <Globe size={15} /> Live API
                  </button>
                </div>

                {dataSource === 'file' && (
                  <div className="load-panel">
                    <div
                      className={`dropzone ${dragOver ? 'drag-over' : ''} ${uploadingFile ? 'uploading' : ''}`}
                      onClick={() => !uploadingFile && fileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                    >
                      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleFile(e.target.files[0])} />
                      {uploadingFile ? (
                        <div className="dropzone-state">
                          <Loader2 size={34} className="spin-icon" />
                          <div className="dropzone-title">Parsing student data<LoadingDots /></div>
                          <div className="dropzone-subtitle">Preparing class groups, counts, and metadata for generation.</div>
                        </div>
                      ) : (
                        <div className="dropzone-state">
                          <div className="dropzone-icon"><Upload size={24} /></div>
                          <div className="dropzone-title">Drop your spreadsheet here</div>
                          <div className="dropzone-subtitle">Accepts Excel (.xlsx, .xls) and CSV (.csv) files.</div>
                          <div className="dropzone-note">
                            Recommended columns: <code>student_name, class, section, roll_no, father_name, mother_name, dob, address, mobile, adm_no, blood_group, photo_url, session</code>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dataSource === 'api' && (
                  <div className="load-panel api-panel">
                    <div className="field-row two-up">
                      <div className="form-group">
                        <label className="form-label">School</label>
                        <div className="custom-select">
                          <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
                            <option value="">Choose a school…</option>
                            {schools.map((school) => (
                              <option key={school.id} value={school.id}>{school.name}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="select-arrow" />
                        </div>
                      </div>

                      <button className="btn btn-primary btn-lg api-fetch-btn" onClick={fetchFromAPI} disabled={fetchingAPI || !selectedSchool}>
                        {fetchingAPI ? <><span className="btn-spinner" /> Fetching<LoadingDots /></> : <><RefreshCw size={15} /> Load students</>}
                      </button>
                    </div>

                    <div className="api-hint">
                      <Building2 size={14} /> Pulls live student data for the selected school while keeping the chosen card template unchanged.
                    </div>
                  </div>
                )}

                {status.loaded && (
                  <div className="load-success-card">
                    <div className="load-success-icon"><CheckCircle2 size={18} /></div>
                    <div>
                      <strong>{status.count} students loaded successfully</strong>
                      <p>{totalClasses} classes · {status.session || 'Session detected'} · {status.school_name || 'Uploaded file'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>

          <article
            ref={(node) => { stepRefs.current[2] = node; }}
            className={`workflow-card ${activeStep === 2 ? 'expanded' : 'collapsed'} ${generationDone ? 'completed' : ''} ${!status.loaded ? 'locked-card' : ''}`}
          >
            <button className="workflow-header" onClick={() => status.loaded && setActiveStep(2)} disabled={!status.loaded}>
              <div className="workflow-header-left">
                <div className="workflow-index">03</div>
                <div>
                  <div className="workflow-title-row">
                    <h2>Generate Cards</h2>
                    {generationDone && <span className="success-chip"><CheckCircle2 size={14} /> Completed</span>}
                  </div>
                  <p>Use a single clear call-to-action, then reveal filters and individual controls only when needed.</p>
                </div>
              </div>
              <div className="workflow-header-right">
                <span className="workflow-caption">{status.loaded ? `${totalClasses} classes ready` : 'Locked until data loads'}</span>
                <ChevronRight size={18} className={`workflow-chevron ${activeStep === 2 ? 'open' : ''}`} />
              </div>
            </button>

            {activeStep === 2 && status.loaded && (
              <div className="workflow-body">
                <div className="generation-hero">
                  <div>
                    <div className="panel-kicker">Primary action</div>
                    <h3>Generate all student ID cards</h3>
                    <p>Export the full batch using the selected template, or open a lightweight preview first.</p>
                  </div>
                  <div className="generation-actions">
                    <button className="btn btn-primary btn-lg" onClick={() => downloadPDF(null)} disabled={!!cardLoading || !!studentLoading}>
                      {cardLoading === 'all_dl' ? <><span className="btn-spinner" /> Generating PDF…</> : <><Download size={16} /> Download all</>}
                    </button>
                    <button className="btn btn-secondary btn-lg" onClick={() => viewPDF(null)} disabled={!!cardLoading || !!studentLoading}>
                      {cardLoading === 'all_view' ? <><span className="btn-spinner dark" /> Preparing preview…</> : <><Eye size={16} /> Preview all</>}
                    </button>
                  </div>
                </div>

                {(generationProgressLabel || isLargeBatch) && (
                  <div className="status-banner">
                    {generationProgressLabel ? <Loader2 size={16} className="spin-icon" /> : <AlertCircle size={16} />}
                    <span>{generationProgressLabel || 'Large batch detected. Preview mode keeps heavier jobs lighter and more reliable.'}</span>
                  </div>
                )}

                <div className="tools-bar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter classes"
                    />
                  </div>

                  <button className="btn btn-secondary" onClick={() => setShowAdvanced((prev) => !prev)}>
                    <Filter size={15} /> {showAdvanced ? 'Hide more settings' : 'More settings'}
                  </button>
                  <button className="btn btn-tertiary" onClick={resetWorkflow}>
                    <RotateCcw size={15} /> Reset
                  </button>
                </div>

                <div className="generation-metrics">
                  <div className="generation-metric-card">
                    <span className="hero-utility-label">Template</span>
                    <strong>{activeTemplate?.label || '—'}</strong>
                    <span>{activeTemplate?.display_name || 'Selected layout'}</span>
                  </div>
                  <div className="generation-metric-card">
                    <span className="hero-utility-label">Classes ready</span>
                    <strong>{totalClasses}</strong>
                    <span>{filteredClasses.length === totalClasses ? 'All classes visible' : `${filteredClasses.length} filtered results`}</span>
                  </div>
                  <div className="generation-metric-card">
                    <span className="hero-utility-label">Data source</span>
                    <strong>{status.source === 'api' ? 'Live API' : 'Spreadsheet'}</strong>
                    <span>{status.school_name || 'Imported dataset'}</span>
                  </div>
                </div>

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
                    <div className="empty-state compact-empty">
                      <div className="empty-icon"><Search size={24} /></div>
                      <p>No classes match your filter.</p>
                    </div>
                  )}
                </div>

                {showAdvanced && (
                  <div className="advanced-panel">
                    <div className="advanced-head">
                      <div>
                        <div className="panel-kicker">Advanced options</div>
                        <h4>Generate an individual student card</h4>
                      </div>
                      <span className="panel-badge muted">Secondary action</span>
                    </div>

                    <div className="field-row student-grid">
                      <div className="form-group">
                        <label className="form-label">Class</label>
                        <Select
                          value={studentClass}
                          onChange={(value) => {
                            setStudentClass(value);
                            setStudentName('');
                          }}
                          options={classOptions}
                          placeholder="Select class"
                          disabled={!status.loaded}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Student name</label>
                        <div className="custom-select">
                          <select
                            value={studentName}
                            onChange={(e) => setStudentName(e.target.value)}
                            disabled={!studentClass || studentNames.length === 0}
                          >
                            <option value="">
                              {!studentClass ? 'Select class first' : studentNames.length === 0 ? 'No students found' : 'Choose student…'}
                            </option>
                            {studentNames.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="select-arrow" />
                        </div>
                      </div>
                    </div>

                    <div className="section-actions">
                      <button className="btn btn-secondary btn-lg" onClick={viewStudent} disabled={!studentName || !!studentLoading}>
                        {studentLoading === 'view' ? <><span className="btn-spinner dark" /> Loading…</> : <><Eye size={16} /> Preview student</>}
                      </button>
                      <button className="btn btn-primary btn-lg" onClick={downloadStudent} disabled={!studentName || !!studentLoading}>
                        {studentLoading === 'download' ? <><span className="btn-spinner" /> Generating…</> : <><Download size={16} /> Download student</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
