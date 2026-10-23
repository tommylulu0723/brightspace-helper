#!/bin/sh
# 交叉编译 Windows 安装程序：sh tools/winexe/build.sh  → dist/CourseHelperSetup.exe
set -e
cd "$(dirname "$0")"
mkdir -p scripts
cp ../../deploy/windows-installer.ps1 ../../deploy/windows-setup.ps1 ../../deploy/windows-uninstall.ps1 scripts/
python3 mkrsrc.py icon16.png icon32.png icon48.png icon256.png -o rsrc_windows_amd64.syso
mkdir -p ../../dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../../dist/CourseHelperSetup.exe .
echo "built dist/CourseHelperSetup.exe ($(wc -c < ../../dist/CourseHelperSetup.exe) bytes)"
# 网站上的下载地址：https://ddl.tommyxiaoshu.cn/download/CourseHelperSetup.exe
cp ../../dist/CourseHelperSetup.exe ../../server/public/download/CourseHelperSetup.exe
