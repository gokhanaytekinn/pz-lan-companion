@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  PZ Companion - Portable Build
echo ============================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not on PATH.
    exit /b 1
)

echo [1/4] Installing dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo.
echo [2/4] Cleaning previous build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist PZ_Companion.spec del /q PZ_Companion.spec
if exist release_stage rmdir /s /q release_stage

echo.
echo [3/4] Building PZ_Companion.exe (windowed onefile)...
python -m PyInstaller --noconfirm --clean --onefile --windowed --name PZ_Companion app.py
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    exit /b 1
)

echo.
echo [4/4] Creating portable zip folder...
mkdir release_stage
copy /y dist\PZ_Companion.exe release_stage\ >nul
(
echo PZ Companion - portable
echo.
echo 1. Double-click PZ_Companion.exe
echo 2. Press Start Server
echo 3. Scan the PZ Map or PZ Pulse QR code on your phone
echo 4. Phone and PC must be on the same Wi-Fi
echo.
echo If Windows Smart App Control blocks the exe, use run.bat with Python instead.
) > release_stage\README.txt

powershell -NoProfile -Command "Compress-Archive -Path 'release_stage\*' -DestinationPath 'dist\PZ_Companion-portable.zip' -Force"

echo.
echo ============================================
echo  Build complete!
echo  EXE: dist\PZ_Companion.exe
echo  ZIP: dist\PZ_Companion-portable.zip
echo ============================================
echo.
echo Smart App Control may block unsigned exe files.
echo Prefer Releases zip on other PCs, or .\run.bat locally.
echo.
pause
endlocal
