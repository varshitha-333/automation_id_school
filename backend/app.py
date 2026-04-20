"""
ID Card Generator - Flask Backend v1.0
Serves student data from Excel/CSV or API, generates PDF ID cards.
"""

import io
import os
import sys
import json
import math
import base64
import tempfile
import requests
from pathlib import Path
from collections import defaultdict
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd

# ── Try importing PDF/image libs ─────────────────────────────────
try:
    import fitz
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

try:
    from PIL import Image, ImageOps, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, 
     origins=["*"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     supports_credentials=True,
     expose_headers=["Content-Disposition", "Content-Type"])

BASE_DIR     = Path(__file__).parent
TEMPLATE_PDF = BASE_DIR / "template_id_card.pdf"
ANTON_FONT   = BASE_DIR / "Anton-Regular.ttf"
ARIAL_BOLD   = BASE_DIR / "arialbd.ttf"
FALLBACK_PHOTO = BASE_DIR / "student_photo.jpg"

DEFAULT_SESSION = "2026-27"

# ── School registry ───────────────────────────────────────────────
SCHOOLS = {
    2: "My Redeemer Mission School",
    3: "Hebron Mission School",
    4: "Priyanka Dreamnest School",
    5: "Ab Ascent School",
}

API_BASE_URL = "https://titusattendence.com/apikey/apistudents?school_id={school_id}"

CLASS_ORDER = {
    "NURSERY": 0, "LKG": 1, "UKG": 2,
    "1ST": 3, "2ND": 4, "3RD": 5, "4TH": 6,
    "5TH": 7, "6TH": 8, "7TH": 9, "8TH": 10,
}

def class_sort_key(cls_str):
    return CLASS_ORDER.get(str(cls_str).strip().upper(), 99)

# ── In-memory student store ───────────────────────────────────────
_store = {"students": [], "source": None, "school_name": None}

# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────
def norm_key(v):
    s = str(v or "").strip().lower()
    out = []; prev = False
    for ch in s:
        if ch.isalnum(): out.append(ch); prev = False
        else:
            if not prev: out.append("_"); prev = True
    return "".join(out).strip("_")

def clean_str(v):
    if pd.isna(v): return ""
    s = str(v).strip()
    return "" if s.lower() in {"nan","none"} else s

def pick(row, *aliases, default=""):
    for a in aliases:
        if a in row:
            val = clean_str(row[a])
            if val: return val
    return default

def _sort_and_index(students):
    students.sort(key=lambda s: (
        class_sort_key(s.get("class","")),
        s.get("section","").strip().upper(),
        s.get("student_name","").strip().upper()
    ))
    for i, s in enumerate(students, 1):
        s["serial"] = i
    counters = defaultdict(int)
    for s in students:
        key = (s["class"].strip().upper(), s["section"].strip().upper())
        if not s["roll"]:
            counters[key] += 1; s["roll"] = str(counters[key])
        else:
            try:
                cr = int(float(s["roll"])); counters[key] = max(counters[key], cr); s["roll"] = str(cr)
            except: pass
    return students

# ── Excel / CSV parser ────────────────────────────────────────────
def parse_file(file_bytes, filename):
    fn = filename.lower()
    if fn.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        df = pd.read_excel(io.BytesIO(file_bytes))
    df.columns = [norm_key(c) for c in df.columns]
    students = []
    for _, row in df.iterrows():
        rm = {col: row[col] for col in df.columns}
        s = {
            "student_name": pick(rm,"student_name","studentname","name","student"),
            "class":        pick(rm,"class","class_name","std","standard"),
            "section":      pick(rm,"section","sec","section_id"),
            "roll":         pick(rm,"roll","roll_no","rollno","roll_number"),
            "father_name":  pick(rm,"father_name","father","fathers_name"),
            "mother_name":  pick(rm,"mother_name","mother","mothers_name"),
            "dob":          pick(rm,"dob","date_of_birth","birth_date"),
            "address":      pick(rm,"address","student_address","residence"),
            "mobile":       pick(rm,"mobile","phone","mobile_no","contact","father_contact"),
            "photo_url":    pick(rm,"photo_url","photo","image_url","photo_link","student_photo"),
            "adm_no":       pick(rm,"adm_no","admission_no","admission_number","adm","admno"),
            "blood_group":  pick(rm,"blood_group","bloodgroup","blood"),
            "gender":       pick(rm,"gender","sex"),
            "session":      pick(rm,"session",default=DEFAULT_SESSION),
        }
        if any(s.values()): students.append(s)
    return _sort_and_index(students)

