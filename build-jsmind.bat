@echo off
setlocal enabledelayedexpansion

REM Build jsMind from vendor\jsmind-repo and copy artifacts into vendor\jsmind
set ROOT=%~dp0
set REPO=%ROOT%vendor\jsmind-repo
set TARGET=%ROOT%vendor\jsmind

pushd "%REPO%"

REM Install deps
call npm ci --no-fund --no-audit || goto :error

REM Build outputs
call npm run build || goto :error
call npm run build-types || goto :error

REM Ensure target directories
if not exist "%TARGET%\es6" mkdir "%TARGET%\es6"
if not exist "%TARGET%\style" mkdir "%TARGET%\style"

REM Copy core and plugins
copy /Y "%REPO%\es6\jsmind.js" "%TARGET%\es6\jsmind.js" >nul
if exist "%REPO%\es6\jsmind.draggable-node.js" copy /Y "%REPO%\es6\jsmind.draggable-node.js" "%TARGET%\es6\jsmind.draggable-node.js" >nul
if exist "%REPO%\es6\jsmind.screenshot.js" copy /Y "%REPO%\es6\jsmind.screenshot.js" "%TARGET%\es6\jsmind.screenshot.js" >nul
copy /Y "%REPO%\style\jsmind.css" "%TARGET%\style\jsmind.css" >nul

popd
echo Done. Artifacts copied to %TARGET%
exit /b 0

:error
popd
echo Build failed.
exit /b 1
