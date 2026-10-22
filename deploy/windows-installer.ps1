# 课程助手 · Windows 图形安装向导
# 三页：选择安装位置 → 安装进度 → 完成（在 Chrome 里加载）
# 实际安装由 windows-setup.ps1 完成（同一个文件夹里有就用本地的，没有就从 GitHub 下载最新的）
param([string]$SetupScript = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
try { Add-Type -Namespace Win -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'; [Win.Dpi]::SetProcessDPIAware() | Out-Null } catch { }

$Repo = 'tommylulu0723/brightspace-helper'
$LogDir = Join-Path $env:LOCALAPPDATA 'CourseHelper'
$LocFile = Join-Path $LogDir 'location.txt'
$Purple = [System.Drawing.Color]::FromArgb(87, 6, 140)
$Muted = [System.Drawing.Color]::FromArgb(100, 100, 110)
$Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5)
$FontBold = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5, [System.Drawing.FontStyle]::Bold)
$FontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 15, [System.Drawing.FontStyle]::Bold)

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
# 高分屏（125% / 150% 缩放）下按比例放大，文字清晰、布局不乱
$form.AutoScaleDimensions = New-Object System.Drawing.SizeF(96, 96)
$form.AutoScaleMode = 'Dpi'
$form.Text = '课程助手 安装'
$form.ClientSize = New-Object System.Drawing.Size(560, 400)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = $Font
$form.BackColor = [System.Drawing.Color]::White

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'; $header.Height = 70; $header.BackColor = $Purple
$hTitle = New-Object System.Windows.Forms.Label
$hTitle.Text = '课程助手'; $hTitle.ForeColor = 'White'; $hTitle.Font = $FontTitle; $hTitle.AutoSize = $true; $hTitle.Location = '24,10'
$hSub = New-Object System.Windows.Forms.Label
$hSub.Text = 'NYU Brightspace 截止时间 · 课件 · 成绩，一处看全'; $hSub.ForeColor = [System.Drawing.Color]::FromArgb(225, 210, 240); $hSub.AutoSize = $true; $hSub.Location = '26,42'
$header.Controls.AddRange(@($hTitle, $hSub))
$form.Controls.Add($header)

function New-Page { $p = New-Object System.Windows.Forms.Panel; $p.Location = '0,70'; $p.Size = '560,330'; $p.Visible = $false; $form.Controls.Add($p); return $p }
function New-Label($parent, $text, $x, $y, $w = 510, $h = 0, $font = $Font, $color = $null) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = "$x,$y"; $l.Font = $font
  if ($h) { $l.Size = "$w,$h" } else { $l.MaximumSize = "$w,0"; $l.AutoSize = $true }
  if ($color) { $l.ForeColor = $color }
  $parent.Controls.Add($l); return $l
}
function New-Button($parent, $text, $x, $y, $w = 100, $primary = $false) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = "$x,$y"; $b.Size = "$w,32"
  if ($primary) { $b.BackColor = $Purple; $b.ForeColor = 'White'; $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderSize = 0; $b.Font = $FontBold }
  $parent.Controls.Add($b); return $b
}