# ── API field map ─────────────────────────────────────────────────
_API_MAP = {
    "student_name":"student_name","admission_no":"adm_no","section_id":"section",
    "dob":"dob","roll_number":"roll","mother_name":"mother_name","address":"address",
    "blood_group":"blood_group","class_name":"class","father_name":"father_name",
    "father_contact":"mobile","student_photo":"photo_url","session":"session",
    "academic_year":"session","name":"student_name","std":"class","grade":"class",
    "section":"section","roll":"roll","roll_no":"roll","father":"father_name",
    "mother":"mother_name","date_of_birth":"dob","student_address":"address",
    "mobile":"mobile","phone":"mobile","mobile_no":"mobile","contact":"mobile",
    "photo_url":"photo_url","photo":"photo_url","adm_no":"adm_no",
    "admission_number":"adm_no","adm":"adm_no","bloodgroup":"blood_group",
    "blood":"blood_group","gender":"gender","sex":"gender",
}

def map_api_record(record):
    out = {
        "student_name":"","class":"","section":"","roll":"","father_name":"",
        "mother_name":"","dob":"","address":"","mobile":"","photo_url":"",
        "adm_no":"","blood_group":"","gender":"","session":DEFAULT_SESSION,
    }
    for k, v in record.items():
        internal = _API_MAP.get(k.strip().lower())
        if internal and v not in (None,"","null","NULL"):
            out[internal] = str(v).strip()
    return out

# ─────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────

# Health check endpoints for Render
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "message": "ID Card Generator API is running"})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "ID Card Generator API is healthy"})

@app.route("/api/schools", methods=["GET"])
def get_schools():
    return jsonify([{"id": k, "name": v} for k, v in SCHOOLS.items()])

@app.route("/api/upload", methods=["POST"])
def upload_file():
    print(f"DEBUG: Upload endpoint called")
    if "file" not in request.files:
        print(f"DEBUG: No file in request")
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    print(f"DEBUG: File received: {f.filename}")
    try:
        file_content = f.read()
        print(f"DEBUG: File size: {len(file_content)} bytes")
        students = parse_file(file_content, f.filename)
        print(f"DEBUG: Parsed {len(students)} students")
        if students:
            print(f"DEBUG: First student: {students[0]}")
        _store["students"] = students
        _store["source"] = "file"
        _store["school_name"] = "Uploaded File"
        print(f"DEBUG: Students stored in _store")
        return jsonify({
            "success": True,
            "count": len(students),
            "classes": _classes_summary(students),
            "session": students[0].get("session", DEFAULT_SESSION) if students else DEFAULT_SESSION,
        })
    except Exception as e:
        print(f"DEBUG: Upload error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/fetch-school/<int:school_id>", methods=["GET"])
def fetch_school(school_id):
    if school_id not in SCHOOLS:
        return jsonify({"error": "Unknown school"}), 400
    url = API_BASE_URL.format(school_id=school_id)
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        return jsonify({"error": f"API error: {e}"}), 500

    records = None
    if isinstance(payload, list): records = payload
    elif isinstance(payload, dict):
        for key in ("data","students","records","result","results","items"):
            if key in payload and isinstance(payload[key], list):
                records = payload[key]; break
        if records is None:
            for v in payload.values():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    records = v; break

    if not records:
        return jsonify({"error": "No student records found in API response"}), 500

    students = [map_api_record(r) for r in records if isinstance(r, dict)]
    students = [s for s in students if any(v for v in s.values() if v and v != DEFAULT_SESSION)]
    if not students:
        return jsonify({"error": "No valid students after mapping"}), 500

    students = _sort_and_index(students)
    _store["students"] = students
    _store["source"] = "api"
    _store["school_name"] = SCHOOLS[school_id]
    return jsonify({
        "success": True,
        "count": len(students),
        "school": SCHOOLS[school_id],
        "classes": _classes_summary(students),
        "session": students[0].get("session", DEFAULT_SESSION) if students else DEFAULT_SESSION,
    })

@app.route("/api/students", methods=["GET"])
def get_students():
    cls = request.args.get("class","").strip().upper()
    students = _store["students"]
    if cls:
        students = [s for s in students if s.get("class","").strip().upper() == cls]
    return jsonify(students)

@app.route("/api/status", methods=["GET"])
def get_status():
    students = _store["students"]
    if not students:
        return jsonify({"loaded": False})
    cls_list = sorted(set(s.get("class","").strip().upper() for s in students), key=class_sort_key)
    session_val = students[0].get("session", DEFAULT_SESSION) if students else DEFAULT_SESSION
    return jsonify({
        "loaded": True,
        "count": len(students),
        "classes": cls_list,
        "session": session_val,
        "source": _store["source"],
        "school_name": _store["school_name"],
    })

