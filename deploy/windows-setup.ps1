# 课程助手 · Windows 自动更新一键安装
#
# 做三件事：
#   1. 把 GitHub 仓库下载到 C:\Users\你的用户名\CourseHelper（可以用 -Dir 换位置）
#   2. 在"任务计划程序"里加一个任务，每 1 分钟 git pull 一次（后台运行，不弹窗口）
#   3. 告诉你怎么在 Chrome 里加载插件
# 之后有新版本时，插件会在 1–2 分钟内自己重新加载并弹通知。
#
# 朋友安装（仓库公开时，一行命令，不用下载文件）：
#   $u='https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/windows-setup.ps1?ref=main&t='+[DateTime]::Now.Ticks; $s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((irm $u -Headers @{'User-Agent'='course-helper'}).content)); iex $s.TrimStart([char]0xFEFF)
# 用法（下载了这个文件时，在 PowerShell 里粘贴运行）：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1"
# 换安装位置：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1" -Dir "E:\CourseHelper"
# 卸载：
#   双击 Windows-卸载课程助手.bat
# 默认位置：第一个不是系统盘的本地硬盘（如 D:\CourseHelper）；只有 C 盘时放在 C:\Users\你\CourseHelper。
# 已经装过的话沿用原来的位置。

param(
  [string]$Repo = 'tommylulu0723/brightspace-helper',
  [string]$Dir = '',
  [switch]$NoChrome,  # 图形安装向导调用时用：最后一步由向导自己显示
  [string]$Lang = ''  # zh / en：安装过程的提示语言，也作为插件的默认语言
)

$ErrorActionPreference = 'Stop'
$TaskName = 'CourseHelper AutoUpdate'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$Log = Join-Path $LogDir 'update.log'
$LocFile = Join-Path $LogDir 'location.txt'   # 记住装在哪，卸载 / 重装时用

function Find-Existing {
  $c = @()
  if (Test-Path $LocFile) { $c += (Get-Content $LocFile -Raw).Trim() }
  $c += (Join-Path $env:USERPROFILE 'CourseHelper')
  try { $c += Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "$($_.DeviceID)\CourseHelper" } } catch { }
  foreach ($d in $c) { if ($d -and (Test-Path (Join-Path $d '.git'))) { return $d } }
  return $null
}
function Default-Dir {
  # 优先放在不是系统盘、剩余空间 > 1GB 的本地硬盘
  try {
    $sys = $env:SystemDrive
    $disk = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object { $_.DeviceID -ne $sys -and $_.FreeSpace -gt 1GB } | Sort-Object DeviceID | Select-Object -First 1
    if ($disk) { return "$($disk.DeviceID)\CourseHelper" }
  } catch { }
  return (Join-Path $env:USERPROFILE 'CourseHelper')
}
if (-not $Dir) { $Dir = Find-Existing }
if (-not $Dir) { $Dir = Default-Dir }

if ($Lang -ne 'zh' -and $Lang -ne 'en') { $Lang = if ((Get-Culture).Name -like 'zh*') { 'zh' } else { 'en' } }
function L($zh, $en) { if ($Lang -eq 'en') { $en } else { $zh } }
function Ok($m) { Write-Host "✓ $m" -ForegroundColor Green }
# 用 throw 而不是 exit：一行命令（irm | iex）安装时 exit 会把整个 PowerShell 窗口关掉
function Fail($m) { Write-Host "✗ $m" -ForegroundColor Red; throw $m }

Write-Host (L '课程助手 · 自动更新安装' 'Course Helper · setup with auto-update') -ForegroundColor Cyan
Write-Host ((L '仓库：' 'Repository: ') + "github.com/$Repo")
Write-Host ((L '位置：' 'Location: ') + $Dir)
Write-Host ''

# 1. 找 git，没有就用 winget 装
function Find-Git {
  $cmd = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe", "${env:ProgramFiles(x86)}\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}
$Git = Find-Git
if (-not $Git) {
  Write-Host (L '没找到 git，正在用 winget 安装 Git for Windows（可能会弹出确认窗口）…' 'Git not found — installing Git for Windows with winget (a confirmation window may appear)…')
  try {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
  } catch {
    Fail (L '自动安装失败。请到 https://git-scm.com/download/win 下载安装（全部默认选项），装完再运行一次这个脚本。' 'Automatic install failed. Download Git from https://git-scm.com/download/win (all default options), then run this again.')
  }
  $Git = Find-Git
  if (-not $Git) { Fail (L 'Git 装好了但还找不到，请关掉 PowerShell 重新打开，再运行一次这个脚本。' 'Git was installed but can''t be found yet. Close this window, reopen it and run the installer again.') }
}
Ok ((L 'git 已就绪：' 'Git ready: ') + $Git)

