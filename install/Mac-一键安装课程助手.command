#!/bin/bash
# 课程助手 · Mac 一键安装（双击运行；第一次如果提示"无法打开"，右键 → 打开 → 打开）
cd "$(dirname "$0")"
echo "课程助手 一键安装（含每分钟热更新）"
echo "----------------------------------------"
if [ -f ./mac-setup.sh ]; then
  bash ./mac-setup.sh
else
  curl -fsSL https://raw.githubusercontent.com/tommylulu0723/brightspace-helper/main/deploy/mac-setup.sh -o /tmp/course-helper-setup.sh \
    && bash /tmp/course-helper-setup.sh
fi
echo
read -n 1 -s -r -p "按任意键关闭这个窗口" < /dev/tty
