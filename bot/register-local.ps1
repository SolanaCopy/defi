# One-time setup: start the bot hidden at every logon of this user, through a
# shortcut in the Windows Startup folder -> run-hidden.vbs -> run-local.mjs.
#
# Task Scheduler was tried first and dropped: a PowerShell runner hung before
# its first line, a cmd loop hung after a kill, node under a headless conhost
# lost the bot's output, and wscript hung when launched by a task. The same
# wscript call from the Startup folder behaves like a manual start.
#
# Remove again by deleting "SmartTradingClub Bot.lnk" from shell:startup.
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'SmartTradingClub Bot.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
$shortcut.Arguments = "`"$(Join-Path $PSScriptRoot 'run-hidden.vbs')`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Smart Trading Club bot (bot\run-local.mjs)'
$shortcut.Save()
Start-Process -FilePath $lnk
"Startup shortcut: $lnk"
