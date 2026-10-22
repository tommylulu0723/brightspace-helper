# 课程助手 · Windows 图形安装向导 / Course Helper · Windows installer
# 四页：选择语言 → 选择安装位置 → 安装进度 → 完成（打开 Chrome 里的安装引导页）
# 实际安装由 windows-setup.ps1 完成（同一个文件夹里有就用本地的，没有就从 GitHub 下载最新的）
param([string]$SetupScript = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
try { Add-Type -Namespace Win -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'; [Win.Dpi]::SetProcessDPIAware() | Out-Null } catch { }

$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero); $S = [math]::Max(1, $g.DpiX / 96); $g.Dispose()
function P($x, $y) { New-Object System.Drawing.Point([int]($x * $S), [int]($y * $S)) }
function Z($w, $h) { New-Object System.Drawing.Size([int]($w * $S), [int]($h * $S)) }

$Repo = 'tommylulu0723/brightspace-helper'
$Site = 'https://ddl.tommyxiaoshu.cn'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$LocFile = Join-Path $LogDir 'location.txt'
$Purple = [System.Drawing.Color]::FromArgb(87, 6, 140)
$Muted = [System.Drawing.Color]::FromArgb(100, 100, 110)
$Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5)
$FontBold = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5, [System.Drawing.FontStyle]::Bold)
$FontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 15, [System.Drawing.FontStyle]::Bold)
$FontBig = New-Object System.Drawing.Font('Microsoft YaHei UI', 12, [System.Drawing.FontStyle]::Bold)

# 默认语言跟随系统
$script:Lang = if ((Get-Culture).Name -like 'zh*') { 'zh' } else { 'en' }
function L($zh, $en) { if ($script:Lang -eq 'en') { $en } else { $zh } }

# ---------- 默认安装位置：已经装过就用原来的；否则第一个非系统盘 ----------
function Find-Existing {
  $c = @()
  if (Test-Path $LocFile) { $c += (Get-Content $LocFile -Raw).Trim() }
  $c += (Join-Path $env:USERPROFILE 'CourseHelper')
  try { $c += Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "$($_.DeviceID)\CourseHelper" } } catch { }
  foreach ($d in $c) { if ($d -and (Test-Path (Join-Path $d '.git'))) { return $d } }
  return $null
}
function Default-Dir {
  try {
    $disk = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object { $_.DeviceID -ne $env:SystemDrive -and $_.FreeSpace -gt 1GB } | Sort-Object DeviceID | Select-Object -First 1
    if ($disk) { return "$($disk.DeviceID)\CourseHelper" }
  } catch { }
  return (Join-Path $env:USERPROFILE 'CourseHelper')
}
$Existing = Find-Existing
$InitialDir = if ($Existing) { $Existing } else { Default-Dir }

# ---------- 窗口 ----------
$form = New-Object System.Windows.Forms.Form
# 高分屏（125% / 150% 缩放）：自己按比例算位置和大小（Windows 的自动缩放在脚本里不可靠，会出现字变大、窗口没变大、按钮被挤出去）
$form.AutoScaleMode = 'None'
$form.ClientSize = Z 600 460
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = $Font
$form.BackColor = [System.Drawing.Color]::White

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'; $header.Height = [int](70 * $S); $header.BackColor = $Purple
$hTitle = New-Object System.Windows.Forms.Label
$hTitle.ForeColor = 'White'; $hTitle.Font = $FontTitle; $hTitle.AutoSize = $true; $hTitle.Location = (P 24 10)
$hSub = New-Object System.Windows.Forms.Label
$hSub.ForeColor = [System.Drawing.Color]::FromArgb(225, 210, 240); $hSub.AutoSize = $true; $hSub.Location = (P 26 42)
$header.Controls.AddRange(@($hTitle, $hSub))
$form.Controls.Add($header)

