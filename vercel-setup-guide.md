# Vercel Setup Guide

## Step 1: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project" 
3. Connect your GitHub repository: `varshitha-333/automation_id_school`
4. Vercel will auto-detect your `vercel.json` configuration
5. Click "Deploy"

## Step 2: Set Environment Variables
After deployment, in Vercel dashboard:
1. Go to your project settings
2. Click "Environment Variables"
3. Add: `REACT_APP_API_URL` = `https://your-backend-name.onrender.com`

## Step 3: Redeploy
After setting environment variables, redeploy from Vercel dashboard.

## Important Notes:
- Vercel will automatically build both frontend and backend
- API routes will be available at `/api/*`
- Frontend will be served from root path
- Your `vercel.json` handles all routing automatically
