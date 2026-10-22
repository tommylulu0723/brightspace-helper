# 课程助手 · Windows 卸载
# 做三件事：关掉每 15 秒的自动更新任务 → 删除插件文件夹（会先问你）→ 删除更新日志
# 不会卸载 Git（别的软件可能也在用）。Chrome 里的插件需要你自己点一下"移除"。
$ErrorActionPreference = 'Continue'
$TaskName = 'CourseHelper AutoUpdate'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$LocFile = Join-Path $LogDir 'location.txt'
function Ok($m) { Write-Host "✓ $m" -ForegroundColor Green }

Write-Host '课程助手 · 卸载' -ForegroundColor Cyan
Write-Host ''

# 1. 自动更新任务（如果当初是用"管理员"窗口装的，需要管理员权限才能删，会弹一个确认框）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host '自动更新任务需要管理员权限才能删除，马上会弹出确认框，点"是"…' -ForegroundColor Yellow
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
  } catch { }
}
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host '✗ 自动更新任务没删掉：请在这个 bat 上右键 → 以管理员身份运行' -ForegroundColor Red
} else { Ok '已关闭自动更新' }

# 2. 找到插件文件夹
$dirs = @()
if (Test-Path $LocFile) { $dirs += (Get-Content $LocFile -Raw).Trim() }
$dirs += (Join-Path $env:USERPROFILE 'CourseHelper')
try { $dirs += Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "$($_.DeviceID)\CourseHelper" } } catch { }
$found = $dirs | Where-Object { $_ -and (Test-Path (Join-Path $_ 'extension\manifest.json')) } | Select-Object -Unique

if (-not $found) {
  Write-Host '没找到课程助手的文件夹（可能已经删掉了）'
} else {
  foreach ($d in $found) {
    Write-Host ''
    Write-Host "找到插件文件夹：$d"
    $ans = Read-Host '删除这个文件夹吗？输入 y 回车删除，直接回车保留'
    if ($ans -match '^[yY]') {
      Set-Location $env:TEMP
      Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
      if (Test-Path $d) { Write-Host "✗ 有文件被占用没删干净，先关掉 Chrome 再运行一次，或者手动删除 $d" -ForegroundColor Red }
      else { Ok "已删除 $d" }
    } else { Write-Host "  保留了 $d" }
  }
}

# 3. 日志
Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue
Ok '已清理更新日志'

Write-Host ''
Write-Host '最后一步：在 Chrome 的扩展程序页面找到"课程助手"，点"移除"。' -ForegroundColor Cyan
Write-Host '（Chrome 规定插件只能由你自己移除；已经帮你打开了这个页面）'
$Chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Chrome) { Start-Process $Chrome 'chrome://extensions/' }
