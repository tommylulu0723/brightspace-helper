#!/bin/sh
# 课程助手后端 · 服务器一键部署（和情侣空间放在同一台服务器，互不影响）
#
# 在服务器上（腾讯云控制台 → 登录 → 用 root 身份）粘贴运行：
#   curl -fsSL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/tommylulu0723/brightspace-helper/contents/deploy/server-setup.sh?ref=main" | DOMAIN=study.你的域名 sh
#
# 做的事：
#   1. 下载代码到 /root/course-helper-src，数据放在 /root/course-helper/data
#   2. 构建并启动 course-helper 容器（只在本机 3100 端口，不占用 80/443）
#   3. 每分钟自动从 GitHub 更新（cron，和情侣空间一样）
#   4. 找到正在运行的 Caddy，把 DOMAIN 加进去，自动申请 https 证书
# 可以重复运行，不会重复添加。
set -e
REPO=tommylulu0723/brightspace-helper
SRC=/root/course-helper-src
DOMAIN="${DOMAIN:-}"

say() { printf '\033[1m%s\033[0m\n' "$1"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m! %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || fail "请用 root 运行（先输入 sudo -i）"
command -v docker >/dev/null || fail "这台服务器没有 Docker（情侣空间应该已经装过，确认是同一台服务器）"
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null || yum install -y -q git; }

say "1/4 下载代码"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q origin main && git -C "$SRC" reset -q --hard origin/main
else
  git clone -q "https://github.com/$REPO.git" "$SRC"
fi
ok "代码在 $SRC"

say "2/4 构建并启动（第一次约 1 分钟）"
rm -f "$SRC/.deployed-rev"
sh "$SRC/deploy/auto-update.sh"
sleep 3
if curl -fs http://127.0.0.1:3100/healthz >/dev/null 2>&1 || wget -qO- http://127.0.0.1:3100/healthz >/dev/null 2>&1; then
  ok "course-helper 已运行：$(curl -fs http://127.0.0.1:3100/healthz 2>/dev/null || true)"
else
  tail -5 /var/log/course-helper-update.log 2>/dev/null
  fail "容器没跑起来，把上面几行发给开发者"
fi

say "3/4 每分钟自动更新"
LINE='* * * * * flock -n /tmp/course-helper.lock sh /root/course-helper-src/deploy/auto-update.sh'
if crontab -l 2>/dev/null | grep -qF "course-helper-src/deploy/auto-update.sh"; then
  ok "已经设置过"
else
  ( crontab -l 2>/dev/null; echo "$LINE" ) | crontab -
  ok "已加入 cron"
fi

say "4/4 https 域名"
if [ -z "$DOMAIN" ]; then
  warn "没给 DOMAIN，跳过。之后运行：DOMAIN=study.你的域名 sh $SRC/deploy/server-setup.sh"
  exit 0
fi
IP=$(curl -fs4 https://api.ipify.org 2>/dev/null || true)
RES=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)
if [ -n "$IP" ] && [ "$RES" != "$IP" ]; then
  warn "$DOMAIN 现在解析到「${RES:-没有记录}」，这台服务器的 IP 是 $IP。"
  warn "请先在域名服务商那里加一条 A 记录：study → $IP（几分钟后生效），然后再运行一次这个命令。"
fi

if ! docker ps --format '{{.Names}}' | grep -qx caddy; then
  warn "没找到名叫 caddy 的容器。情侣空间可能是直接用 80 端口运行的（没有 https）。"
  warn "把下面这条命令的输出发给开发者，我来帮你接上："
  echo "  docker ps --format '{{.Names}}  {{.Ports}}'"
  exit 0
fi

CF=$(docker inspect caddy -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
if [ -z "$CF" ]; then
  CFDIR=$(docker inspect caddy -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')
  [ -n "$CFDIR" ] && CF="$CFDIR/Caddyfile"
fi
[ -n "$CF" ] && [ -f "$CF" ] || fail "找不到 Caddy 用的 Caddyfile，把 docker inspect caddy 的输出发给开发者"

# Caddy 用 --network host 运行时找不到容器名，只能转发到本机端口
if [ "$(docker inspect caddy -f '{{.HostConfig.NetworkMode}}')" = "host" ]; then UP=127.0.0.1:3100; else UP=course-helper:3100; fi
cp "$CF" "$CF.bak-$(date +%s)"
# 删掉旧的同名配置块（可以重复运行），再加上新的
awk -v d="$DOMAIN" '
  $1 == d && $2 == "{" { skip = 1; depth = 0 }
  skip { n = gsub(/{/, "{"); m = gsub(/}/, "}"); depth += n - m; if (depth <= 0) { skip = 0 }; next }
  { print }
' "$CF" > "$CF.tmp" && cat "$CF.tmp" > "$CF" && rm -f "$CF.tmp"   # 原地写回：Caddy 容器挂载的是这个文件本身，换成新文件它看不到
printf '\n%s {\n\tencode gzip\n\trequest_body {\n\t\tmax_size 10MB\n\t}\n\treverse_proxy %s\n}\n' "$DOMAIN" "$UP" >> "$CF"
ok "已把 $DOMAIN → $UP 写进 $CF（原文件已备份）"
[ "$UP" = course-helper:3100 ] && docker network connect couple-net caddy 2>/dev/null || true
# 先确认容器里看到的是新配置再 reload；看不到（旧版脚本换过文件）就重启容器
if docker exec caddy grep -q "^$DOMAIN" /etc/caddy/Caddyfile 2>/dev/null && docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then ok "Caddy 已重新加载"; else docker restart caddy >/dev/null && ok "Caddy 已重启"; fi

echo
say "完成 🎉"
echo "  打开 https://$DOMAIN/healthz 显示 {\"ok\":true,...} 就成功了（证书第一次申请要等几十秒）"
echo "  管理后台：https://$DOMAIN/admin/   手机版：https://$DOMAIN/m/"
echo "  第一个注册的人自动是管理员——你自己先在插件里注册。"
