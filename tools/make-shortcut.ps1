# Tạo shortcut ToDoApp (Desktop + Start Menu). Chạy lại nếu đổi vị trí thư mục.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) { throw "Không thấy $exe - chạy 'npm install' trước." }

$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $lnk = $ws.CreateShortcut((Join-Path $dir 'ToDoApp.lnk'))
  $lnk.TargetPath       = $exe
  $lnk.Arguments        = '"' + $root + '"'
  $lnk.WorkingDirectory = $root
  $ico = Join-Path $root 'icon.ico'          # .ico thật -> Explorer/taskbar hiện logo ToDoApp thay vì logo Electron
  if (-not (Test-Path $ico)) { $ico = Join-Path $root 'icon.png' }
  $lnk.IconLocation     = "$ico,0"
  $lnk.Description      = 'ToDoApp - quản lý công việc'
  $lnk.Save()
  Write-Output "OK -> $(Join-Path $dir 'ToDoApp.lnk')"
}