def _classes_summary(students):
    cc = defaultdict(int)
    for s in students: cc[s.get("class","").strip().upper()] += 1
    return [{"class": k, "count": v} for k, v in sorted(cc.items(), key=lambda x: class_sort_key(x[0]))]

# ─────────────────────────────────────────────────────────────────
# PDF GENERATION
# ─────────────────────────────────────────────────────────────────

# Card layout constants (pt space, 153×243 card)
CARD_W_MM = 55.0; CARD_H_MM = 86.0
A4_W_MM = 297.0; A4_H_MM = 210.0
COLS = 5; ROWS = 2; CARDS_PER_PAGE = COLS * ROWS
ROW_GAP_MM = 10.0
GRID_W_MM = COLS * CARD_W_MM
GRID_H_MM = ROWS * CARD_H_MM + (ROWS - 1) * ROW_GAP_MM
OFFSET_X_MM = (A4_W_MM - GRID_W_MM) / 2.0
OFFSET_Y_MM = (A4_H_MM - GRID_H_MM) / 2.0
MM_TO_PT = 72.0 / 25.4
PT_PER_INCH = 72.0

PHOTO_RECT_COORDS = (54.25, 67.74, 98.82, 119.07)
BAND_Y0 = 123.8; BAND_Y1 = 151.0
NAME_TEXT_RECT_COORDS  = (13.0, 124.7, 112.0, 139.2)
CLASS_TEXT_RECT_COORDS = (13.0, 139.7, 112.0, 147.0)
SIGN_SAFE_X1 = 118.0
ADM_WHITEOUT_COORDS   = (18.0, 107.0, 48.0, 116.5)
ADM_VALUE_RECT_COORDS = (18.51, 107.56, 48.0, 115.5)
SESSION_WHITEOUT_COORDS   = (109.15, 107.5, 142.0, 118.5)
SESSION_VALUE_RECT_COORDS = (109.15, 108.0, 142.0, 118.5)
BLOOD_RED = (0.8549, 0.0627, 0.0627)
BLOOD_VALUE_RECT_COORDS = (112.0, 84.5, 129.0, 97.5)
FATHER_VALUE_RECT_COORDS  = (66.3, 154.4, 148.0, 160.6)
MOTHER_VALUE_RECT_COORDS  = (66.3, 162.2, 148.0, 168.3)
DOB_VALUE_RECT_COORDS     = (66.3, 168.8, 148.0, 174.9)
ADDRESS_VALUE_RECT_COORDS = (66.3, 175.4, SIGN_SAFE_X1, 187.0)
MOBILE_VALUE_RECT_COORDS  = (66.3, 191.1, SIGN_SAFE_X1, 197.2)
FATHER_CLEAN_COORDS  = (66.3, 153.8, 149.0, 161.2)
MOTHER_CLEAN_COORDS  = (66.3, 161.5, 149.0, 169.0)
DOB_CLEAN_COORDS     = (66.3, 168.0, 149.0, 175.5)
ADDRESS_CLEAN_COORDS = (66.3, 174.8, SIGN_SAFE_X1, 188.0)
MOBILE_CLEAN_COORDS  = (66.3, 190.5, 113.0, 198.0)

BANNER_RED = (0.7843, 0.0667, 0.0667)
WHITE = (1.0, 1.0, 1.0)
NAME_COLOR = (1.0, 1.0, 1.0)
VALUE_COLOR = (170/255, 16/255, 16/255)

NAME_FONT_SIZE = 9.9; CLASS_FONT_SIZE = 5.9; VALUE_FONT_SIZE = 5.5
ADM_FONT_SIZE = 6.5; SESSION_FONT_SIZE = 7.5; BLOOD_FONT_SIZE = 6.88
ADDR_MAX_LINES = 3; ADDR_LINE_GAP = 1.10; ADDR_MIN_SIZE = 3.5
ADDR_SIZE_STEPS = [5.5, 5.2, 5.0, 4.8, 4.5, 4.2, 4.0, 3.8, 3.5]

