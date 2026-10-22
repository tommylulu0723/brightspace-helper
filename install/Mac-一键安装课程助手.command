#!/bin/bash
# 课程助手 · Mac 安装（双击运行；第一次如果提示"无法打开"：右键 → 打开 → 打开）
cd "$(dirname "$0")"
title="Course Helper"
# 先选语言
CH_LANG="$(osascript -e 'button returned of (display dialog "请选择语言 / Please choose your language" buttons {"中文","English"} default button "中文" with title "Course Helper" with icon note)' 2>/dev/null)"
[ -z "$CH_LANG" ] && exit 0
[ "$CH_LANG" = "English" ] && CH_LANG=en || CH_LANG=zh
L() { if [ "$CH_LANG" = en ]; then printf "%s" "$2"; else printf "%s" "$1"; fi; }
dialog() { osascript -e "button returned of (display dialog \"$1\" buttons {$2} default button \"$3\" with title \"$title\" with icon note)" 2>/dev/null; }
LOC="$HOME/Library/Application Support/CourseHelper/location"
EXIST=""
[ -f "$LOC" ] && EXIST="$(cat "$LOC")"
[ -z "$EXIST" ] && [ -d "$HOME/CourseHelper/.git" ] && EXIST="$HOME/CourseHelper"
[ -n "$EXIST" ] && [ ! -d "$EXIST/.git" ] && EXIST=""

if [ -n "$EXIST" ]; then
  DIR="$EXIST"
  C="$(L 继续 Continue)"; X="$(L 取消 Cancel)"
  [ "$(dialog "$(L "检测到课程助手已经安装在：" "Course Helper is already installed at:")\n$EXIST\n\n$(L "继续会直接更新到最新版本。" "Continuing updates it to the latest version.")" "\"$X\",\"$C\"" "$C")" = "$C" ] || exit 0
else
  DIR="$HOME/CourseHelper"
  while true; do
    shown="${DIR/#$HOME/~}"
    I="$(L 安装 Install)"; CH="$(L 更改位置… "Change…")"; X="$(L 取消 Cancel)"
    ans="$(dialog "$(L "课程助手会安装到：" "Course Helper will be installed to:")\n$shown\n\n$(L "安装程序会自动：\n✓ 下载最新版的课程助手\n✓ 设置热更新（每 15 秒检查一次）\n✓ 打开安装引导，并复制好插件位置" "The installer will:\n✓ Download the latest Course Helper\n✓ Set up hot updates (checks every 15 s)\n✓ Open a setup guide and copy the extension path")" "\"$X\",\"$CH\",\"$I\"" "$I")"
    [ "$ans" = "$I" ] && break
    [ "$ans" = "$CH" ] || exit 0
    parent="$(osascript -e "POSIX path of (choose folder with prompt \"$(L "选择安装位置（会在里面新建 CourseHelper 文件夹）" "Choose a location (a CourseHelper folder will be created inside)")\" default location (path to home folder))" 2>/dev/null)" || continue
    parent="${parent%/}"
    case "$parent" in */CourseHelper) DIR="$parent" ;; *) DIR="$parent/CourseHelper" ;; esac
    # macOS 不允许后台任务访问"文稿 / 桌面 / 下载 / iCloud"，放在那里自动更新会失败
    case "$DIR" in "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*)
      D="$(L 换回默认位置 "Use default")"; K="$(L 仍然用这里 "Keep this")"
      a2="$(dialog "$(L "放在「文稿 / 桌面 / 下载 / iCloud」里的话，macOS 会拦住后台自动更新。\n\n建议换个位置（比如默认的 ~/CourseHelper）。" "macOS blocks background updates in Documents, Desktop, Downloads and iCloud.\n\nPlease choose another place (e.g. the default ~/CourseHelper).")" "\"$D\",\"$K\"" "$D")"
      [ "$a2" = "$D" ] && DIR="$HOME/CourseHelper" ;;
    esac
  done
fi

echo "$(L "课程助手 · 安装到 " "Course Helper · installing to ")$DIR"
echo "----------------------------------------"
export DIR NO_CHROME=1 CH_LANG
if [ -f ./mac-setup.sh ]; then
  bash ./mac-setup.sh
else
  curl -fsSL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/mac-setup.sh?ref=main&t=$(date +%s)" -o /tmp/course-helper-setup.sh \
    && bash /tmp/course-helper-setup.sh
fi
code=$?
if [ $code -ne 0 ] || [ ! -f "$DIR/extension/manifest.json" ]; then
  dialog "$(L "安装没有完成。\n\n终端窗口里有出错原因，可以截图发给开发者。" "Installation did not finish.\n\nThe Terminal window shows why — send a screenshot to the developer.")" '"OK"' "OK" >/dev/null
  exit 1
fi
printf "%s" "$DIR/extension" | pbcopy
GUIDE="https://ddl.tommyxiaoshu.cn/install/?lang=$CH_LANG&os=mac&path=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$DIR/extension" 2>/dev/null)"
# Chrome 不允许别的程序直接打开 chrome://extensions，所以打开安装引导网页，一步步教
open -a "Google Chrome" "$GUIDE" 2>/dev/null || open "$GUIDE"
dialog "$(L "✓ 安装完成！\n\n已经在 Chrome 里打开安装引导，按上面的 3 步在 Chrome 里加载插件（只需要一次）。\n\n插件位置已经复制好了：" "✓ Installed!\n\nA setup guide has opened in Chrome — follow its 3 steps to load the extension (only once).\n\nThe extension path is copied:")\n${DIR/#$HOME/~}/extension" "\"$(L 完成 Done)\"" "$(L 完成 Done)" >/dev/null
osascript -e 'tell application "Terminal" to close (every window whose name contains "一键安装")' >/dev/null 2>&1 &
exit 0
