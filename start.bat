@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this happens once...
  call npm install
)
if not exist .next (
  echo Building...
  call npm run build
)
start "" http://localhost:3000
call npm start
pause
