#!/bin/bash
# 课程助手 · Mac 安装（双击运行；第一次如果提示"无法打开"：右键 → 打开 → 打开）
cd "$(dirname "$0")"
title="课程助手 安装"
dialog() { osascript -e "button returned of (display dialog \"$1\" buttons {$2} default button \"$3\" with title \"$title\" with icon note)" 2>/dev/null; }
LOC="$HOME/Library/Application Support/CourseHelper/location"
EXIST=""
[ -f "$LOC" ] && EXIST="$(cat "$LOC")"
[ -z "$EXIST" ] && [ -d "$HOME/CourseHelper/.git" ] && EXIST="$HOME/CourseHelper"
[ -n "$EXIST" ] && [ ! -d "$EXIST/.git" ] && EXIST=""

if [ -n "$EXIST" ]; then
  DIR="$EXIST"
  [ "$(dialog "检测到课程助手已经安装在：\n$EXIST\n\n继续会直接更新到最新版本。" '"取消","继续"' "继续")" = "继续" ] || exit 0
else
  DIR="$HOME/CourseHelper"
  while true; do
    shown="${DIR/#$HOME/~}"
    ans="$(dialog "课程助手会安装到：\n$shown\n\n安装程序会自动：\n✓ 下载最新版的课程助手\n✓ 设置热更新（每 15 秒检查一次）\n✓ 打开 Chrome 扩展程序页面，并复制好插件位置" '"取消","更改位置…","安装"' "安装")"
    [ "$ans" = "安装" ] && break
    [ "$ans" = "更改位置…" ] || exit 0
    parent="$(osascript -e 'POSIX path of (choose folder with prompt "选择安装位置（会在里面新建 CourseHelper 文件夹）" default location (path to home folder))' 2>/dev/null)" || continue
    parent="${parent%/}"
    case "$parent" in */CourseHelper) DIR="$parent" ;; *) DIR="$parent/CourseHelper" ;; esac
    # macOS 不允许后台任务访问"文稿 / 桌面 / 下载 / iCloud"，放在那里自动更新会失败
    case "$DIR" in "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*)
      a2="$(dialog "放在「文稿 / 桌面 / 下载 / iCloud」里的话，macOS 会拦住后台自动更新。\n\n建议换个位置（比如默认的 ~/CourseHelper，或者外接硬盘）。" '"换回默认位置","仍然用这里"' "换回默认位置")"
      [ "$a2" = "换回默认位置" ] && DIR="$HOME/CourseHelper" ;;
    esac
  done
fi

echo "课程助手 · 安装到 $DIR"
echo "----------------------------------------"
export DIR NO_CHROME=1
if [ -f ./mac-setup.sh ]; then
  bash ./mac-setup.sh
else
  curl -fsSL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/mac-setup.sh?ref=main&t=$(date +%s)" -o /tmp/course-helper-setup.sh \
    && bash /tmp/course-helper-setup.sh
fi
code=$?
if [ $code -ne 0 ] || [ ! -f "$DIR/extension/manifest.json" ]; then
  dialog "安装没有完成。\n\n终端窗口里有出错原因，可以截图发给开发者。" '"好"' "好" >/dev/null
  exit 1
fi
printf "%s" "$DIR/extension" | pbcopy
open -a "Google Chrome" "chrome://extensions/" 2>/dev/null
dialog "✓ 安装完成！最后在 Chrome 里点 3 下（只需要一次）：\n\n1. 打开右上角的「开发者模式」\n2. 点左上角「加载已解压的扩展程序」\n3. 在窗口里按 Cmd+Shift+G，再按 Cmd+V 粘贴，回车，点「选择」\n\n插件位置已经复制好了：\n${DIR/#$HOME/~}/extension\n\n以后有新版本，插件会弹出「检测到更新」，点「立即更新」就行。" '"完成"' "完成" >/dev/null
osascript -e 'tell application "Terminal" to close (every window whose name contains "一键安装")' >/dev/null 2>&1 &
exit 0
