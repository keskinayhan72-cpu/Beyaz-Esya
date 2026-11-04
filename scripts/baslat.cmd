@echo off
rem Windows: veritabanini ve uygulamayi baslatir. Bilgisayar yeniden acildiginda cift tiklayin.
set "PGBIN=C:\Program Files\PostgreSQL\16\bin"
set "PGDATA=%LOCALAPPDATA%\BeyazEsya\pgdata"
"%PGBIN%\pg_ctl.exe" status -D "%PGDATA%" >nul 2>&1
if errorlevel 1 "%PGBIN%\pg_ctl.exe" start -D "%PGDATA%" -l "%LOCALAPPDATA%\BeyazEsya\postgres.log" -w
cd /d "%~dp0..\web"
start "" http://localhost:3000
call npm start
