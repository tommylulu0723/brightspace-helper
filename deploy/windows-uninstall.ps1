# 关掉课程助手的自动更新（代码文件夹保留，插件照常能用，只是不再自动拉取）
Unregister-ScheduledTask -TaskName 'CourseHelper AutoUpdate' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host '✓ 已关闭自动更新。' -ForegroundColor Green
Write-Host '  想重新打开：再运行一次 windows-setup.ps1'
Write-Host '  想彻底删除：先在 chrome://extensions 移除插件，再删掉 CourseHelper 文件夹'
