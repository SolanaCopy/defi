# One-time setup: start run-local.cmd hidden at every logon of this user.
# conhost --headless gives cmd no window. (A PowerShell runner launched by Task
# Scheduler hung before running a single line, so the loop lives in cmd.)
# Remove again with: Unregister-ScheduledTask -TaskName "SmartTradingClub Bot"
$runner = Join-Path $PSScriptRoot 'run-local.cmd'
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SmartTradingClub Bot' -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Smart Trading Club bot (bot\run-local.cmd)' -Force | Out-Null
Start-ScheduledTask -TaskName 'SmartTradingClub Bot'
Get-ScheduledTask -TaskName 'SmartTradingClub Bot' | Select-Object TaskName, State