# ---------- 第 1 页：选择安装位置 ----------
$p1 = New-Page
New-Label $p1 '选择安装位置' 24 18 510 0 $FontBold | Out-Null
$note = if ($Existing) { "检测到已经安装在下面这个位置，继续会直接更新到最新版本。" } else { '插件文件会放在这个文件夹里。建议放在 D 盘等非系统盘；以后在 Chrome 里加载的就是这里面的 extension 文件夹。' }
New-Label $p1 $note 24 44 510 0 $Font $Muted | Out-Null
$pathBox = New-Object System.Windows.Forms.TextBox
$pathBox.Location = '24,96'; $pathBox.Size = '400,28'; $pathBox.Text = $InitialDir
$p1.Controls.Add($pathBox)
$browse = New-Button $p1 '浏览…' 432 94 100
$browse.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = '选择一个文件夹，课程助手会装在它里面的 CourseHelper 文件夹'
  $dlg.ShowNewFolderButton = $true
  $parent = Split-Path $pathBox.Text -Parent
  if ($parent -and (Test-Path $parent)) { $dlg.SelectedPath = $parent }
  if ($dlg.ShowDialog($form) -eq 'OK') {
    $sel = $dlg.SelectedPath.TrimEnd('\')
    $pathBox.Text = if ((Split-Path $sel -Leaf) -ieq 'CourseHelper') { $sel } else { Join-Path $sel 'CourseHelper' }
  }
})
$spaceLbl = New-Label $p1 '' 24 132 510 0 $Font $Muted
function Update-Space {
  try {
    $root = [System.IO.Path]::GetPathRoot($pathBox.Text)
    $d = New-Object System.IO.DriveInfo($root)
    $spaceLbl.Text = "$root 剩余空间 $([math]::Round($d.AvailableFreeSpace / 1GB, 1)) GB · 课程助手需要约 5 MB（第一次会顺便安装 Git，约 300 MB）"
  } catch { $spaceLbl.Text = '' }
}
$pathBox.Add_TextChanged({ Update-Space }); Update-Space

$box = New-Object System.Windows.Forms.GroupBox
$box.Text = '安装程序会自动完成'; $box.Location = '24,168'; $box.Size = '508,96'
New-Label $box "✓ 下载最新版的课程助手`n✓ 设置热更新：每 15 秒检查一次，有新版本时插件里弹出`"检测到更新`"`n✓ 没有 Git 的话自动安装（可能弹出一次确认窗口）" 14 24 480 0 | Out-Null
$p1.Controls.Add($box)
$cancel1 = New-Button $p1 '取消' 330 282 96
$cancel1.Add_Click({ $form.Close() })
$install = New-Button $p1 '安装' 436 282 96 $true

# ---------- 第 2 页：安装中 ----------
$p2 = New-Page
$p2Title = New-Label $p2 '正在安装…' 24 18 510 0 $FontBold
New-Label $p2 '第一次安装会下载 Git，可能需要一两分钟；如果弹出确认窗口，点"是"。' 24 44 510 0 $Font $Muted | Out-Null
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = '24,78'; $bar.Size = '508,14'; $bar.Style = 'Marquee'; $bar.MarqueeAnimationSpeed = 25
$p2.Controls.Add($bar)
$log = New-Object System.Windows.Forms.TextBox
$log.Location = '24,104'; $log.Size = '508,166'; $log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'
$log.BackColor = [System.Drawing.Color]::FromArgb(247, 246, 249); $log.Font = New-Object System.Drawing.Font('Consolas', 9)
$p2.Controls.Add($log)
$back2 = New-Button $p2 '返回' 330 282 96
$back2.Visible = $false
$close2 = New-Button $p2 '关闭' 436 282 96
$close2.Add_Click({ $form.Close() })
$close2.Enabled = $false

# ---------- 第 3 页：完成 ----------
$p3 = New-Page
New-Label $p3 '✓ 安装完成，最后在 Chrome 里点 3 下（只需要一次）' 24 18 510 0 $FontBold ([System.Drawing.Color]::FromArgb(22, 120, 60)) | Out-Null
$steps = New-Label $p3 '' 24 50 510 0
$extLbl = New-Object System.Windows.Forms.TextBox
$extLbl.Location = '24,168'; $extLbl.Size = '508,28'; $extLbl.ReadOnly = $true
$p3.Controls.Add($extLbl)
New-Label $p3 'Chrome 规定没上架商店的插件只能由你自己点"加载"，安装程序没法替你点这一下。以后有新版本，插件会弹出"检测到更新"，点"立即更新"就行，不用再运行安装程序。' 24 206 510 0 $Font $Muted | Out-Null
$copyBtn = New-Button $p3 '复制路径' 24 282 96
$openChrome = New-Button $p3 '打开 Chrome 扩展程序页面' 130 282 200 $true
$done = New-Button $p3 '完成' 436 282 96
$done.Add_Click({ $form.Close() })

