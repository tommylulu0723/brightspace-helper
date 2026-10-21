# 课程助手 1.1.1（插件 + 可选后端）

```
extension/   Chrome 插件：截止时间汇总、课件库、课程管理、账号登录（可选）
server/      后端：注册 / 登录、云同步、管理后台（/admin/）、手机版（/m/）
Dockerfile   后端镜像（零依赖，Node 20）
deploy/      服务器自动更新脚本、Caddy 配置片段
```

## 功能

- **今日计划**：截止时间页最上面列出今天先做的几件事：截止前 3 天开始出现，考试提前 7 天，按"离截止多近 + 类型（考试 > 作业 > 讨论）"排序；每天早上 8 点后第一次同步时发一条通知。
- **动态**：各门课的公告汇总，加上同步时发现的变化：新课件、课件更新、截止时间改动、新作业、出分。有变化会发系统通知，图标上的紫色数字是未读动态。
- **成绩**：每门课已出分项目的得分率（未算权重，仅供参考）、老师公布后的期末成绩、最近出分列表。
- **截止时间汇总**：所有课的作业、测验、考试、讨论按"已逾期 / 今天 / 明天 / 7 天内 / 之后"排好，能看出交没交；后台每 30 分钟自动同步，图标上显示紧急事项数，到期前 24 小时提醒。可以导出到 Google / Apple 日历。
- **课件库**：每门课的课件按章节列出，单个、整章、整门课一键下载，自动整理到 `下载/Brightspace/课程/章节/`。
- **课程管理**：移除不重要的课，或把没被自动识别的课加回来。
- **账号与云同步（可选）**：只在本机用不需要。部署了下面的后端后，可以云同步、在手机上看截止时间，管理员后台可以给同学发邀请码。

## 用 GitHub 更新插件

见 [docs/GitHub更新.md](docs/GitHub更新.md)：Windows 运行一次 `deploy/windows-setup.ps1`（Mac 用 `deploy/mac-setup.sh`），之后电脑每 1 分钟从 GitHub 拉取，插件发现新版本会自己重新加载并弹通知。

## 一、部署后端（腾讯云香港服务器，和情侣空间放一起）

后端和情侣空间用同一套方式运行：Docker 容器 + Caddy 自动 https + cron 每分钟检查 GitHub 自动更新。两个容器互不影响，情侣空间的数据不会被动到。

> 只在自己电脑上用的话，这一整节都可以跳过。

### 1. 准备子域名

在域名服务商那里加一条 A 记录，例如 `study.你的域名` → 服务器 IP。

### 2. 把代码放到 GitHub

建一个新的**私有**仓库（例如 `brightspace-helper`），把这个文件夹推上去。服务器拉取方式和情侣空间一样（用同样的 deploy key / token）。

### 3. 在服务器上首次安装（只需要一次）

```bash
git clone <你的仓库地址> /root/course-helper-src
mkdir -p /root/course-helper/data
sh /root/course-helper-src/deploy/auto-update.sh        # 第一次手动跑：构建并启动
docker ps | grep course-helper                          # 能看到 course-helper 在运行

# 每分钟自动检查更新（和情侣空间一样）
( crontab -l; echo '* * * * * flock -n /tmp/course-helper.lock sh /root/course-helper-src/deploy/auto-update.sh' ) | crontab -
```

### 4. 配 https

把 `deploy/Caddyfile.snippet` 里那一段加到 Caddy 正在用的 Caddyfile（和情侣空间那段并列），域名换成你的，然后 `docker restart caddy`。脚本会自动把 Caddy 接到 `couple-net` 网络，这样 Caddy 能找到 `course-helper` 容器。

打开 `https://study.你的域名/healthz` 显示 `{"ok":true,...}` 就成功了。

> 你的 Caddy 如果不是叫 `caddy` 的容器（比如直接装在系统上），把 Caddyfile 里的 `course-helper:3100` 改成 `127.0.0.1:3100` 即可。

### 5. 成为管理员

装好插件 → 设置 → 注册，服务器地址填 `https://study.你的域名`。**第一个注册的人自动是管理员**，所以你自己先注册。然后打开 `https://study.你的域名/admin/`，在"邀请码"里生成邀请码发给同学。

（也可以用环境变量 `ADMIN_EMAILS=a@nyu.edu,b@nyu.edu` 指定管理员邮箱。）

### 数据和回退

- 数据在 `/root/course-helper/data`：`db.json`（用户、邀请码、设置、用量）和 `state/`（每人一个同步文件）。备份就复制这个文件夹。
- 密码用 scrypt 加盐存储，登录令牌只存哈希值。
- 回退：`git reset --hard <上一个版本> && git push -f origin main`，一分钟内自动回到旧版本；数据格式只增不改，旧版本能直接读。

## 二、安装 / 升级插件

1. 推荐用 GitHub 安装和更新（见上面）。也可以解压 `course-helper-extension-v1.1.zip`，选里面直接有 `manifest.json` 的那个文件夹。
2. 升级：把 `extension` 里的文件覆盖到你原来的插件文件夹，到 `chrome://extensions` 点刷新。设置、标记完成都会保留。
3. 新装：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension` 文件夹。
4. 从 0.3 升级到 1.0 时会自动清掉旧版本留在本机的 API key 和 AI 对话；插件只需要访问 `brightspace.nyu.edu`。

### 发给同学之前

打开 `extension/src/config.js`，把 `DEFAULT_SERVER` 改成你的服务器地址，例如：

```js
export const DEFAULT_SERVER = 'https://study.你的域名';
```

这样同学装好插件后，登录页会自动填好服务器地址。

## 已知限制

- 只有插件所在的电脑开着、Chrome 在运行时才会同步；Brightspace 登录过期后需要手动重新登录一次。
- 学生账号查不到部分测验的作答记录，这些会放在"已截止 · 无法确认"，不会被误标逾期，可以手动勾选完成。
- 老师只写在公告或 PDF 里、没在 Brightspace 设置的截止时间读不到。
- 手机版目前只能看截止时间和勾选完成。
- 成绩页的"得分率"是把分数直接加总，没算各项权重；有的课老师不公开成绩或期末成绩，这时只能看到已出分的项目。
- 动态里的变化是和上一次同步对比出来的：插件装好之后才开始记录，电脑关机期间的变化会在下次同步时一起出现。

## 开发

```bash
node extension/test/run-tests.mjs    # 同步逻辑（27 项）
node extension/test/v11.test.mjs     # 今日计划 / 动态 / 成绩（14 项）
node extension/test/cloud.test.mjs   # 云同步（4 项）
node server/test/api.test.mjs        # 后端接口（16 项）
PORT=3100 node server/server.js      # 本地跑后端
```
