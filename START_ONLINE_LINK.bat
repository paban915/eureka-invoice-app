@echo off
title EUREKA INTERNATIONAL - Public Online Link Generator
echo =========================================================
echo   EUREKA INTERNATIONAL - INSTANT ONLINE LINK GENERATOR
echo =========================================================
echo.
echo [1/2] Checking if local server is running...
curl -s http://localhost:3000 >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Local server is not running. Starting local server first...
    start "" cmd /c "node server.js"
    timeout /t 3 /nobreak >nul
)

echo [2/2] Generating permanent/public internet tunnel link...
echo.
echo =========================================================
echo SEND THIS PUBLIC LINK TO THE OTHER PERSON TO USE:
echo =========================================================
npx -y localtunnel --port 3000
pause
