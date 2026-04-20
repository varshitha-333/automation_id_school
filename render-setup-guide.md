# Render Setup Guide

## Option A: Use render.yaml (Automatic Full-Stack)
1. Go to [render.com](https://render.com)
2. Sign up and click "New +" 
3. Select "Web Service"
4. Connect your GitHub repo: `varshitha-333/automation_id_school`
5. Render will auto-detect `render.yaml` and create both services
6. Click "Create Web Service"

## Option B: Manual Setup (Backend Only)
### Step 1: Deploy Backend
1. Go to Render dashboard
2. Click "New +" > "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Name**: `id-card-backend`
   - **Runtime**: `Python 3`
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Instance Type**: `Free`

### Step 2: Set Environment Variables
In your backend service settings:
- `PYTHON_VERSION`: `3.9`
- `FLASK_ENV`: `production`
- `PORT`: `5000`

### Step 3: Deploy Frontend (Optional)
You can deploy frontend separately to Vercel or Netlify for better performance.

## What render.yaml Does:
- Creates 2 services: `id-card-frontend` (static) and `id-card-backend` (Python)
- Frontend builds React app and serves from `/`
- Backend runs Flask API on port 5000
- Routes are automatically configured

## After Deployment:
1. Note your backend URL: `https://id-card-backend.onrender.com`
2. Update Vercel environment variable with this URL
3. Test your application
