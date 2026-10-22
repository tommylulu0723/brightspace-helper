@echo off
chcp 65001 >nul
title Course Helper Uninstall
echo.
echo   课程助手 卸载 / Course Helper uninstall
echo   ----------------------------------------
echo.
set "LOCAL=%~dp0windows-uninstall.ps1"
if exist "%LOCAL%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCAL%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; try { $u='https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/windows-uninstall.ps1?ref=main&t='+[DateTime]::Now.Ticks; $s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((irm $u -Headers @{'User-Agent'='course-helper'}).content)); iex $s.TrimStart([char]0xFEFF) } catch { Write-Host ('Uninstall failed: ' + $_) -ForegroundColor Red }"
)
echo.
echo   按任意键关闭 / Press any key to close
pause >nul
