@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title PZ Companion
echo ============================================
echo  PZ Companion
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js bulunamadi / Node.js not found.
  echo.
  echo Node.js 20+ kurup tekrar bu dosyaya cift tikla:
  echo https://nodejs.org/
  echo.
  echo Install Node.js 20+, then double-click this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm bulunamadi / npm not found.
  echo Node.js kurulumunu "npm" secenegiyle tekrar yap.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=v" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
echo Node.js: 
node -v
echo.

if not exist "package.json" (
  echo [ERROR] package.json yok. Bu .bat dosyasini proje klasorunde calistir.
  echo [ERROR] package.json missing. Run this .bat inside the project folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Ilk kurulum: bagimliliklar indiriliyor...
  echo First run: installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install basarisiz / failed.
    echo.
    pause
    exit /b 1
  )
  echo.
)

if not exist "node_modules\electron\" (
  echo Electron eksik, bagimliliklar yeniden kuruluyor...
  echo Electron missing, reinstalling dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install basarisiz / failed.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo Uygulama aciliyor / Starting app...
echo.
call npm start
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] Uygulama kapandi / app exited with code %EXITCODE%.
  echo.
  pause
)

endlocal & exit /b %EXITCODE%