function Show-Page($p) { foreach ($x in @($p1, $p2, $p3)) { $x.Visible = ($x -eq $p) } }

function Find-Chrome {
  @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
$openChrome.Add_Click({
  $c = Find-Chrome
  if ($c) { Start-Process $c 'chrome://extensions/' } else { [System.Windows.Forms.MessageBox]::Show('没找到 Chrome。请先安装 Google Chrome，再在地址栏输入 chrome://extensions', '课程助手') | Out-Null }
})
$copyBtn.Add_Click({ try { [System.Windows.Forms.Clipboard]::SetText($extLbl.Text); $copyBtn.Text = '已复制 ✓' } catch { } })

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
      $steps.Text = "1. 点下面的`"打开 Chrome 扩展程序页面`"`n2. 打开右上角的`"开发者模式`"开关，点左上角`"加载已解压的扩展程序`"`n3. 在弹出窗口顶部的地址栏按 Ctrl+V（路径已经复制好了），回车，点`"选择文件夹`"`n   以前装过旧的`"课程助手`"的话，先把旧的移除。"
      Show-Page $p3
    } else {
      $p2Title.Text = '✗ 安装没有完成'
      $p2Title.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
      $log.AppendText("`r`n`r`n安装失败。可以把这个窗口截图发给开发者；或者点`"返回`"换个安装位置再试。")
      $back2.Visible = $true
      $close2.Enabled = $true
    }
  }
})
$back2.Add_Click({ $back2.Visible = $false; $p2Title.Text = '正在安装…'; $p2Title.ForeColor = 'Black'; $bar.Style = 'Marquee'; Show-Page $p1 })

$install.Add_Click({
  $dir = $pathBox.Text.Trim().TrimEnd('\')
  if (-not $dir -or -not [System.IO.Path]::IsPathRooted($dir)) { [System.Windows.Forms.MessageBox]::Show('请选择一个完整的安装位置，例如 D:\CourseHelper', '课程助手') | Out-Null; return }
  if ($dir -match '[^\x00-\x7F]') {
    if ([System.Windows.Forms.MessageBox]::Show("安装路径里有中文或特殊字符，个别电脑上 Git 可能出问题。`n建议换成英文路径，例如 D:\CourseHelper。`n`n仍然装在这里吗？", '课程助手', 'YesNo') -ne 'Yes') { return }
  }
  if ($Existing -and $dir -ne $Existing) {
    if ([System.Windows.Forms.MessageBox]::Show("你之前已经装在 $Existing。`n装到新位置后，需要在 Chrome 里移除旧的课程助手、重新加载新位置的 extension 文件夹。`n`n继续吗？", '课程助手', 'YesNo') -ne 'Yes') { return }
  }
  $pathBox.Text = $dir
  Show-Page $p2
  $log.Text = "安装位置：$dir`r`n"
  try { $setup = Get-SetupScript } catch {
    $log.AppendText("下载安装脚本失败：$($_.Exception.Message)`r`n请检查网络后重试。")
    $back2.Visible = $true; $close2.Enabled = $true; $bar.Style = 'Continuous'; return
  }
  Remove-Item $script:outFile -ErrorAction SilentlyContinue
  $q = { param($x) "'" + ($x -replace "'", "''") + "'" }
  $o = & $q $script:outFile
  $cmd = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; try { & $(& $q $setup) -Dir $(& $q $dir) -NoChrome *>&1 | Out-File -FilePath $o -Encoding utf8 -Append; exit 0 } catch { ('✗ ' + `$_.Exception.Message) | Out-File -FilePath $o -Encoding utf8 -Append; exit 1 }"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"$($cmd -replace '"', '\"')`""
  $psi.WindowStyle = 'Hidden'
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $timer.Start()
})

Show-Page $p1
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
