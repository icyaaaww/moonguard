@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/ then try again.
  pause
  exit /b 1
)
node "%~dp0host\server.mjs" --open --port 0
if errorlevel 1 pause
