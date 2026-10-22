@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto systemnode
set "STARS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%STARS_NODE%" goto bundled
echo Install Node.js 18 or later, then reopen this file.
echo Or open index.html with the VS Code Live Server extension.
pause
exit /b 1
:systemnode
start "吞噬星空" "http://127.0.0.1:4173"
node server.mjs
goto end
:bundled
start "吞噬星空" "http://127.0.0.1:4173"
"%STARS_NODE%" server.mjs
:end
pause
