@echo off
echo ========================================================
echo   EUREKA INTERNATIONAL - Push Project to GitHub
echo ========================================================
echo.
set /p REPO_URL="Paste your GitHub repository URL (e.g. https://github.com/your-username/eureka-invoice-app.git): "

if "%REPO_URL%"=="" (
    echo Error: No repository URL provided!
    pause
    exit /b
)

echo.
echo Connecting to GitHub repository...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main

echo Pushing code to GitHub main branch...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   SUCCESS! Your project has been pushed to GitHub.
    echo   Now go to https://dashboard.render.com and deploy via Blueprint!
    echo ========================================================
) else (
    echo.
    echo Pushing failed. Please check your GitHub login and permissions.
)

pause
