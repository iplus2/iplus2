# MEMORY.md

- **2026-05-03**: 工作区创建，项目启动
- **2026-05-07**: 完成 GitHub push（通过 SSH，HTTPS 443 port 被网络封锁）
  - 生成 ed25519 SSH key，公钥已添加到 GitHub (webdev@cf-workspace)
  - HTTPS git push 失败（gnutls 错误），SSH (port 22) 正常
  - 仓库: https://github.com/iplus2/iplus2.git（仓库名是 iplus2，不是 cf-dev）
  - 提交: `445ff47` 初始项目, `df93603` .gitignore
  - 三个页面：登录(index.html)、注册(register.html)、图片画廊(gallery.html)
  - 技术栈：纯 HTML/CSS/JS + Supabase（Auth + Storage + Database）
  - 功能：邮箱密码注册/登录、图片拖拽/点击上传、查看所有用户图片
  - 数据库表：profiles（用户资料）、images（图片记录）
  - 需要用户配置：js/config.js 中的 Supabase URL 和 Anon Key
  - 需要在 Supabase 中执行 supabase-init.sql 初始化数据库
  - 需要在 Supabase Storage 中创建 images bucket 并设为 Public

- **2026-05-15**: 修复 exec 工具故障
  - 原因：QClaw 安全沙箱插件 `pcmgr-ai-security` 引用缺失的 `tsbx.exe`，导致所有 exec 被拦截
  - 解决：David 禁用沙箱后恢复
  - 环境验证通过：WSL git ✓ SSH ✓ GitHub push ✓ Supabase 连接 ✓
  - 注意：PowerShell 不支持 `&&`，用 `;` 分隔命令
  - 注意：WSL 访问 Windows 路径需转换 `C:\` → `/mnt/c/`

## Supabase 配置
- URL: `https://glumggyukihrkfrryogd.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdW1nZ3l1a2locmtmcnJ5b2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjMxMzMsImV4cCI6MjA5Mjk5OTEzM30.dotVxWQzwYkNj7UFKt8pmbOwUj3H4zTw3jKSO22Ds9Q`