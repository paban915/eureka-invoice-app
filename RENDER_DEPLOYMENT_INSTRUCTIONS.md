# 🚀 EUREKA INTERNATIONAL — Render Cloud Deployment & PostgreSQL Guide

This application is now **100% cloud-ready** with automatic **PostgreSQL database migration** and **Render Blueprint configuration (`render.yaml`)**.

---

## 🔒 1. Backup Confirmation
Before preparing deployment, full backups of your existing records were created:
* **SQLite Database Backup:** `data/invoices_backup_20261017_223301.db`
* **JSON Export (Portable Data):** `data/database_export.json`
  - 5 Products (AQUA-GUARD, SEA-MIN, SEA-MIN ADVANCE, NUTRAGEL, Y-TREAT)
  - 3 Customers (Coastal Blue Aquaculture, Sri Krishna Hatcheries, Gujarat Aqua Tech)
  - 2 Invoices with full snapshot calculations
  - 16 Company Settings & Bank Details

---

## 🌐 2. How to Deploy to Render (Takes 3 Minutes)

Because we created `render.yaml`, Render will automatically create **both** your **PostgreSQL Database** and your **Web Service** together with zero manual database setup!

### Step 1: Create a GitHub Repository
1. Open [GitHub](https://github.com) and log into your account.
2. Click the **"+"** button at the top right and select **New repository**.
3. Name it: `eureka-invoice-app` (keep it Private or Public as you prefer).
4. Click **Create repository**.
5. Copy the repository URL (e.g., `https://github.com/YOUR_USERNAME/eureka-invoice-app.git`).

### Step 2: Push your Code to GitHub
Run these commands in PowerShell in your project folder:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/eureka-invoice-app.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy on Render via Blueprint
1. Go to [https://dashboard.render.com](https://dashboard.render.com) (sign up / log in with GitHub).
2. Click the blue **"New +"** button at the top right.
3. Select **"Blueprint"**.
4. Connect your GitHub repository (`eureka-invoice-app`).
5. Render will automatically read `render.yaml`:
   - It will create a managed **PostgreSQL database** (`eureka-invoicing-db`).
   - It will create a **Node.js Web Service** (`eureka-international-invoicing`).
   - It will link `DATABASE_URL` automatically.
6. Click **"Apply"**.

Render will now build your project and start the server. On first boot, it will automatically populate your 5 products, 3 customers, invoices, and settings into PostgreSQL!

---

## 📱 3. Your Permanent URL & Multi-Device Access

Once the build finishes (usually 1–2 minutes):
* **Your Permanent Public URL will be:**
  `https://eureka-international-invoicing.onrender.com`
  *(You can also customize the name in Render settings or connect your custom domain like `billing.eurekainternational.com`).*

### How to access from any computer, tablet, or phone:
1. Open Chrome, Safari, or Edge on **any device anywhere in the world**.
2. Type your Render URL: `https://eureka-international-invoicing.onrender.com`.
3. That's it!
   - You can create invoices from your phone in the field.
   - Your accountant can record payments from their office PC.
   - All data syncs **live and instantly** to the same Cloud PostgreSQL database.
   - **Your laptop can be turned OFF completely** — the cloud server runs 24/7/365!
