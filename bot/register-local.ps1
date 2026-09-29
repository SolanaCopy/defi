# One-time setup: start run-local.mjs hidden at every logon of this user.
# conhost --headless gives node no window. (A PowerShell runner launched by Task
# Scheduler hung before running a single line; a cmd loop hung after a kill.)
# Remove again with: Unregister-ScheduledTask -TaskName "SmartTradingClub Bot"
$runner = Join-Path $PSScriptRoot 'run-local.mjs'
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$node`" `"$runner`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SmartTradingClub Bot' -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Smart Trading Club bot (bot\run-local.mjs)' -Force | Out-Null
Start-ScheduledTask -TaskName 'SmartTradingClub Bot'
Get-ScheduledTask -TaskName 'SmartTradingClub Bot' | Select-Object TaskName, State
