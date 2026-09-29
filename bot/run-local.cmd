@echo off
rem Runs the bot on this PC instead of Railway: restarts it whenever it exits
rem and logs to bot\data\bot.log. Started hidden at logon by the scheduled task
rem "SmartTradingClub Bot" (register-local.ps1).
cd /d "%~dp0"
if not exist data mkdir data
:loop
echo [%date% %time%] runner: starting bot>>data\bot.log
node close-watcher.js >>data\bot.log 2>&1
echo [%date% %time%] runner: bot exited (%errorlevel%), restarting in 15s>>data\bot.log
ping -n 16 127.0.0.1 >nul
goto loop