TEARDROP_ITEMS = [
    ('l', (126.74588, 84.57169), (119.56597, 72.82723)),
    ('l', (119.56597, 72.82723), (112.91280, 84.49141)),
    ('c', (112.91280, 84.49141),(111.36359, 86.96311),(111.22838, 90.17703),(112.85576, 92.83886)),
    ('c', (112.85576, 92.83886),(115.16902, 96.62247),(120.15327, 97.83719),(123.98969, 95.55492)),
    ('c', (123.98969, 95.55492),(127.82469, 93.27335),(129.05914, 88.35811),(126.74588, 84.57169)),
]

_photo_cache = {}

def fetch_photo_data(url, target_w, target_h):
    if not HAS_PIL: return None
    img = None
    if url:
        if url not in _photo_cache:
            try:
                resp = requests.get(url, timeout=12); resp.raise_for_status()
                _photo_cache[url] = Image.open(io.BytesIO(resp.content)).convert("RGB")
            except: _photo_cache[url] = None
        img = _photo_cache.get(url)
    if img is None and FALLBACK_PHOTO.exists():
        try: img = Image.open(str(FALLBACK_PHOTO)).convert("RGB")
        except: pass
    if img is None: img = Image.new("RGB", (target_w, target_h), (180, 200, 220))
    return ImageOps.fit(img, (target_w, target_h), method=Image.Resampling.LANCZOS)

def _fit_size(font, text, max_width, base, min_size=4.0):
    s = base
    while s >= min_size:
        if font.text_length(text, fontsize=s) <= max_width: return s
        s -= 0.1
    return min_size

def _wrap(font, text, max_width, size):
    words = text.split()
    if not words: return []
    lines = []; cur = words[0]
    for w in words[1:]:
        trial = cur + " " + w
        if font.text_length(trial, fontsize=size) <= max_width: cur = trial
        else: lines.append(cur); cur = w
    lines.append(cur); return lines

def _put_single(page, rect, text, fontfile, fontname, size, color, font_obj):
    if not text: return
    baseline_y = rect.y0 + size * font_obj.ascender
    page.insert_text((rect.x0, baseline_y), text, fontname=fontname, fontfile=str(fontfile),
                     fontsize=size, color=color, overlay=True)

def draw_text_vertically_centered(page, rect, text, fontfile, fontname, font_obj, base_size, color):
    if not text: return
    size = _fit_size(font_obj, text, rect.width, base_size, 4.0)
    text_h = size * (font_obj.ascender - font_obj.descender)
    baseline = rect.y0 + (rect.height + text_h) / 2.0 - size * abs(font_obj.descender)
    page.insert_text((rect.x0, baseline), text, fontname=fontname, fontfile=str(fontfile),
                     fontsize=size, color=color, overlay=True)

def draw_text_centered_hv(page, rect, text, fontfile, fontname, font_obj, size, color):
    if not text: return
    size = _fit_size(font_obj, text, rect.width, size, 3.5)
    tw = font_obj.text_length(text, fontsize=size)
    glyph_h = size * (font_obj.ascender - font_obj.descender)
    x = rect.x0 + (rect.width - tw) / 2.0
    y = rect.y0 + (rect.height + glyph_h) / 2.0 - size * abs(font_obj.descender)
    page.insert_text((x, y), text, fontname=fontname, fontfile=str(fontfile),
                     fontsize=size, color=color, overlay=True)

def _addr_wrap_at_size(font_obj, words, max_width, fs):
    lines = []; cur = ""
    for w in words:
        if font_obj.text_length(w, fontsize=fs) > max_width:
            if cur: lines.append(cur); cur = ""
            trunc = ""; ellipsis = "…"
            for ch in w:
                candidate = trunc + ch + ellipsis
                if font_obj.text_length(candidate, fontsize=fs) <= max_width: trunc += ch
                else: break
            lines.append(trunc + ellipsis); continue
        trial = (cur + " " + w).strip() if cur else w
        if font_obj.text_length(trial, fontsize=fs) <= max_width: cur = trial
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def render_address(page, rect, addr, fontfile, fontname, font_obj, color):
    if not addr or addr.lower() in {"nan","none"}: return
    words = addr.split()
    if not words: return
    max_w = SIGN_SAFE_X1 - rect.x0
    chosen_fs = ADDR_MIN_SIZE; chosen_lines = []
    for fs in ADDR_SIZE_STEPS:
        lines = _addr_wrap_at_size(font_obj, words, max_w, fs)
        n = len(lines)
        line_h = fs * (font_obj.ascender - font_obj.descender)
        spacing_h = fs * ADDR_LINE_GAP
        total_h = line_h + spacing_h * (n - 1)
        if n <= ADDR_MAX_LINES and total_h <= rect.height:
            chosen_fs = fs; chosen_lines = lines; break
    else:
        fs = ADDR_MIN_SIZE; lines = _addr_wrap_at_size(font_obj, words, max_w, fs)
        lines = lines[:ADDR_MAX_LINES]
        if lines:
            last = lines[-1]
            while last and font_obj.text_length(last, fontsize=fs) > max_w: last = last[:-1]
            if lines[-1] != last: lines[-1] = last.rstrip() + "…"
        chosen_fs = fs; chosen_lines = lines
    if not chosen_lines: return
    line_step = chosen_fs * ADDR_LINE_GAP
    baseline0 = rect.y0 + chosen_fs * font_obj.ascender
    for i, line in enumerate(chosen_lines):
        baseline = baseline0 + i * line_step
        if baseline - chosen_fs * abs(font_obj.descender) > rect.y1: break
        page.insert_text((rect.x0, baseline), line, fontname=fontname, fontfile=str(fontfile),
                         fontsize=chosen_fs, color=color, overlay=True)

