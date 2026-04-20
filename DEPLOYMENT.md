# Deployment Guide - ID Card Generator

This guide will help you deploy your ID Card Generator application to GitHub, Vercel, and Render.

## GitHub Setup

### 1. Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit - ID Card Generator"
```

### 2. Create GitHub Repository
1. Go to [GitHub](https://github.com) and create a new repository
2. Name it something like `id-card-generator`
3. Don't initialize with README (you already have one)
4. Copy the repository URL

### 3. Push to GitHub
```bash
git remote add origin https://github.com/yourusername/id-card-generator.git
git branch -M main
git push -u origin main
```

## Vercel Deployment (Frontend)

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Deploy Frontend
```bash
cd frontend
vercel --prod
```

### 3. Configure Environment Variables
In Vercel dashboard:
- Go to your project settings
- Add environment variable: `REACT_APP_API_URL` = `https://your-backend-url.onrender.com`

## Render Deployment (Backend)

### 1. Create Render Account
Go to [Render](https://render.com) and create an account

### 2. Deploy Backend
1. Click "New +" button
2. Select "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `id-card-backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Root Directory**: `backend`

### 3. Environment Variables for Render
Add these environment variables:
- `PYTHON_VERSION`: `3.9`
- `FLASK_ENV`: `production`
- `PORT`: `5000`

## Alternative: Full Stack on Render

You can also deploy the entire application on Render using the provided `render.yaml` file:

### 1. Push to GitHub (if not done)
### 2. Create Render Account
### 3. Connect Repository
### 4. Render will automatically detect `render.yaml` and set up both services

## Important Files Added

- `vercel.json` - Vercel configuration
- `render.yaml` - Render configuration for full-stack deployment
- `frontend/.env.example` - Environment variable template
- `frontend/.env.production` - Production environment variables
- `backend/vercel.json` - Backend Vercel configuration

## Post-Deployment Steps

### 1. Update Frontend API URL
After deploying your backend to Render, update the frontend environment variable:
- In Vercel dashboard: Set `REACT_APP_API_URL` to your Render backend URL
- Format: `https://your-backend-name.onrender.com`

### 2. Test the Application
1. Visit your frontend URL (Vercel)
2. Test uploading student data
3. Test generating ID cards
4. Verify all functionality works

### 3. Required Files
Make sure these files are present in `backend/` directory:
- `template_id_card.pdf` - Your ID card template
- `Anton-Regular.ttf` - Font file
- `arialbd.ttf` - Arial Bold font
- `student_photo.jpg` - Fallback photo (optional)

## Troubleshooting

### Common Issues
1. **CORS Errors**: Ensure backend has CORS enabled (already configured)
2. **Font/PDF Missing**: Upload required files to backend directory
3. **Environment Variables**: Double-check all environment variables are set
4. **Build Failures**: Check logs in Vercel/Render dashboards

### Port Configuration
- Backend uses port 5000 by default
- Render automatically sets PORT environment variable
- Vercel handles routing automatically

## Local Development

To continue local development:
```bash
# Backend
cd backend
python app.py

# Frontend (in separate terminal)
cd frontend
npm start
```

The local setup will continue to work as before with `http://localhost:5000` for the backend.
