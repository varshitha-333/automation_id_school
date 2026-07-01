# Modular ID Card Generator Backend

This document explains the structure of the modularized ID Card Generator backend, how its components interact, and how to extend the system to support new schools, students, and employees.

---

## 📁 Directory Structure

```text
D:\titus\railway_id\
├── app.py                     # Root entrypoint (lightweight wrapper)
├── sessions.db                # SQLite session database
├── font/                      # Font asset directory
│   ├── Anton-Regular.ttf
│   └── arialbd.ttf
├── src/
│   ├── __init__.py
│   ├── app.py                 # Flask App Factory and Middleware
│   ├── config.py              # Constants, Paths, and Template configs
│   ├── database.py            # SQLite session management database layer
│   ├── jobs.py                # CPU-sampling, Thread Pools, and file deletion lifecycles
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── pdf.py             # Page building, pikepdf downgrade, compression, fallbacks
│   │   ├── photo.py           # Photo prefetching, resizing, aspect cover/contain crop
│   │   └── text.py            # Text sizing, ellipses, wrapping, baseline alignments
│   ├── renderers/
│   │   ├── __init__.py
│   │   ├── base.py            # Overlay drawing manager, dispatcher and cache
│   │   ├── hebron/
│   │   │   ├── student.py     # Hebron student card overlay
│   │   │   └── employee.py    # Hebron employee per-card layout
│   │   ├── redeemer/
│   │   │   ├── student.py     # Redeemer student card overlay & per-card layout
│   │   │   └── employee.py    # Redeemer employee per-card layout
│   │   ├── priyanka/
│   │   │   ├── student.py     # Priyanka student per-card layout
│   │   │   └── employee.py    # Priyanka employee per-card layout
│   │   └── ab_ascent/
│   │       ├── student.py     # Ab Ascent student per-card layout
│   │       └── employee.py    # Ab Ascent employee per-card layout
│   └── routes/
│       ├── __init__.py
│       ├── auth.py            # login, logout, clear-sessions, session-info
│       ├── students.py        # upload, list, status, preview, download
│       ├── employees.py       # upload, list, status, preview, download, zip-jobs
│       ├── templates.py       # template configurations, preview-png/svg
│       ├── jobs.py            # progress, file delivery, cancel
│       └── system.py          # health check, stats
```

---

## ⚙️ How Components Interact

1. **Routing Layer (`src/routes/`)**: Receives requests from the client. Blueprints are isolated by functionality (auth, templates, students, employees, background jobs, system).
2. **Business / Job Layer (`src/jobs.py` & `src/utils/pdf.py`)**: For long-running PDF downloads, endpoints kick off asynchronous threads (`run_job` or `run_zip_job`) and return a `job_id` immediately. The worker threads download photos, compile PDFs on disk, and cleanup files after serving.
3. **Rendering Layer (`src/renderers/`)**:
   - Overlay Renderers (Hebron student, Redeemer student) draw text and insert images directly onto the template PDF.
   - Per-Card Renderers (all employees, Priyanka student, Ab Ascent student) build the card from scratch page-by-page as a standalone 55×86 mm PDF, then place them onto A4 sheets.
4. **Utility Layer (`src/utils/`)**: Holds math calculations, PIL scaling, text fitting/ellipsizing, and background threads.

---

## ➕ How to Add a New School

Adding a new school involves four steps: updating configs, preparing templates, writing renderers, and registering dispatch hooks.

### Step 1: Place the Template PDFs and Fonts
Put the physical template PDF files (A4-sheet or ID-card size) in the backend root directory (e.g. `template_myschool.pdf` and `template_myschool_emp.pdf`). If the school uses custom fonts, place them in the `font/` directory.

### Step 2: Configure the School in `src/config.py`
Add the school key, label, and expected fields under `TEMPLATE_CONFIGS` in `src/config.py`:

```python
# In src/config.py

# 1. Update SCHOOLS mapping (if using school selection API)
SCHOOLS[5] = "My School"

# 2. Register templates in TEMPLATE_CONFIGS
TEMPLATE_CONFIGS["myschool"] = {
    "key": "myschool",
    "label": "My School (Students)",
    "display_name": "My School",
    "description": "Standard student template",
    "pdf": BASE_DIR / "template_myschool.pdf",
    "fields": ["student_name", "class", "section", "roll", "dob", "address", "mobile", "photo_url"],
}

TEMPLATE_CONFIGS["myschool_emp"] = {
    "key": "myschool_emp",
    "label": "My School (Employees)",
    "display_name": "My School Employees",
    "description": "Standard employee card template",
    "pdf": BASE_DIR / "template_myschool_emp.pdf",
    "fields": ["employee_name", "designation", "emp_id", "dob", "address", "mobile", "photo_url"],
}

# 3. Add to sets
STUDENT_TEMPLATE_KEYS.add("myschool")
EMPLOYEE_TEMPLATE_KEYS.add("myschool_emp")
```

