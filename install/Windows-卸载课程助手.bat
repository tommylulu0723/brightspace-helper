@echo off
chcp 65001 >nul
title Course Helper Uninstall
echo.
echo   课程助手 卸载 / Course Helper uninstall
echo   ----------------------------------------
echo.
rem 不需要"以管理员身份运行"：需要管理员权限时脚本会自己弹确认框
cd /d "%TEMP%"
set "LOCAL=%~dp0windows-uninstall.ps1"
if exist "%LOCAL%" goto run_local
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; try { $u='https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/windows-uninstall.ps1?ref=main&t='+[DateTime]::Now.Ticks; $b=[Convert]::FromBase64String((irm $u -Headers @{'User-Agent'='course-helper'}).content); [IO.File]::WriteAllBytes((Join-Path $env:TEMP 'course-helper-uninstall.ps1'), $b) } catch { Write-Host ('Download failed: ' + $_) -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto failed
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\course-helper-uninstall.ps1"
goto done
:run_local
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%LOCAL%"
goto done
:failed
echo.
echo   Could not download the uninstaller. Check your network and try again.
:done
echo.
echo   按任意键关闭 / Press any key to close
pause >nul
