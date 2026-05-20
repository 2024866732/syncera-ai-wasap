' Hidden launcher — runs SYNCERA.bat without showing CMD window
Set WshShell = CreateObject("WScript.Shell")
Dim sScriptDir
sScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = sScriptDir
WshShell.Run """" & sScriptDir & "\SYNCERA.bat""", 0, False