### Step 3: Write the Renderers in `src/renderers/`
Create a directory for your school under `src/renderers/myschool/` with `__init__.py`, `student.py`, and `employee.py`.

#### Writing a Student Overlay (`src/renderers/myschool/student.py`)
If you just want to overwrite/overlay data fields on the base PDF sheet:

```python
import fitz
from src.utils.text import ensure_fonts, draw_text_vertically_centered, _tr_rect, _tr_point
from src.utils.photo import prepare_photo_for_rect_cover, fetch_photo_bytes, insert_image_safe

def draw_card_overlay_myschool(page, student: dict, tr):
    anton_obj, bold_obj, anton_fn, bold_fn, fn_anton, fn_bold = ensure_fonts()
    if bold_obj is None:
        return

    # Draw photo
    photo_rect = _tr_rect(tr, (10.0, 20.0, 40.0, 60.0))  # specify coords in mm
    photo_bytes = fetch_photo_bytes(student.get("photo_url", ""))
    if photo_bytes:
        prepared = prepare_photo_for_rect_cover(photo_bytes, (photo_rect.x0, photo_rect.y0, photo_rect.x1, photo_rect.y1))
        insert_image_safe(page, photo_rect, prepared)

    # Draw name
    name_rect = _tr_rect(tr, (10.0, 65.0, 50.0, 72.0))
    name = str(student.get("student_name", "")).upper()
    draw_text_vertically_centered(page, name_rect, name, bold_fn, fn_bold, bold_obj, 8.0, (0.0, 0.0, 0.0))
```

#### Writing an Employee Per-Card Renderer (`src/renderers/myschool/employee.py`)
If you want to construct the 55×86 mm card page by page (for ZIP extraction and pixel perfection):

```python
import io
import fitz
from src.utils.text import ensure_fonts, clean_card_value, _fit_size, _centered_baseline_for_box, _emp_value
from src.utils.photo import fetch_photo_bytes, prepare_photo_for_rect_cover, insert_image_safe
from src.utils.pdf import _PDF_SAVE_OPTS

def _render_myschool_emp_card_bytes(student: dict, tmpl_bytes: bytes):
    doc = fitz.open("pdf", tmpl_bytes)
    page = doc[0]
    
    anton_obj, bold_obj, anton_fn, bold_fn, fn_anton, fn_bold = ensure_fonts()
    if bold_obj is None:
        doc.close()
        return None

    # Redact template placeholders
    page.draw_rect(fitz.Rect(10, 65, 50, 72), color=(1, 1, 1), fill=(1, 1, 1), width=0, overlay=True)
    page.add_redact_annot(fitz.Rect(10, 65, 50, 72), fill=None)
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    # Insert employee details
    name = _emp_value(student, "employee_name", "student_name", upper=True)
    page.insert_text((10, 70), name, fontname=fn_bold, fontfile=bold_fn, fontsize=8.0, color=(0,0,0), overlay=True)

    buf = io.BytesIO()
    doc.save(buf, **_PDF_SAVE_OPTS)
    doc.close()
    return buf.getvalue()
```

### Step 4: Register the Renderers in `src/renderers/base.py`
Import your renderers and add them to the dispatcher maps inside `src/renderers/base.py`:

```python
# In src/renderers/base.py

from src.renderers.myschool.student import draw_card_overlay_myschool
from src.renderers.myschool.employee import _render_myschool_emp_card_bytes

# Register employee card renderer in EMP_CARD_RENDERERS
EMP_CARD_RENDERERS["myschool_emp"] = _render_myschool_emp_card_bytes

# Register student card dispatcher in draw_card_on_page
def draw_card_on_page(page, student, target_rect, template_key, template_doc, template_source_rect):
    if template_key in EMP_CARD_RENDERERS:
        # (calls per-card renderer and places it on A4 sheet)
        ...
        return

    # Draw base card template
    page.show_pdf_page(target_rect, template_doc, 0, keep_proportion=False, overlay=True)
    tr = _make_card_transform(template_source_rect, target_rect)
    rk = _resolve_renderer_key(template_key)

    # Dispatch to custom overlay drawing
    if rk == "myschool":
        draw_card_overlay_myschool(page, student, tr)
    elif rk == "redeemer":
        draw_card_overlay_redeemer(page, student, tr)
    else:
        draw_card_overlay_hebron(page, student, tr)
```

Now, restart the server and compile the PDF templates. The system will automatically serve My School!