# 2. 下载或更新代码（私有仓库第一次会弹浏览器让你登录 GitHub，登录一次之后就记住了）
if (Test-Path (Join-Path $Dir '.git')) {
  & $Git -C $Dir pull --ff-only -q
  if ($LASTEXITCODE -ne 0) { Fail (L '拉取失败，看看上面的错误信息' 'Update failed — see the error above') }
  Ok (L '代码已是最新' 'Already up to date')
} else {
  if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) {
    Fail (L "$Dir 已经存在而且不是空的，请换个位置" "$Dir already exists and isn't empty — please choose another location")
  }
  Write-Host (L '正在下载课程助手…' 'Downloading Course Helper…')
  & $Git clone -q "https://github.com/$Repo.git" $Dir
  if ($LASTEXITCODE -ne 0) { Fail (L '下载失败：检查网络后再试' 'Download failed — check your network and try again') }
  Ok ((L '已下载到 ' 'Downloaded to ') + $Dir)
}
if (-not (Test-Path (Join-Path $Dir 'extension\manifest.json'))) { Fail (L '仓库里没找到 extension\manifest.json' 'extension\manifest.json not found in the download') }
# 插件的默认语言（不进 git，不会和更新冲突）
try { [IO.File]::WriteAllText((Join-Path $Dir 'extension\lang.local.json'), "{""lang"":""$Lang""}", (New-Object Text.UTF8Encoding($false))) } catch { }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Content -Path $LocFile -Value $Dir -Encoding UTF8

# 3. 每分钟自动拉取：任务计划程序 + conhost --headless（后台运行，不会每分钟闪一个黑窗口）
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
# 后台拉取时不弹登录窗口（登录过期就跳过，日志里会记一笔）
# 任务计划程序最快只能每分钟运行一次，所以每次运行里拉 4 次（间隔 15 秒），新版本十几秒内就能拉下来
$pull = """$Git"" pull --ff-only -q >> ""$Log"" 2>&1"
$wait = 'ping -n 16 127.0.0.1 >nul'
$inner = "set ""GCM_INTERACTIVE=never"" && set ""GIT_TERMINAL_PROMPT=0"" && cd /d ""$Dir"" && ($pull & $wait & $pull & $wait & $pull & $wait & $pull)"
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless cmd.exe /c ""$inner"""
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
# 已经装过：先删掉旧任务再重建。旧任务如果是用"管理员"窗口建的，普通窗口删不掉，这时保留旧任务（它照样每分钟运行）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Ok (L '自动更新：之前已经设置好了，保留原来的任务' 'Auto-update: already set up, keeping the existing task')
} else {
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($every, $logon) -Settings $settings -Principal $principal -Description '每 15 秒从 GitHub 拉取课程助手的新版本' -ErrorAction Stop | Out-Null
    Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Ok (L '每 15 秒自动检查更新（开机登录后也会自动运行）' 'Checks for updates every 15 seconds (also after you log in to Windows)')
  } catch {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Ok (L '自动更新：之前已经设置好了，保留原来的任务' 'Auto-update: already set up, keeping the existing task') }
    else { Fail ((L '设置自动更新任务失败：' 'Couldn''t set up the auto-update task: ') + $_) }
  }
}

$ExtDir = Join-Path $Dir 'extension'
if ($NoChrome) { Ok ((L '安装完成：' 'Installed: ') + $ExtDir); return }
try { Set-Clipboard -Value $ExtDir } catch { }

# 找 Chrome，直接打开扩展程序页面
$Chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1

$Guide = "https://ddl.tommyxiaoshu.cn/install/?lang=$Lang&os=win&path=$([uri]::EscapeDataString($ExtDir))"
Write-Host ''
Write-Host (L '================ 最后一步（只需要一次，约 20 秒）================' '================ Last step (only once, ~20 seconds) ================') -ForegroundColor Cyan
Write-Host (L '已经在 Chrome 里打开安装引导，插件文件夹的位置也复制好了：' 'A setup guide has opened in Chrome, and the extension folder path is copied:')
Write-Host (L '  1. Chrome 地址栏打开 chrome://extensions ，打开右上角的"开发者模式"' '  1. Open chrome://extensions and turn on "Developer mode" (top right)')
Write-Host (L '  2. 点左上角"加载已解压的扩展程序"' '  2. Click "Load unpacked" (top left)')
Write-Host (L '  3. 在弹出窗口顶部的地址栏按 Ctrl+V，回车，再点"选择文件夹"' '  3. Press Ctrl+V in the address bar at the top of the dialog, Enter, then "Select Folder"')
Write-Host ((L '     （文件夹位置：' '     (folder: ') + $ExtDir + (L '）' ')'))
Write-Host ''
Write-Host (L '装好之后有新版本时，插件会弹出"检测到更新"，点"立即更新"就好，永远不用重装。' 'After that, new versions show "Update available" in the extension — click "Update now". No reinstalling.') -ForegroundColor Green
# Chrome 不允许别的程序直接打开 chrome://extensions（只会打开首页），所以打开安装引导网页
if ($Chrome) { Start-Process $Chrome $Guide } else { Start-Process $Guide }
