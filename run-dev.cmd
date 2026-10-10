@echo off
REM Scratch launcher — starts the dev app detached with logs in dev-run.log.
cd /d "%~dp0"
npm run dev > dev-run.log 2>&1
