# 用 GitHub 自动更新课程助手（Windows · 每 1 分钟检查一次）

设置好之后：我把新版本推到 GitHub → 你电脑每分钟自动拉取 → 插件发现新版本后自己重新加载，并弹出"课程助手已自动更新到 x.x.x"的通知。你什么都不用点。

```
GitHub 仓库 ──(每 1 分钟 git pull，任务计划程序)──> C:\Users\你\CourseHelper
                                                        │
Chrome 插件 ──(每 1 分钟比对 manifest 版本号)──────────┘ → 不一样就自动重新加载
```

## 第一步：在 GitHub 建一个空的私有仓库（1 分钟）

1. 打开 https://github.com/new
2. Repository name 填 `brightspace-helper`
3. 选 **Private**
4. 下面的 README / .gitignore / license 都**不要勾**，直接点 **Create repository**

## 第二步：让 Claude 把代码推上去

在和 Claude 的对话里说"仓库建好了"，Claude 会把仓库连到对话里并推送代码。以后每次改插件，Claude 都直接推到这个仓库。

## 第三步：在电脑上运行安装脚本（只需要一次）

1. 下载 `windows-setup.ps1`，放在"下载"文件夹
2. 按 `Win` 键，输入 `PowerShell`，打开"Windows PowerShell"（不需要管理员）
3. 粘贴下面这行，回车：

   ```powershell
   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1"
   ```

4. 电脑上没有 Git 的话，脚本会用 winget 自动装（可能弹一个确认框，点"是"）。如果提示装好了但找不到，关掉 PowerShell 重开，再运行一次。
5. 第一次下载私有仓库时会**弹出 GitHub 登录窗口**：点 "Sign in with your browser"，在浏览器里授权。之后会记住，不用再登录。
6. 看到 `✓ 每 1 分钟自动检查更新` 就成功了。

想装到别的盘（比如 E 盘）：

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\windows-setup.ps1" -Dir "E:\CourseHelper"
```

## 第四步：在 Chrome 里加载插件（只需要一次）

1. Chrome 打开 `chrome://extensions`，把旧的"课程助手"**移除**（旧的是从 zip 装的，不会自动更新）
2. 右上角打开 **开发者模式**
3. 点 **加载已解压的扩展程序**，选 `C:\Users\你的用户名\CourseHelper\extension`（脚本结束时会自动打开这个文件夹）
4. 打开插件 → 登录 Brightspace 同步一次

设置、勾选的完成状态都存在 Chrome 里，移除旧插件再装新的会丢失勾选记录；如果介意，可以先在旧插件里导出 / 截图。

## 平时

- 什么都不用做。新版本 1–2 分钟内自动生效，会弹通知；插件"设置 → 更新日志"能看到改了什么。
- 如果哪次弹了"新版本已下载"但插件看起来没变：打开插件 **设置 → 更新日志 → 重新加载插件**，或在 `chrome://extensions` 点课程助手上的刷新按钮。
- 电脑关机或睡眠期间不会更新，开机登录后会马上补拉一次。

## 检查是否在正常工作

- 任务：按 `Win` 输入"任务计划程序"，在"任务计划程序库"里能看到 **CourseHelper AutoUpdate**，"上次运行结果"是 `操作成功完成 (0x0)`。
- 日志：`%LOCALAPPDATA%\CourseHelper\update.log`（粘到资源管理器地址栏打开）。正常时是空的，只有出错才会写内容。
- 手动拉一次：

  ```powershell
  git -C "$env:USERPROFILE\CourseHelper" pull
  ```

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 日志里有 `Authentication failed` | GitHub 登录过期了。在 PowerShell 运行上面"手动拉一次"那行，会重新弹登录窗口 |
| 日志里有 `Not possible to fast-forward` | 你改过 CourseHelper 文件夹里的文件。运行 `git -C "$env:USERPROFILE\CourseHelper" reset --hard origin/main` |
| 运行脚本提示"禁止运行脚本" | 确认用的是上面那整行命令（带 `-ExecutionPolicy Bypass`） |
| 想关掉自动更新 | `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\CourseHelper\deploy\windows-uninstall.ps1"` |

## Mac

在终端运行 `bash ~/Downloads/mac-setup.sh`，其余相同（脚本会问一个 GitHub 只读令牌）。
