@echo off
cd /d "%~dp0"
title Azgaar MCP - installation
echo.
echo ===== Azgaar MCP : installation =====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. It is a free program this tool needs.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Please install Node.js "LTS" from https://nodejs.org then double-click this file again.
    start https://nodejs.org
    pause
    exit /b 1
  )
  echo Installing Node.js with Windows Package Manager ^(a Windows window may ask your permission^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Node.js is installed. CLOSE this window and double-click install.bat AGAIN to finish.
  pause
  exit /b 0
)
echo Installing the tool ^(this can take a few minutes, please wait^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Something went wrong while downloading. Check your internet connection and try again.
  pause
  exit /b 1
)
call npm run setup
echo.
pause