def redraw_blood_teardrop(page, fill_color):
    shape = page.new_shape()
    items = TEARDROP_ITEMS
    p = lambda t: fitz.Point(*t)
    shape.draw_line(p(items[0][1]), p(items[0][2]))
    shape.draw_line(p(items[1][1]), p(items[1][2]))
    shape.draw_bezier(p(items[2][1]), p(items[2][2]), p(items[2][3]), p(items[2][4]))
    shape.draw_bezier(p(items[3][1]), p(items[3][2]), p(items[3][3]), p(items[3][4]))
    shape.draw_bezier(p(items[4][1]), p(items[4][2]), p(items[4][3]), p(items[4][4]))
    shape.finish(color=fill_color, fill=fill_color, width=0, closePath=True)
    shape.commit(overlay=True)

def render_card_image(student, dpi=600):
    if not HAS_FITZ or not TEMPLATE_PDF.exists():
        return _placeholder_card(student, dpi)
    doc = fitz.open(str(TEMPLATE_PDF))
    page = doc[0]
    PHOTO_RECT = fitz.Rect(*PHOTO_RECT_COORDS)
    NAME_TEXT_RECT = fitz.Rect(*NAME_TEXT_RECT_COORDS)
    CLASS_TEXT_RECT = fitz.Rect(*CLASS_TEXT_RECT_COORDS)
    ADM_WHITEOUT = fitz.Rect(*ADM_WHITEOUT_COORDS)
    ADM_VALUE_RECT = fitz.Rect(*ADM_VALUE_RECT_COORDS)
    SESSION_WHITEOUT = fitz.Rect(*SESSION_WHITEOUT_COORDS)
    SESSION_VALUE_RECT = fitz.Rect(*SESSION_VALUE_RECT_COORDS)
    BLOOD_VALUE_RECT = fitz.Rect(*BLOOD_VALUE_RECT_COORDS)
    FATHER_VALUE_RECT = fitz.Rect(*FATHER_VALUE_RECT_COORDS)
    MOTHER_VALUE_RECT = fitz.Rect(*MOTHER_VALUE_RECT_COORDS)
    DOB_VALUE_RECT = fitz.Rect(*DOB_VALUE_RECT_COORDS)
    ADDRESS_VALUE_RECT = fitz.Rect(*ADDRESS_VALUE_RECT_COORDS)
    MOBILE_VALUE_RECT = fitz.Rect(*MOBILE_VALUE_RECT_COORDS)

    try:
        anton_obj = fitz.Font(fontfile=str(ANTON_FONT)) if ANTON_FONT.exists() else fitz.Font("helv")
        bold_obj  = fitz.Font(fontfile=str(ARIAL_BOLD)) if ARIAL_BOLD.exists() else fitz.Font("helv")
        anton_fn  = str(ANTON_FONT) if ANTON_FONT.exists() else None
        bold_fn   = str(ARIAL_BOLD) if ARIAL_BOLD.exists() else None
        fn_anton  = "anton" if ANTON_FONT.exists() else "helv"
        fn_bold   = "arialbd" if ARIAL_BOLD.exists() else "helv"
    except: doc.close(); return _placeholder_card(student, dpi)

    # Red band
    shape = page.new_shape()
    def band_right_x(y): return -0.3952 * y + 172.6234
    pts = [fitz.Point(0, BAND_Y0), fitz.Point(band_right_x(BAND_Y0), BAND_Y0),
           fitz.Point(band_right_x(BAND_Y1), BAND_Y1), fitz.Point(0, BAND_Y1)]
    shape.draw_polyline(pts); shape.draw_line(pts[-1], pts[0])
    shape.finish(color=BANNER_RED, fill=BANNER_RED, width=0); shape.commit(overlay=True)

    for r_coords in [FATHER_CLEAN_COORDS, MOTHER_CLEAN_COORDS, DOB_CLEAN_COORDS,
                     ADDRESS_CLEAN_COORDS, MOBILE_CLEAN_COORDS]:
        page.draw_rect(fitz.Rect(*r_coords), color=WHITE, fill=WHITE, width=0, overlay=True)
    page.draw_rect(ADM_WHITEOUT, color=WHITE, fill=WHITE, width=0, overlay=True)
    page.draw_rect(SESSION_WHITEOUT, color=WHITE, fill=WHITE, width=0, overlay=True)

    redraw_blood_teardrop(page, BLOOD_RED)

    # Photo
    if HAS_PIL:
        tw = max(1, int(round((PHOTO_RECT.width / PT_PER_INCH) * dpi)))
        th = max(1, int(round((PHOTO_RECT.height / PT_PER_INCH) * dpi)))
        photo = fetch_photo_data(student.get("photo_url",""), tw, th)
        if photo:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                photo.save(tmp.name); page.insert_image(PHOTO_RECT, filename=tmp.name, overlay=True, keep_proportion=False)
            os.unlink(tmp.name)

    # Name
    draw_text_vertically_centered(page, NAME_TEXT_RECT,
        str(student.get("student_name","")).strip().upper(),
        anton_fn or "", fn_anton, anton_obj, NAME_FONT_SIZE, NAME_COLOR)

    # Class/section/roll
    cls = str(student.get("class","")).strip().upper()
    sec = str(student.get("section","")).strip().upper()
    roll = str(student.get("roll","")).strip()
    parts = []
    if cls: parts.append(f"CLASS:{cls}")
    if sec: parts.append(f"SEC:{sec}")
    if roll: parts.append(f"ROLL:{roll}")
    draw_text_vertically_centered(page, CLASS_TEXT_RECT, "  ".join(parts),
        bold_fn or "", fn_bold, bold_obj, CLASS_FONT_SIZE, NAME_COLOR)

    for rect_coords, key in [(FATHER_VALUE_RECT_COORDS,"father_name"),
                              (MOTHER_VALUE_RECT_COORDS,"mother_name"),
                              (MOBILE_VALUE_RECT_COORDS,"mobile")]:
        rect = fitz.Rect(*rect_coords)
        txt = str(student.get(key,"")).strip()
        if txt and txt.lower() not in {"nan","none"}:
            sz = _fit_size(bold_obj, txt, rect.width, VALUE_FONT_SIZE)
            _put_single(page, rect, txt, bold_fn or "", fn_bold, sz, VALUE_COLOR, bold_obj)

    dob = str(student.get("dob","")).strip()
    if dob and dob.lower() not in {"nan","none"}:
        rect = fitz.Rect(*DOB_VALUE_RECT_COORDS)
        sz = _fit_size(bold_obj, dob, rect.width, VALUE_FONT_SIZE)
        _put_single(page, rect, dob, bold_fn or "", fn_bold, sz, VALUE_COLOR, bold_obj)

    addr = str(student.get("address","")).strip()
    render_address(page, ADDRESS_VALUE_RECT, addr, bold_fn or "", fn_bold, bold_obj, VALUE_COLOR)

    adm = str(student.get("adm_no","")).strip()
    if adm and adm.lower() not in {"nan","none"}:
        sz = _fit_size(bold_obj, adm, ADM_VALUE_RECT.width, ADM_FONT_SIZE)
        _put_single(page, ADM_VALUE_RECT, adm, bold_fn or "", fn_bold, sz, VALUE_COLOR, bold_obj)

    sess = str(student.get("session","")).strip() or DEFAULT_SESSION
    sz = _fit_size(anton_obj, sess, SESSION_VALUE_RECT.width, SESSION_FONT_SIZE)
    _put_single(page, SESSION_VALUE_RECT, sess, anton_fn or "", fn_anton, sz, VALUE_COLOR, anton_obj)

    blood = str(student.get("blood_group","")).strip().upper()
    if blood and blood.lower() not in {"nan","none"} and any(c.isalpha() for c in blood):
        draw_text_centered_hv(page, BLOOD_VALUE_RECT, blood, bold_fn or "", fn_bold, bold_obj, BLOOD_FONT_SIZE, WHITE)

    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    doc.close()
    if HAS_PIL:
        return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return pix

