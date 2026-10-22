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
DIR="${DIR:-$HOME/CourseHelper}"               # 默认不放在"文稿/桌面/下载"里：macOS 不允许后台任务访问那些文件夹
LOCDIR="$HOME/Library/Application Support/CourseHelper"
LABEL="com.coursehelper.autoupdate"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/course-helper-update.log"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok() { printf "\033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

CH_LANG="${CH_LANG:-$(defaults read -g AppleLanguages 2>/dev/null | grep -q '"zh' && echo zh || echo en)}"
L() { if [ "$CH_LANG" = en ]; then printf "%s" "$2"; else printf "%s" "$1"; fi; }

bold "$(L "课程助手 · 自动更新安装" "Course Helper · setup with auto-update")"
echo "$(L "仓库：" "Repository: ")github.com/$REPO"
echo "$(L "位置：" "Location: ")$DIR"
echo

# 1. git
if ! /usr/bin/xcrun --find git >/dev/null 2>&1; then
  echo "$(L "需要先装 Apple 的命令行工具（里面有 git）。马上会弹出安装窗口，点「安装」，装完再运行一次这个脚本。" "Apple's command line tools (which include git) are needed. Click \"Install\" in the window that appears, then run this again.")"
  xcode-select --install || true
  exit 0
fi
ok "$(L "git 已就绪" "git is ready")"

# 2. GitHub 访问令牌（私有仓库需要；公开仓库直接回车跳过）
if [ ! -d "$DIR/.git" ] && ! GIT_TERMINAL_PROMPT=0 git ls-remote -q "https://github.com/$REPO.git" HEAD >/dev/null 2>&1; then
  echo
  echo "$(L "如果仓库是私有的，需要一个只读令牌。粘贴后回车（输入时屏幕上不显示）；公开仓库直接回车：" "This repository is private: paste a read-only token and press Enter (input is hidden), or just press Enter:")"
  read -r -s TOKEN < /dev/tty || TOKEN=""
  echo
  if [ -n "$TOKEN" ]; then
    # 存进 macOS 钥匙串，不写在任何文件里
    printf "protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n" "$TOKEN" | git credential-osxkeychain store
    git config --global credential.helper osxkeychain
    ok "$(L "令牌已存进钥匙串" "Token saved to Keychain")"
  fi
fi

# 3. 下载或更新代码
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q && ok "$(L "代码已是最新" "Already up to date")"
else
  git clone -q "https://github.com/$REPO.git" "$DIR" || fail "$(L "下载失败：检查网络后再试" "Download failed — check your network and try again")"
  ok "$(L "已下载到 " "Downloaded to ")$DIR"
fi
[ -f "$DIR/extension/manifest.json" ] || fail "$(L "没找到 extension/manifest.json" "extension/manifest.json not found")"
printf '{"lang":"%s"}' "$CH_LANG" > "$DIR/extension/lang.local.json" 2>/dev/null || true   # 插件的默认语言
mkdir -p "$LOCDIR" && printf "%s" "$DIR" > "$LOCDIR/location"

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
ok "$(L "每 15 秒自动检查更新（开机后也会自动运行）" "Checks for updates every 15 seconds (also after restart)")"

printf "%s" "$DIR/extension" | pbcopy 2>/dev/null || true
[ -n "$NO_CHROME" ] && { ok "$(L "安装完成：" "Installed: ")$DIR/extension"; exit 0; }
GUIDE="https://ddl.tommyxiaoshu.cn/install/?lang=$CH_LANG&os=mac&path=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$DIR/extension" 2>/dev/null || echo "")"
# Chrome 不允许别的程序直接打开 chrome://extensions（只会打开首页），所以打开安装引导网页
open -a "Google Chrome" "$GUIDE" 2>/dev/null || open "$GUIDE"
echo
bold "$(L "================ 最后一步（只需要一次，约 20 秒）================" "================ Last step (only once, ~20 seconds) ================")"
echo "$(L "已经在 Chrome 里打开安装引导，插件文件夹的位置也复制好了：" "A setup guide has opened in Chrome and the extension folder path is copied:")"
echo "$(L "  1. 地址栏打开 chrome://extensions ，打开右上角的「开发者模式」" "  1. Open chrome://extensions and turn on \"Developer mode\" (top right)")"
echo "$(L "  2. 点左上角「加载已解压的扩展程序」" "  2. Click \"Load unpacked\" (top left)")"
echo "$(L "  3. 在弹出窗口里按 Cmd+Shift+G，再按 Cmd+V 粘贴，回车，点「选择」" "  3. In the dialog press Cmd+Shift+G, then Cmd+V, Enter, and click \"Select\"")"
echo "     $DIR/extension"
