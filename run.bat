@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not on PATH.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    echo Or download the portable zip from GitHub Releases.
    pause
    exit /b 1
)

echo Installing / updating dependencies...
python -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo ERROR: Could not install dependencies.
    pause
    exit /b 1
)

echo.
echo Starting PZ Companion...
echo.
python app.py
set EXITCODE=%ERRORLEVEL%
if not %EXITCODE%==0 pause
exit /b %EXITCODE%