def _placeholder_card(student, dpi=600):
    if not HAS_PIL:
        return None
    w = int(55 / 25.4 * dpi); h = int(86 / 25.4 * dpi)
    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w, int(h*0.3)], fill=(200, 30, 30))
    name = student.get("student_name","Student").upper()
    draw.text((10, 10), name, fill="white")
    draw.text((10, int(h*0.35)), f"Class: {student.get('class','')}", fill=(100,100,100))
    return img

_BADGE_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]

def _load_badge_font(size):
    if not HAS_PIL: return None
    for p in _BADGE_FONT_CANDIDATES:
        if Path(p).exists():
            try: return ImageFont.truetype(p, size)
            except: continue
    return ImageFont.load_default()

def draw_serial_badge(sheet, serial, center_x, center_y, badge_h_px):
    if not HAS_PIL: return
    draw = ImageDraw.Draw(sheet)
    target_text_h = max(18, int(badge_h_px * 0.45))
    font = _load_badge_font(target_text_h)
    txt = f"#{serial}"
    bbox = draw.textbbox((0,0), txt, font=font)
    tw = bbox[2]-bbox[0]; th = bbox[3]-bbox[1]
    pad_x = max(10, int(th*0.35)); pad_y = max(5, int(th*0.2))
    bw = tw+2*pad_x; bh = th+2*pad_y; r = bh//2
    left = center_x-bw//2; top = center_y-bh//2
    right = left+bw; bottom = top+bh
    shadow_off = max(2, int(th*0.06))
    draw.rounded_rectangle([left+shadow_off,top+shadow_off,right+shadow_off,bottom+shadow_off], radius=r, fill=(50,0,0))
    draw.rounded_rectangle([left,top,right,bottom], radius=r, fill=(210,20,20), outline=(255,255,255), width=max(2,int(th*0.04)))
    draw.text((left+pad_x-bbox[0], top+pad_y-bbox[1]), txt, fill=(255,255,255), font=font)

