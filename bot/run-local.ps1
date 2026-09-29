# Runs the bot on this PC instead of Railway: restarts it whenever it exits and
# logs to bot/data/bot.log. Started at logon by the scheduled task
# "SmartTradingClub Bot" (see register-local.ps1).
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force data | Out-Null
$log = Join-Path $PSScriptRoot 'data\bot.log'

while ($true) {
    # keep one old log; a busy week of 30s polling adds up
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 20MB) {
        Move-Item $log "$log.1" -Force
    }
    Add-Content $log "[$(Get-Date -Format s)] runner: starting bot"
    # via cmd: PowerShell 5.1 redirection would write the log as UTF-16
    cmd /c "node close-watcher.js >> `"$log`" 2>&1"
    Add-Content $log "[$(Get-Date -Format s)] runner: bot exited ($LASTEXITCODE), restarting in 15s"
    Start-Sleep -Seconds 15
}
