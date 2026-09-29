# One-time setup: start run-local.ps1 hidden at every logon of this user.
# Remove again with: Unregister-ScheduledTask -TaskName "SmartTradingClub Bot"
$script = Join-Path $PSScriptRoot 'run-local.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'SmartTradingClub Bot' -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Smart Trading Club bot (bot\run-local.ps1)' -Force | Out-Null
Start-ScheduledTask -TaskName 'SmartTradingClub Bot'
Get-ScheduledTask -TaskName 'SmartTradingClub Bot' | Select-Object TaskName, State
