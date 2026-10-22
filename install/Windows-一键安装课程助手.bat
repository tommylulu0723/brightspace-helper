@echo off
chcp 65001 >nul
title 课程助手 一键安装
echo.
echo   课程助手 一键安装（含每分钟热更新）
echo   ----------------------------------------
echo.
set "LOCAL=%~dp0windows-setup.ps1"
if exist "%LOCAL%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCAL%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; try { iex ((irm 'https://raw.githubusercontent.com/tommylulu0723/brightspace-helper/main/deploy/windows-setup.ps1').TrimStart([char]0xFEFF)) } catch { Write-Host ('Install failed: ' + $_) -ForegroundColor Red }"
)
echo.
echo   按任意键关闭这个窗口
pause >nul
