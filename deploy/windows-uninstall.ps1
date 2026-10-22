# 课程助手 · Windows 卸载
# 做三件事：关掉每 15 秒的自动更新任务 → 删除插件文件夹（会先问你）→ 删除更新日志
# 不会卸载 Git（别的软件可能也在用）。Chrome 里的插件需要你自己点一下"移除"。
$ErrorActionPreference = 'Continue'
$TaskName = 'CourseHelper AutoUpdate'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$LocFile = Join-Path $LogDir 'location.txt'
function Ok($m) { Write-Host "✓ $m" -ForegroundColor Green }

Write-Host '课程助手 · 卸载 / Course Helper · uninstall' -ForegroundColor Cyan
Write-Host ''

# 1. 自动更新任务（如果当初是用"管理员"窗口装的，需要管理员权限才能删，会弹一个确认框）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host '自动更新任务需要管理员权限，马上会弹出确认框，点"是" / Admin rights needed to remove the update task — click "Yes" when asked' -ForegroundColor Yellow
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
  } catch { }
}
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host '✗ 自动更新任务没删掉：请右键这个 bat → 以管理员身份运行 / Could not remove the task: right-click the .bat → Run as administrator' -ForegroundColor Red
} else { Ok '已关闭自动更新 / Auto-update removed' }

# 2. 找到插件文件夹
$dirs = @()
if (Test-Path $LocFile) { $dirs += (Get-Content $LocFile -Raw).Trim() }
$dirs += (Join-Path $env:USERPROFILE 'CourseHelper')
try { $dirs += Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "$($_.DeviceID)\CourseHelper" } } catch { }
$found = $dirs | Where-Object { $_ -and (Test-Path (Join-Path $_ 'extension\manifest.json')) } | Select-Object -Unique

if (-not $found) {
  Write-Host '没找到课程助手的文件夹 / Course Helper folder not found'
} else {
  foreach ($d in $found) {
    Write-Host ''
    Write-Host "找到插件文件夹 / Found folder: $d"
    $ans = Read-Host '删除这个文件夹？/ Delete it? (y = yes, Enter = keep)'
    if ($ans -match '^[yY]') {
      Set-Location $env:TEMP
      Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
      if (Test-Path $d) { Write-Host "✗ 有文件被占用，先关掉 Chrome 再运行一次 / Some files are in use — close Chrome and run again: $d" -ForegroundColor Red }
      else { Ok "已删除 / Deleted: $d" }
    } else { Write-Host "  保留了 / Kept: $d" }
  }
}

# 3. 日志
Remove-Item -Recurse -Force $LogDir -ErrorAction SilentlyContinue
Ok '已清理更新日志 / Logs removed'

Write-Host ''
Write-Host '最后一步：在 Chrome 地址栏打开 chrome://extensions ，找到"课程助手"点"移除"' -ForegroundColor Cyan
Write-Host 'Last step: open chrome://extensions in Chrome and click "Remove" on Course Helper' -ForegroundColor Cyan