def build_sheet_image(students_batch, dpi, batch_offset=0):
    if not HAS_PIL: return None
    def mm2px(mm): return int(round(mm/25.4*dpi))
    a4_w_px = mm2px(A4_W_MM); a4_h_px = mm2px(A4_H_MM)
    card_w_px = mm2px(CARD_W_MM); card_h_px = mm2px(CARD_H_MM)
    offset_x = mm2px(OFFSET_X_MM); offset_y = mm2px(OFFSET_Y_MM)
    row_gap_px = mm2px(ROW_GAP_MM); col_gap_px = mm2px(1.0)
    sheet = Image.new("RGB", (a4_w_px, a4_h_px), (245,245,245))
    for idx, data in enumerate(students_batch):
        col = idx%COLS; row = idx//COLS
        x = offset_x+col*(card_w_px+col_gap_px); y = offset_y+row*(card_h_px+row_gap_px)
        card_img = render_card_image(data, dpi=dpi)
        if card_img:
            card_img = card_img.resize((card_w_px, card_h_px), Image.Resampling.LANCZOS)
            sheet.paste(card_img, (x, y))
    for idx, data in enumerate(students_batch):
        col = idx%COLS; row = idx//COLS
        card_x = offset_x+col*(card_w_px+col_gap_px); card_y = offset_y+row*(card_h_px+row_gap_px)
        gap_top = card_y+card_h_px; gap_bottom = min(gap_top+row_gap_px, a4_h_px-2)
        if gap_bottom-gap_top < 8: continue
        badge_h_px = gap_bottom-gap_top
        draw_serial_badge(sheet, batch_offset+idx+1, card_x+card_w_px//2, (gap_top+gap_bottom)//2, badge_h_px)
    return sheet

def build_pdf_bytes(students, dpi=600):
    if not HAS_FITZ or not HAS_PIL:
        return None
    n_pages = (len(students)+CARDS_PER_PAGE-1)//CARDS_PER_PAGE
    a4_w_pt = A4_W_MM*MM_TO_PT; a4_h_pt = A4_H_MM*MM_TO_PT
    out_doc = fitz.open()
    for page_idx in range(n_pages):
        bs = page_idx*CARDS_PER_PAGE; batch = students[bs:bs+CARDS_PER_PAGE]
        sheet_img = build_sheet_image(batch, dpi, batch_offset=bs)
        if sheet_img:
            img_bytes = io.BytesIO(); sheet_img.save(img_bytes, format="PNG"); img_bytes.seek(0)
            pg = out_doc.new_page(width=a4_w_pt, height=a4_h_pt)
            pg.insert_image(fitz.Rect(0,0,a4_w_pt,a4_h_pt), stream=img_bytes.read(), overlay=True, keep_proportion=False)
    buf = io.BytesIO()
    out_doc.save(buf, deflate=False, garbage=0, clean=False)
    out_doc.close(); buf.seek(0)
    return buf.read()

# ─────────────────────────────────────────────────────────────────
# PDF / PREVIEW ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.route("/api/preview/all", methods=["GET"])
def preview_all():
    print(f"DEBUG: Preview all endpoint called")
    students = _store["students"]
    if not students: 
        print(f"DEBUG: No students in store")
        return jsonify({"error":"No students loaded"}),400
    print(f"DEBUG: Found {len(students)} students for preview")
    cls = request.args.get("class","").strip().upper()
    if cls: students = [s for s in students if s.get("class","").strip().upper()==cls]
    dpi = 300
    pdf_data = build_pdf_bytes(students, dpi=dpi)
    if not pdf_data: return jsonify({"error":"PDF generation failed - check server libs"}),500
    return send_file(io.BytesIO(pdf_data), mimetype="application/pdf",
                     as_attachment=False, download_name="preview.pdf")

@app.route("/api/download/all", methods=["GET"])
def download_all():
    print(f"DEBUG: Download all endpoint called")
    students = _store["students"]
    if not students: 
        print(f"DEBUG: No students in store for download")
        return jsonify({"error":"No students loaded"}),400
    print(f"DEBUG: Found {len(students)} students for download")
    cls = request.args.get("class","").strip().upper()
    if cls:
        students = [s for s in students if s.get("class","").strip().upper()==cls]
        fname = f"ids_{cls}.pdf"
    else:
        fname = "ids_ALL.pdf"
    pdf_data = build_pdf_bytes(students, dpi=600)
    if not pdf_data: return jsonify({"error":"PDF generation failed"}),500
    return send_file(io.BytesIO(pdf_data), mimetype="application/pdf",
                     as_attachment=True, download_name=fname)

@app.route("/api/preview/student", methods=["GET"])
def preview_student():
    students = _store["students"]
    cls  = request.args.get("class","").strip().upper()
    name = request.args.get("name","").strip().lower()
    if not students: return jsonify({"error":"No students loaded"}),400
    matches = [s for s in students
               if s.get("class","").strip().upper()==cls
               and name == s.get("student_name","").strip().lower()]
    if not matches: return jsonify({"error":"Student not found"}),404
    student = matches[0]
    pdf_data = build_pdf_bytes([student], dpi=300)
    if not pdf_data: return jsonify({"error":"PDF generation failed"}),500
    return send_file(io.BytesIO(pdf_data), mimetype="application/pdf",
                     as_attachment=False, download_name="preview_student.pdf")

@app.route("/api/download/student", methods=["GET"])
def download_student():
    students = _store["students"]
    cls  = request.args.get("class","").strip().upper()
    name = request.args.get("name","").strip().lower()
    if not students: return jsonify({"error":"No students loaded"}),400
    matches = [s for s in students
               if s.get("class","").strip().upper()==cls
               and name == s.get("student_name","").strip().lower()]
    if not matches: return jsonify({"error":"Student not found"}),404
    student = matches[0]
    pdf_data = build_pdf_bytes([student], dpi=600)
    if not pdf_data: return jsonify({"error":"PDF generation failed"}),500
    safe_name = student.get("student_name","student").replace(" ","_")
    return send_file(io.BytesIO(pdf_data), mimetype="application/pdf",
                     as_attachment=True, download_name=f"id_{safe_name}.pdf")

if __name__ == "__main__":
    checkmark = '\u2713'
    xmark = '\u2717'
    print("=" * 55)
    print("  ID Card Generator Backend  v1.0")
    print(f"  Template PDF: {checkmark + ' found' if TEMPLATE_PDF.exists() else xmark + ' NOT FOUND'}")
    print(f"  Anton font:   {checkmark + ' found' if ANTON_FONT.exists() else xmark + ' NOT FOUND'}")
    print(f"  Arial Bold:   {checkmark + ' found' if ARIAL_BOLD.exists() else xmark + ' NOT FOUND'}")
    print(f"  PyMuPDF:      {checkmark if HAS_FITZ else xmark + ' pip install pymupdf'}")
    print(f"  Pillow:       {checkmark if HAS_PIL else xmark + ' pip install pillow'}")
    print("=" * 55)
    
    # Production-ready port configuration
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(debug=debug, host='0.0.0.0', port=port)
