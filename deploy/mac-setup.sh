#!/bin/bash
# 课程助手 · Mac 自动更新一键安装
#
# 做三件事：
#   1. 把 GitHub 仓库下载到 ~/CourseHelper
#   2. 装一个系统定时任务，每 1 分钟 git pull 一次（不用开终端、不用开 GitHub Desktop）
#   3. 告诉你怎么在 Chrome 里加载插件
# 之后有新版本时，插件会在 1–2 分钟内自己重新加载并弹通知。
#
# 用法：在"终端"里运行  bash ~/Downloads/mac-setup.sh
# 朋友安装（仓库公开时，一行命令）：
#   curl -fsSL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/mac-setup.sh?ref=main&t=$(date +%s)" | bash
# 卸载：bash ~/CourseHelper/deploy/mac-uninstall.sh

set -e

REPO="${REPO:-tommylulu0723/brightspace-helper}"
DIR="$HOME/CourseHelper"                       # 不放在"文稿/下载"里：macOS 不允许后台任务访问那些文件夹
LABEL="com.coursehelper.autoupdate"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/course-helper-update.log"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok() { printf "\033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

bold "课程助手 · 自动更新安装"
echo "仓库：github.com/$REPO"
echo "位置：$DIR"
echo

# 1. git
if ! /usr/bin/xcrun --find git >/dev/null 2>&1; then
  echo "需要先装 Apple 的命令行工具（里面有 git）。马上会弹出安装窗口，点"安装"，装完再运行一次这个脚本。"
  xcode-select --install || true
  exit 0
fi
ok "git 已就绪"

# 2. GitHub 访问令牌（私有仓库需要；公开仓库直接回车跳过）
if [ ! -d "$DIR/.git" ]; then
  echo
  echo "如果仓库是私有的，需要一个只读令牌（在 GitHub 网页上生成，见教程第 2 步）。"
  echo "粘贴令牌后回车（输入时屏幕上不显示，正常）；公开仓库直接回车："
  read -r -s TOKEN < /dev/tty || TOKEN=""
  echo
  if [ -n "$TOKEN" ]; then
    # 存进 macOS 钥匙串，不写在任何文件里
    printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n" "$TOKEN" | git credential-osxkeychain store
    git config --global credential.helper osxkeychain
    ok "令牌已存进钥匙串"
  fi
fi

# 3. 下载或更新代码
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q && ok "代码已是最新"
else
  git clone -q "https://github.com/$REPO.git" "$DIR" || fail "下载失败：检查仓库名和令牌（令牌要有这个仓库的 Contents 读取权限）"
  ok "代码已下载到 $DIR"
fi
[ -f "$DIR/extension/manifest.json" ] || fail "仓库里没找到 extension/manifest.json，代码可能还没推上去"

# 4. 每分钟自动拉取
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd "$DIR" &amp;&amp; /usr/bin/git pull --ff-only -q 2&gt;&gt; "$LOG" || echo "\$(date '+%F %T') 拉取失败" &gt;&gt; "$LOG"</string>
  </array>
  <key>StartInterval</key><integer>15</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
</dict>
</plist>
PLISTEOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
ok "每 15 秒自动检查更新（开机后也会自动运行）"

printf "%s" "$DIR/extension" | pbcopy 2>/dev/null || true
open -a "Google Chrome" "chrome://extensions/" 2>/dev/null || echo "没找到 Chrome，请自己打开 Chrome，在地址栏输入 chrome://extensions"

echo
bold "================ 最后一步（只需要一次，约 20 秒）================"
echo "已经帮你打开 Chrome 的扩展程序页面，并把插件文件夹的位置复制好了："
echo "  1. 打开右上角的「开发者模式」开关"
echo "  2. 点左上角「加载已解压的扩展程序」"
echo "  3. 在弹出窗口里按 Cmd+Shift+G，再按 Cmd+V 粘贴，回车，点「选择」"
echo "     （文件夹位置：$DIR/extension）"
echo "  以前装过旧的「课程助手」的话，先把旧的移除。"
echo
echo "装好之后有新版本时，插件会弹出「检测到更新」，点「立即更新」就好，永远不用重装。"
echo "（Chrome 规定插件只能由你自己点「加载」，脚本没法替你点这一下）"
