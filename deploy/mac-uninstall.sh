#!/bin/bash
# 关掉课程助手的自动更新（代码文件夹保留，插件照常能用，只是不再自动拉取）
LABEL="com.coursehelper.autoupdate"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "✓ 已关闭自动更新。想重新打开：bash ~/CourseHelper/deploy/mac-setup.sh"
echo "  想彻底删除：先在 chrome://extensions 移除插件，再删掉 ~/CourseHelper 文件夹"
