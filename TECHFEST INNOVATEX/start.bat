@echo off
cd /d "%~dp0"
echo Starting COAST//TRACE...
node trace-server.js
echo.
echo The server stopped. If you saw an error above, copy it.
pause