# ID Card Generator — Admin Portal

A full-stack web app for generating school ID cards.  
**Flask backend** + **React frontend** — single page admin dashboard.

---

## 📁 Folder Structure

```
id-card-app/
├── backend/
│   ├── app.py                  ← Flask server (all PDF logic here)
│   ├── requirements.txt
│   ├── template_id_card.pdf    ← PUT YOUR TEMPLATE HERE
│   ├── Anton-Regular.ttf       ← PUT FONT HERE
│   ├── arialbd.ttf             ← PUT FONT HERE
│   └── student_photo.jpg       ← fallback photo (optional)
│
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── App.js              ← Main single-page React app
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
│
└── README.md
```

---

## ⚙️ Setup & Run

### Prerequisites
- **Python 3.9+**
- **Node.js 18+** and **npm**

---

### Step 1 — Place required files in `/backend/`

| File | Required | Notes |
|------|----------|-------|
| `template_id_card.pdf` | ✅ Yes | Your blank ID card template |
| `Anton-Regular.ttf` | ✅ Yes | Download from Google Fonts |
| `arialbd.ttf` | ✅ Yes | Arial Bold font file |
| `student_photo.jpg` | Optional | Fallback photo if student has no photo |

---

### Step 2 — Start the Backend

```bash
cd id-card-app/backend

# Create virtual environment
python -m venv venv

# Activate (Linux/Mac)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

✅ Backend runs at: **http://localhost:5000**

You'll see startup info:
```
=======================================================
  ID Card Generator Backend  v1.0
  Template PDF: ✓ found
  Anton font:   ✓ found
  Arial Bold:   ✓ found
  PyMuPDF:      ✓
  Pillow:        ✓
=======================================================
```

---

### Step 3 — Start the Frontend

Open a **new terminal**:

```bash
cd id-card-app/frontend

# Install dependencies
npm install

# Start development server
npm start
```

✅ Frontend runs at: **http://localhost:3000**  
The browser will open automatically.

---

## 🚀 How to Use

### Load Student Data
**Option A — Upload File:**
- Drag & drop or click to upload `.xlsx`, `.xls`, or `.csv`
- Required columns: `student_name, class, father_name, phone, section, roll_no, mother_name, dob, blood_group, address, adm_no, photo_url`
- Data loads instantly — stats update on the dashboard

**Option B — Live API:**
- Select a school from the dropdown
- Click "Fetch Students" to pull live data from titusattendence.com

### Generate ID Cards
- **Preview All (300 DPI)** — opens inline PDF viewer
- **Download All (600 DPI)** — downloads high-quality print-ready PDF
- Per-class buttons: download or preview any single class

### Individual Student Card
- Select class → student name auto-populates from loaded data
- View (300 DPI preview) or Download (600 DPI)

---

## 📋 Excel/CSV Column Reference

The app auto-maps many column name variations. Supported:

| Field | Column Names Accepted |
|-------|-----------------------|
| Student Name | `student_name`, `name`, `studentname` |
| Class | `class`, `class_name`, `std`, `standard` |
| Section | `section`, `sec`, `section_id` |
| Roll No | `roll`, `roll_no`, `rollno`, `roll_number` |
| Father Name | `father_name`, `father`, `fathers_name` |
| Mother Name | `mother_name`, `mother`, `mothers_name` |
| Date of Birth | `dob`, `date_of_birth`, `birth_date` |
| Address | `address`, `student_address`, `residence` |
| Mobile | `mobile`, `phone`, `mobile_no`, `contact`, `father_contact` |
| Photo URL | `photo_url`, `photo`, `image_url`, `photo_link`, `student_photo` |
| Admission No | `adm_no`, `admission_no`, `adm`, `admno` |
| Blood Group | `blood_group`, `bloodgroup`, `blood` |
| Session | `session` |

---

## 🔧 Configuration

Edit `backend/app.py` to change:
- `SCHOOLS` dict — add/remove schools and API IDs
- `DEFAULT_SESSION` — default academic session
- `API_BASE_URL` — change if API endpoint changes
- `RENDER_DPI` — default DPI for downloads (currently 600)

---

## ❗ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Backend offline" in UI | Make sure `python app.py` is running |
| PDF generation fails | Check template PDF and fonts are in `backend/` |
| Photos not loading | Check photo URLs are accessible from your network |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| Port 5000 in use | Edit `app.run(port=5000)` in `app.py` and `proxy` in `package.json` |
