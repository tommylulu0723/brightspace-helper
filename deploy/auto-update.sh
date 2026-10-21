#!/bin/sh
# 课程助手后端自动更新：由 cron 每 1 分钟运行一次（和情侣空间同一套做法，用 flock 防止重叠）。
# GitHub 上有新提交时，自动拉取、重新构建并重启；数据在 /root/course-helper/data，不受影响。
SRC=/root/course-helper-src
DATA=/root/course-helper/data
LOG=/var/log/course-helper-update.log
NET=couple-net            # 和情侣空间、Caddy 用同一个 Docker 网络，Caddy 才能找到这个容器
NAME=course-helper
cd "$SRC" || exit 1
mkdir -p "$DATA"

docker network inspect $NET >/dev/null 2>&1 || docker network create $NET >/dev/null
# Caddy 也要在这个网络里，才能用 course-helper:3100 反向代理
if docker ps --format '{{.Names}}' | grep -qx caddy; then
  docker inspect -f '{{json .NetworkSettings.Networks}}' caddy | grep -q "\"$NET\"" || docker network connect $NET caddy 2>/dev/null
fi

git fetch -q origin main 2>>"$LOG" || exit 0
TARGET=$(git rev-parse origin/main)
DEPLOYED=$(cat .deployed-rev 2>/dev/null)
RUNNING=$(docker ps --format '{{.Names}}' | grep -cx $NAME)
if [ "$TARGET" = "$DEPLOYED" ] && [ "$RUNNING" = "1" ]; then exit 0; fi
git reset -q --hard origin/main
if docker build -q -t $NAME . >/dev/null 2>>"$LOG"; then
  docker rm -f $NAME >/dev/null 2>&1
  # 只在本机 3100 端口开放，由 Caddy 对外提供 https
  docker run -d --name $NAME --restart unless-stopped --network $NET -p 127.0.0.1:3100:3100 \
    -e ADMIN_EMAILS="${ADMIN_EMAILS:-}" -v "$DATA":/data $NAME >/dev/null
  echo "$TARGET" > .deployed-rev
  echo "$(date '+%F %T') 已更新到 $(git log -1 --format='%h %s')" >> "$LOG"
else
  echo "$(date '+%F %T') 构建失败，继续运行旧版本" >> "$LOG"
fi
