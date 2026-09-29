' Starts run-local.mjs with no window. Launched at logon by the Startup-folder
' shortcut "SmartTradingClub Bot" (register-local.ps1).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
node = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
sh.Run """" & node & """ """ & dir & "\run-local.mjs""", 0, False
