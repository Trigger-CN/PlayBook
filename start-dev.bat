@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Playbook dev server

echo ==========================================
echo   Playbook - local dev server
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

set "NODE_MAJOR="
for /f "delims=." %%v in ('node -p process.versions.node') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto :bad_node
if %NODE_MAJOR% LSS 20 goto :old_node

if exist "node_modules\" goto :deps_ready
echo [1/3] node_modules not found - running npm install, this can take a few minutes.
call npm install
if errorlevel 1 goto :install_failed
goto :deps_done

:deps_ready
echo [1/3] Dependencies are ready.

:deps_done
if not exist ".me\pg\pgdata\PG_VERSION" goto :db_absent
echo [2/3] Restarting the local database...
call npm run db:stop >nul 2>nul
call npm run db:start
if errorlevel 1 goto :db_failed
goto :db_done

:db_absent
echo [2/3] Local database is not set up - skipping the restart.
echo       Run "npm run db:setup" once to enable likes, comments and admin.
goto :db_done

:db_failed
echo [WARN] The local database did not come up.
echo        The site still starts, but interactions and admin stay disabled.
echo        Check the messages above, or run "npm run db:health" for details.

:db_done
echo [3/3] Starting the dev server - default port 3000
echo       Press Ctrl+C to stop.
echo.

call npm run dev
if errorlevel 1 goto :dev_failed
exit /b 0

:no_node
echo [ERROR] Node.js was not found. Install Node.js 20.9 or newer from https://nodejs.org/
goto :fail

:bad_node
echo [ERROR] Could not read the Node.js version.
goto :fail

:old_node
echo [ERROR] Node.js is too old. Version 20.9 or newer is required.
node -v
goto :fail

:install_failed
echo [ERROR] npm install failed. Check the network and try again.
goto :fail

:dev_failed
echo [ERROR] The dev server exited with an error.
goto :fail

:fail
echo.
echo Startup failed. See the messages above.
pause
exit /b 1
