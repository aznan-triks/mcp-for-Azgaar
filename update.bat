@echo off
cd /d "%~dp0"
title Azgaar MCP - update
echo Updating Azgaar to its newest version (your current one is kept if the new one does not work)...
call npm run update
echo.
pause
