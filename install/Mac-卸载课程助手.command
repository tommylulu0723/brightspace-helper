#!/bin/bash
# 课程助手 · Mac 卸载（双击运行；提示"无法打开"时：右键 → 打开 → 打开）
LABEL="com.coursehelper.autoupdate"
LOC="$HOME/Library/Application Support/CourseHelper/location"
DIR="$HOME/CourseHelper"
[ -f "$LOC" ] && DIR="$(cat "$LOC")"
echo "课程助手 · 卸载 / Course Helper · uninstall"
echo "----------------------------------------"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/Library/Logs/course-helper-update.log"
rm -rf "$HOME/Library/Application Support/CourseHelper"
echo "✓ 已关闭自动更新 / Auto-update removed"
if [ -d "$DIR" ]; then
  read -r -p "删除插件文件夹 / Delete folder $DIR ? (y = yes, Enter = keep): " ANS < /dev/tty
  if [ "$ANS" = "y" ] || [ "$ANS" = "Y" ]; then rm -rf "$DIR" && echo "✓ 已删除 $DIR"; else echo "  保留了 $DIR"; fi
else
  echo "没找到 $DIR（可能已经删掉了）"
fi
echo
echo "最后一步：在 Chrome 打开 chrome://extensions ，找到「课程助手」点「移除」"
echo "Last step: open chrome://extensions in Chrome and click \"Remove\" on Course Helper"
echo
read -n 1 -s -r -p "按任意键关闭 / Press any key to close" < /dev/tty
