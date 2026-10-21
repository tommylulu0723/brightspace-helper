# 用 GitHub 更新课程助手

目标：以后每次有新版本，你点两下就能更新，不用再下载 zip、删旧插件、重新加载。

```
我改好代码 → 推送到你的 GitHub 仓库 → 你在 GitHub Desktop 点"拉取" → 插件里点"重新加载插件"
```

设置和数据（标记完成、移除的课、通知开关）都存在 Chrome 里，更新不会丢。

---

## 一、第一次设置（大约 10 分钟，只做一次）

### 1. 在 GitHub 建一个空仓库

1. 打开 https://github.com/new
2. Repository name 填 `brightspace-helper`
3. 选 **Private**（私有）
4. 下面的 "Add a README"、".gitignore"、"license" **都不要勾**（仓库必须是空的）
5. 点 **Create repository**

建好后告诉我，并在这个对话里把仓库接上（和情侣空间一样），我把代码推上去。

> 也可以自己上传：仓库页面点 "uploading an existing file"，把解压后的整个文件夹内容拖进去。但用我推送更省事，以后更新也是我直接推。

### 2. 安装 GitHub Desktop

1. 下载：https://desktop.github.com ，安装后用你的 GitHub 账号登录
2. 菜单 **File → Clone Repository**
3. 在列表里选 `brightspace-helper`
4. Local Path 选一个以后不会删的位置，例如 `~/Documents/brightspace-helper`
5. 点 **Clone**

### 3. 让 Chrome 从这个文件夹加载插件

1. Chrome 打开 `chrome://extensions`
2. 把旧的"课程助手"**移除**（设置会丢一次，只有这一次）
3. 点 **加载已解压的扩展程序**，选 `~/Documents/brightspace-helper/extension`
   （选 `extension` 这一层，里面能直接看到 `manifest.json`）

完成。之后插件就一直从这个文件夹运行。

---

## 二、以后每次更新（30 秒）

1. 我推送新版本后，打开 **GitHub Desktop**
2. 点上方的 **Fetch origin**，变成 **Pull origin** 后再点一次
3. 打开插件 → **设置 → 更新日志 → 重新加载插件**
   （或者到 `chrome://extensions` 点插件卡片上的刷新按钮）

在"更新日志"里能看到新版本号和这次改了什么。

### 用终端也可以

```bash
cd ~/Documents/brightspace-helper
git pull
```

然后在插件里点"重新加载插件"。

---

## 三、出问题了想退回上一个版本

- **GitHub Desktop**：左边点 **History**，在上一个版本那条上右键 → **Revert changes in commit**，然后插件里点"重新加载插件"。
- 或者直接告诉我，我在仓库里回退，你再 Pull 一次就行。

---

## 四、为什么不能像情侣空间那样完全自动

情侣空间跑在服务器上，服务器每分钟自己去 GitHub 拉新代码。Chrome 插件跑在你自己的电脑上，Chrome 出于安全考虑，**只会自动更新从 Chrome 应用商店安装的插件**，"加载已解压"的插件必须手动拉取一次。

如果以后想做到完全自动（同学也能自动更新）：

1. 注册 Chrome 网上应用店开发者（一次性 5 美元）：https://chrome.google.com/webstore/devconsole
2. 上传插件 zip，可见性选 **不公开（Unlisted）**，只有拿到链接的人能装
3. 审核通过后，每次发版上传新 zip，所有人的 Chrome 会在几小时内自动更新

需要的话我可以帮你准备上架要的说明文字、截图和隐私说明。

---

## 五、服务器（可选，只在用账号 / 手机版时需要）

服务器部分和情侣空间用同一套自动更新：推送到 GitHub 后，服务器上的 cron 每分钟检查一次，1–2 分钟自动生效。第一次怎么装见 `README.md` 的"部署后端"一节。只在自己电脑上用插件的话可以忽略。
