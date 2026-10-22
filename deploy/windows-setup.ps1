# 课程助手 · Windows 自动更新一键安装
#
# 做三件事：
#   1. 把 GitHub 仓库下载到 C:\Users\你的用户名\CourseHelper（可以用 -Dir 换位置）
#   2. 在"任务计划程序"里加一个任务，每 1 分钟 git pull 一次（后台运行，不弹窗口）
#   3. 告诉你怎么在 Chrome 里加载插件
# 之后有新版本时，插件会在 1–2 分钟内自己重新加载并弹通知。
#
# 朋友安装（仓库公开时，一行命令，不用下载文件）：
#   iex ((irm https://raw.githubusercontent.com/tommylulu0723/brightspace-helper/main/deploy/windows-setup.ps1).TrimStart([char]0xFEFF))
# 用法（下载了这个文件时，在 PowerShell 里粘贴运行）：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1"
# 换安装位置：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1" -Dir "E:\CourseHelper"
# 卸载：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\CourseHelper\deploy\windows-uninstall.ps1"

param(
  [string]$Repo = 'tommylulu0723/brightspace-helper',
  [string]$Dir = (Join-Path $env:USERPROFILE 'CourseHelper')
)

$ErrorActionPreference = 'Stop'
$TaskName = 'CourseHelper AutoUpdate'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$Log = Join-Path $LogDir 'update.log'

function Ok($m) { Write-Host "✓ $m" -ForegroundColor Green }
# 用 throw 而不是 exit：一行命令（irm | iex）安装时 exit 会把整个 PowerShell 窗口关掉
function Fail($m) { Write-Host "✗ $m" -ForegroundColor Red; throw $m }

Write-Host '课程助手 · 自动更新安装' -ForegroundColor Cyan
Write-Host "仓库：github.com/$Repo"
Write-Host "位置：$Dir"
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
  Write-Host '没找到 git，正在用 winget 安装 Git for Windows（可能会弹出确认窗口）…'
  try {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
  } catch {
    Fail '自动安装失败。请到 https://git-scm.com/download/win 下载安装（全部默认选项），装完再运行一次这个脚本。'
  }
  $Git = Find-Git
  if (-not $Git) { Fail 'Git 装好了但还找不到，请关掉 PowerShell 重新打开，再运行一次这个脚本。' }
}
Ok "git 已就绪：$Git"

# 2. 下载或更新代码（私有仓库第一次会弹浏览器让你登录 GitHub，登录一次之后就记住了）
if (Test-Path (Join-Path $Dir '.git')) {
  & $Git -C $Dir pull --ff-only -q
  if ($LASTEXITCODE -ne 0) { Fail '拉取失败，看看上面的错误信息' }
  Ok '代码已是最新'
} else {
  if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) {
    Fail "$Dir 已经存在而且不是空的，请换个位置：加上 -Dir ""D:\CourseHelper"""
  }
  Write-Host '正在下载代码（私有仓库会弹出 GitHub 登录窗口，登录并授权即可）…'
  & $Git clone -q "https://github.com/$Repo.git" $Dir
  if ($LASTEXITCODE -ne 0) { Fail '下载失败：检查仓库名，或者确认 GitHub 登录的是有权限的账号' }
  Ok "代码已下载到 $Dir"
}
if (-not (Test-Path (Join-Path $Dir 'extension\manifest.json'))) { Fail '仓库里没找到 extension\manifest.json，代码可能还没推上去' }

# 3. 每分钟自动拉取：任务计划程序 + conhost --headless（后台运行，不会每分钟闪一个黑窗口）
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
# 后台拉取时不弹登录窗口（登录过期就跳过，日志里会记一笔）
$inner = "set ""GCM_INTERACTIVE=never"" && set ""GIT_TERMINAL_PROMPT=0"" && cd /d ""$Dir"" && ""$Git"" pull --ff-only -q >> ""$Log"" 2>&1"
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless cmd.exe /c ""$inner"""
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($every, $logon) -Settings $settings -Principal $principal -Description '每分钟从 GitHub 拉取课程助手的新版本' | Out-Null
Start-ScheduledTask -TaskName $TaskName
Ok '每 1 分钟自动检查更新（开机登录后也会自动运行）'

$ExtDir = Join-Path $Dir 'extension'
try { Set-Clipboard -Value $ExtDir } catch { }

# 找 Chrome，直接打开扩展程序页面
$Chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host ''
Write-Host '================ 最后一步（只需要一次，约 20 秒）================' -ForegroundColor Cyan
Write-Host '已经帮你打开 Chrome 的扩展程序页面，并把插件文件夹的位置复制好了：'
Write-Host '  1. 打开右上角的"开发者模式"开关'
Write-Host '  2. 点左上角"加载已解压的扩展程序"'
Write-Host '  3. 在弹出窗口顶部的地址栏按 Ctrl+V，回车，再点"选择文件夹"'
Write-Host "     （文件夹位置：$ExtDir）"
Write-Host '  以前装过旧的"课程助手"的话，先把旧的移除。'
Write-Host ''
Write-Host '装好之后有新版本时，插件会弹出"检测到更新"，点"立即更新"就好，永远不用重装。' -ForegroundColor Green
Write-Host "（Chrome 规定插件只能由你自己点"加载"，脚本没法替你点这一下）"
if ($Chrome) { Start-Process $Chrome 'chrome://extensions/' } else { Write-Host '没找到 Chrome，请自己打开 Chrome，在地址栏输入 chrome://extensions' -ForegroundColor Yellow }
