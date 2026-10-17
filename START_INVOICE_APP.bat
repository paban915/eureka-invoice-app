@echo off
title EUREKA INTERNATIONAL - Invoicing & Billing System
echo ===================================================
echo   EUREKA INTERNATIONAL - INVOICING & BILLING APP
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo Please download and install Node.js from https://nodejs.org/
    echo Then run this file again.
    echo.
    pause
    exit /b
)

:: Check if node_modules folder exists; if not, install dependencies automatically
if not exist "node_modules\" (
    echo [INFO] First time setup: Installing required packages...
    call npm install
    echo.
)

echo [INFO] Starting Invoicing Server...
echo [INFO] App will be available at: http://localhost:3000
echo.

:: Automatically open browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Start Node.js application
node server.js

pause
