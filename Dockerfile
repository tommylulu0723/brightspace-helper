# 课程助手后端（零依赖）
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/server.js ./
COPY server/lib ./lib
COPY server/public ./public
# 手机版页面和插件共用的分组 / 时间显示逻辑、样式
COPY extension/src/shared.css ./shared/shared.css
COPY extension/src/lib/format.js extension/src/lib/merge.js extension/src/lib/plan.js ./shared/lib/
ENV PORT=3100 DATA_DIR=/data
VOLUME /data
EXPOSE 3100
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3100/healthz || exit 1
CMD ["node", "server.js"]
