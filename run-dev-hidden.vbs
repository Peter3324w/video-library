' Starts the dev app with no console window, detached from whatever launched
' it. Run through explorer.exe from WSL, the app lands outside WSL's interop
' job, so closing WSL doesn't take it down.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c run-dev.cmd", 0, False
