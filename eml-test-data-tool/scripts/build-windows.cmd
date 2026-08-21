@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22 or later is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

echo Installing dependencies...
call npm ci
if errorlevel 1 goto :failed

echo Running tests...
call npm test
if errorlevel 1 goto :failed

echo Building Windows executables...
call npm run dist:win:all
if errorlevel 1 goto :failed

echo.
echo Build complete. Files are in:
echo %CD%\release
pause
exit /b 0

:failed
echo.
echo [ERROR] Build failed. Review the messages above.
pause
exit /b 1
