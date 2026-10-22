#!/bin/bash
# 课程助手 · Mac 卸载（双击运行；提示"无法打开"时：右键 → 打开 → 打开）
LABEL="com.coursehelper.autoupdate"
DIR="$HOME/CourseHelper"
echo "课程助手 · 卸载"
echo "----------------------------------------"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/Library/Logs/course-helper-update.log"
echo "✓ 已关闭自动更新"
if [ -d "$DIR" ]; then
  read -r -p "删除插件文件夹 $DIR 吗？输入 y 回车删除，直接回车保留：" ANS < /dev/tty
  if [ "$ANS" = "y" ] || [ "$ANS" = "Y" ]; then rm -rf "$DIR" && echo "✓ 已删除 $DIR"; else echo "  保留了 $DIR"; fi
else
  echo "没找到 $DIR（可能已经删掉了）"
fi
echo
echo "最后一步：在 Chrome 的扩展程序页面找到「课程助手」，点「移除」（已经帮你打开了）"
open -a "Google Chrome" "chrome://extensions/" 2>/dev/null || true
echo
read -n 1 -s -r -p "按任意键关闭这个窗口" < /dev/tty