function New-Page { $p = New-Object System.Windows.Forms.Panel; $p.Location = (P 0 70); $p.Size = (Z 600 390); $p.Visible = $false; $p.AutoScroll = $true; $form.Controls.Add($p); return $p }
function New-Label($parent, $text, $x, $y, $w = 510, $h = 0, $font = $Font, $color = $null) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = (P $x $y); $l.Font = $font
  if ($h) { $l.Size = (Z $w $h) } else { $l.MaximumSize = (Z $w 0); $l.AutoSize = $true }
  if ($color) { $l.ForeColor = $color }
  $parent.Controls.Add($l); return $l
}
function New-Button($parent, $text, $x, $y, $w = 100, $primary = $false, $h = 32) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = (P $x $y); $b.Size = (Z $w $h)
  if ($primary) { $b.BackColor = $Purple; $b.ForeColor = 'White'; $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderSize = 0; $b.Font = $FontBold }
  $parent.Controls.Add($b); return $b
}

# ---------- 第 0 页：选择语言 ----------
$p0 = New-Page
New-Label $p0 "请选择语言`nPlease choose your language" 28 26 544 0 $FontBig | Out-Null
New-Label $p0 "安装程序和课程助手都会使用这个语言，以后可以在课程助手的设置里切换。`nThe installer and Course Helper will use this language. You can change it later in Settings." 28 96 544 0 $Font $Muted | Out-Null
$zhBtn = New-Button $p0 '中文' 28 200 266 ($script:Lang -eq 'zh') 64
$enBtn = New-Button $p0 'English' 306 200 266 ($script:Lang -eq 'en') 64
$zhBtn.Font = $FontBig; $enBtn.Font = $FontBig

# ---------- 第 1 页：选择安装位置 ----------
$p1 = New-Page
$p1Title = New-Label $p1 '' 24 18 552 0 $FontBold
$p1Note = New-Label $p1 '' 24 44 552 0 $Font $Muted
$pathBox = New-Object System.Windows.Forms.TextBox
$pathBox.Location = (P 24 104); $pathBox.Size = (Z 440 28); $pathBox.Text = $InitialDir
$p1.Controls.Add($pathBox)
$browse = New-Button $p1 '' 472 102 104
$spaceLbl = New-Label $p1 '' 24 142 552 0 $Font $Muted
$box = New-Object System.Windows.Forms.GroupBox
$box.Location = (P 24 186); $box.Size = (Z 552 120)
$boxText = New-Label $box '' 14 26 520 0
$p1.Controls.Add($box)
$back1 = New-Button $p1 '' 24 330 100
$cancel1 = New-Button $p1 '' 364 330 100
$install = New-Button $p1 '' 476 330 100 $true

# ---------- 第 2 页：安装中 ----------
$p2 = New-Page
$p2Title = New-Label $p2 '' 24 18 552 0 $FontBold
$p2Note = New-Label $p2 '' 24 44 552 0 $Font $Muted
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = (P 24 92); $bar.Size = (Z 552 14); $bar.Style = 'Marquee'; $bar.MarqueeAnimationSpeed = 25
$p2.Controls.Add($bar)
$log = New-Object System.Windows.Forms.TextBox
$log.Location = (P 24 118); $log.Size = (Z 552 196); $log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'
$log.BackColor = [System.Drawing.Color]::FromArgb(247, 246, 249); $log.Font = New-Object System.Drawing.Font('Consolas', 9)
$p2.Controls.Add($log)
$back2 = New-Button $p2 '' 364 330 100
$back2.Visible = $false
$close2 = New-Button $p2 '' 476 330 100
$close2.Enabled = $false

# ---------- 第 3 页：完成 ----------
$p3 = New-Page
$p3Title = New-Label $p3 '' 24 18 552 0 $FontBold ([System.Drawing.Color]::FromArgb(22, 120, 60))
$steps = New-Label $p3 '' 24 54 552 0
$extLbl = New-Object System.Windows.Forms.TextBox
$extLbl.Location = (P 24 200); $extLbl.Size = (Z 552 28); $extLbl.ReadOnly = $true
$p3.Controls.Add($extLbl)
$p3Note = New-Label $p3 '' 24 240 552 0 $Font $Muted
$copyBtn = New-Button $p3 '' 24 330 120
$openGuide = New-Button $p3 '' 154 330 260 $true
$done = New-Button $p3 '' 476 330 100

