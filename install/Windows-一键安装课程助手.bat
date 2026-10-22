@echo off
chcp 65001 >nul
title Course Helper Setup
echo.
echo   正在打开安装程序… / Opening the installer…
echo.
cd /d "%TEMP%"
set "LOCAL=%~dp0windows-installer.ps1"
if exist "%LOCAL%" (
  start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%LOCAL%"
  exit /b 0
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; try { $u='https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/windows-installer.ps1?ref=main&t='+[DateTime]::Now.Ticks; $b=[Convert]::FromBase64String((irm $u -Headers @{'User-Agent'='course-helper'}).content); [IO.File]::WriteAllBytes((Join-Path $env:TEMP 'course-helper-installer.ps1'), $b) } catch { Write-Host ('Download failed: ' + $_) -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo.
  echo   Could not download the installer. Check your network and try again.
  pause
  exit /b 1
)
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%TEMP%\course-helper-installer.ps1"
exit /b 0