function Apply-Lang {
  $form.Text = L '课程助手 安装' 'Course Helper Setup'
  $hTitle.Text = L '课程助手' 'Course Helper'
  $hSub.Text = L 'NYU Brightspace 截止时间 · 课件 · 成绩，一处看全' 'NYU Brightspace deadlines, files and grades in one place'
  $p1Title.Text = L '选择安装位置' 'Choose install location'
  $p1Note.Text = if ($Existing) { L '检测到已经安装在下面这个位置，继续会直接更新到最新版本。' 'Course Helper is already installed here; continuing updates it to the latest version.' } else { L '插件文件会放在这个文件夹里。建议放在 D 盘等非系统盘；以后在 Chrome 里加载的就是这里面的 extension 文件夹。' 'The extension files go into this folder (a non-system drive such as D: is recommended). Chrome will load the "extension" folder inside it.' }
  $browse.Text = L '浏览…' 'Browse…'
  $box.Text = L '安装程序会自动完成' 'The installer will'
  $boxText.Text = L "✓ 下载最新版的课程助手`n✓ 设置热更新：有新版本时插件里弹出`"检测到更新`"`n✓ 没有 Git 的话自动安装（可能弹出一次确认窗口）" "✓ Download the latest Course Helper`n✓ Set up hot updates: you'll see `"Update available`" in the extension`n✓ Install Git if needed (you may see one confirmation prompt)"
  $back1.Text = L '上一步' 'Back'
  $cancel1.Text = L '取消' 'Cancel'
  $install.Text = L '安装' 'Install'
  $p2Title.Text = L '正在安装…' 'Installing…'
  $p2Note.Text = L '第一次安装会下载 Git，可能需要一两分钟；如果弹出确认窗口，点"是"。' 'The first install downloads Git and may take a minute or two. If a confirmation window appears, click "Yes".'
  $back2.Text = L '返回' 'Back'
  $close2.Text = L '关闭' 'Close'
  $p3Title.Text = L '✓ 安装完成，最后在 Chrome 里点 3 下（只需要一次）' '✓ Installed! Three clicks in Chrome to finish (only once)'
  $steps.Text = L "1. 点下面的`"打开安装引导`"，按网页上的步骤做`n2. 在 Chrome 地址栏打开 chrome://extensions，打开右上角`"开发者模式`"`n3. 点`"加载已解压的扩展程序`"，选下面这个文件夹（路径已复制好）`n   以前装过旧的`"课程助手`"的话，先把旧的移除。" "1. Click `"Open setup guide`" below and follow the steps`n2. Open chrome://extensions and turn on `"Developer mode`" (top right)`n3. Click `"Load unpacked`" and pick this folder (path already copied)`n   If you had an older `"Course Helper`", remove it first."
  $p3Note.Text = L 'Chrome 规定没上架商店的插件只能由你自己点"加载"，安装程序没法替你点。以后有新版本，插件会弹出"检测到更新"，点"立即更新"就行。' 'Chrome only lets you load non-store extensions yourself, so the installer can''t click it for you. When a new version is out, the extension shows "Update available" — just click "Update now".'
  $copyBtn.Text = L '复制路径' 'Copy path'
  $openGuide.Text = L '打开安装引导（Chrome）' 'Open setup guide (Chrome)'
  $done.Text = L '完成' 'Done'
  Update-Space
}

function Update-Space {
  try {
    $root = [System.IO.Path]::GetPathRoot($pathBox.Text)
    $d = New-Object System.IO.DriveInfo($root)
    $gb = [math]::Round($d.AvailableFreeSpace / 1GB, 1)
    $spaceLbl.Text = L "$root 剩余空间 $gb GB · 课程助手需要约 5 MB（第一次会顺便安装 Git，约 300 MB）" "$root has $gb GB free · Course Helper needs about 5 MB (plus ~300 MB for Git the first time)"
  } catch { $spaceLbl.Text = '' }
}
$pathBox.Add_TextChanged({ Update-Space })

function Show-Page($p) { foreach ($x in @($p0, $p1, $p2, $p3)) { $x.Visible = ($x -eq $p) } }

$zhBtn.Add_Click({ $script:Lang = 'zh'; Apply-Lang; Show-Page $p1 })
$enBtn.Add_Click({ $script:Lang = 'en'; Apply-Lang; Show-Page $p1 })
$back1.Add_Click({ Show-Page $p0 })
$cancel1.Add_Click({ $form.Close() })
$close2.Add_Click({ $form.Close() })
$done.Add_Click({ $form.Close() })

$browse.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = L '选择一个文件夹，课程助手会装在它里面的 CourseHelper 文件夹' 'Choose a folder; Course Helper will be installed in a CourseHelper folder inside it'
  $dlg.ShowNewFolderButton = $true
  $parent = Split-Path $pathBox.Text -Parent
  if ($parent -and (Test-Path $parent)) { $dlg.SelectedPath = $parent }
  if ($dlg.ShowDialog($form) -eq 'OK') {
    $sel = $dlg.SelectedPath.TrimEnd('\')
    $pathBox.Text = if ((Split-Path $sel -Leaf) -ieq 'CourseHelper') { $sel } else { Join-Path $sel 'CourseHelper' }
  }
})

function Find-Chrome {
  @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
# Chrome 不允许别的程序直接打开 chrome://extensions（只会打开首页），所以打开我们的安装引导网页
$openGuide.Add_Click({
  $url = "$Site/install/?lang=$($script:Lang)&os=win&path=$([uri]::EscapeDataString($extLbl.Text))"
  $c = Find-Chrome
  if ($c) { Start-Process $c $url } else {
    [System.Windows.Forms.MessageBox]::Show((L '没找到 Google Chrome，先安装 Chrome 再按引导操作。' 'Google Chrome wasn''t found. Install Chrome first, then follow the guide.'), 'Course Helper') | Out-Null
    Start-Process $url
  }
})
$copyBtn.Add_Click({ try { [System.Windows.Forms.Clipboard]::SetText($extLbl.Text); $copyBtn.Text = L '已复制 ✓' 'Copied ✓' } catch { } })

# ---------- 拿到安装脚本 ----------
function Get-SetupScript {
  if ($SetupScript -and (Test-Path $SetupScript)) { return $SetupScript }
  $local = Join-Path $PSScriptRoot 'windows-setup.ps1'
  if ($PSScriptRoot -and (Test-Path $local)) { return $local }
  [Net.ServicePointManager]::SecurityProtocol = 'Tls12'
  $u = "https://api.github.com/repos/$Repo/contents/deploy/windows-setup.ps1?ref=main&t=$([DateTime]::Now.Ticks)"
  $r = Invoke-RestMethod $u -Headers @{ 'User-Agent' = 'course-helper' }
  $bytes = [Convert]::FromBase64String($r.content)
  $out = Join-Path $env:TEMP 'course-helper-setup.ps1'
  [IO.File]::WriteAllBytes($out, $bytes)
  return $out
}

# ---------- 安装 ----------
$script:proc = $null
$script:outFile = Join-Path $env:TEMP 'course-helper-install.log'
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400

function Read-Log {
  try {
    $fs = [IO.File]::Open($script:outFile, 'Open', 'Read', 'ReadWrite')
    $sr = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
    $t = $sr.ReadToEnd(); $sr.Close()
    $t = ($t -replace "`r", '') -replace "`n", "`r`n"
    if ($log.Text -ne $t) { $log.Text = $t; $log.SelectionStart = $log.Text.Length; $log.ScrollToCaret() }
  } catch { }
}

$timer.Add_Tick({
  Read-Log
  if ($script:proc -and $script:proc.HasExited) {
    $timer.Stop()
    Read-Log
    $bar.Style = 'Continuous'; $bar.Value = 100
    $dir = $pathBox.Text.TrimEnd('\')
    if ($script:proc.ExitCode -eq 0 -and (Test-Path (Join-Path $dir 'extension\manifest.json'))) {
      $ext = Join-Path $dir 'extension'
      $extLbl.Text = $ext
      try { [System.Windows.Forms.Clipboard]::SetText($ext) } catch { }
      Show-Page $p3
    } else {
      $p2Title.Text = L '✗ 安装没有完成' '✗ Installation did not finish'
      $p2Title.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
      $log.AppendText("`r`n`r`n" + (L '安装失败。可以把这个窗口截图发给开发者；或者点"返回"换个安装位置再试。' 'Installation failed. Send a screenshot of this window to the developer, or click "Back" to try another location.'))
      $back2.Visible = $true
      $close2.Enabled = $true
    }
  }
})
$back2.Add_Click({ $back2.Visible = $false; Apply-Lang; $p2Title.ForeColor = 'Black'; $bar.Style = 'Marquee'; Show-Page $p1 })

$install.Add_Click({
  $dir = $pathBox.Text.Trim().TrimEnd('\')
  if (-not $dir -or -not [System.IO.Path]::IsPathRooted($dir)) { [System.Windows.Forms.MessageBox]::Show((L '请选择一个完整的安装位置，例如 D:\CourseHelper' 'Please choose a full path, e.g. D:\CourseHelper'), 'Course Helper') | Out-Null; return }
  if ($dir -match '[^\x00-\x7F]') {
    if ([System.Windows.Forms.MessageBox]::Show((L "安装路径里有中文或特殊字符，个别电脑上 Git 可能出问题。`n建议换成英文路径，例如 D:\CourseHelper。`n`n仍然装在这里吗？" "The path contains non-English characters, which can confuse Git on some PCs.`nAn English path such as D:\CourseHelper is recommended.`n`nInstall here anyway?"), 'Course Helper', 'YesNo') -ne 'Yes') { return }
  }
  if ($Existing -and $dir -ne $Existing) {
    if ([System.Windows.Forms.MessageBox]::Show((L "你之前已经装在 $Existing。`n装到新位置后，需要在 Chrome 里移除旧的课程助手、重新加载新位置的 extension 文件夹。`n`n继续吗？" "Course Helper is already installed at $Existing.`nAfter installing to a new location you'll need to remove the old one in Chrome and load the new extension folder.`n`nContinue?"), 'Course Helper', 'YesNo') -ne 'Yes') { return }
  }
  $pathBox.Text = $dir
  Show-Page $p2
  $log.Text = (L "安装位置：$dir" "Install location: $dir") + "`r`n"
  try { $setup = Get-SetupScript } catch {
    $log.AppendText((L "下载安装脚本失败：$($_.Exception.Message)`r`n请检查网络后重试。" "Couldn't download the setup script: $($_.Exception.Message)`r`nCheck your network and try again."))
    $back2.Visible = $true; $close2.Enabled = $true; $bar.Style = 'Continuous'; return
  }
  Remove-Item $script:outFile -ErrorAction SilentlyContinue
  $q = { param($x) "'" + ($x -replace "'", "''") + "'" }
  $o = & $q $script:outFile
  $cmd = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; try { & $(& $q $setup) -Dir $(& $q $dir) -Lang $($script:Lang) -NoChrome *>&1 | Out-File -FilePath $o -Encoding utf8 -Append; exit 0 } catch { ('✗ ' + `$_.Exception.Message) | Out-File -FilePath $o -Encoding utf8 -Append; exit 1 }"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"$($cmd -replace '"', '\"')`""
  $psi.WindowStyle = 'Hidden'
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $timer.Start()
})

Apply-Lang
Show-Page $p0
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
