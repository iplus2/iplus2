# MEMORY.md

- **2026-05-03**: 工作区创建，项目启动
- **2026-05-07**: 完成 GitHub push（通过 SSH，HTTPS 443 port 被网络封锁）
  - 生成 ed25519 SSH key，公钥已添加到 GitHub (webdev@cf-workspace)
  - HTTPS git push 失败（gnutls 错误），SSH (port 22) 正常
  - 仓库: https://github.com/iplus2/cf-dev
  - 提交: `445ff47` 初始项目, `df93603` .gitignore
  - 三个页面：登录(index.html)、注册(register.html)、图片画廊(gallery.html)
  - 技术栈：纯 HTML/CSS/JS + Supabase（Auth + Storage + Database）
  - 功能：邮箱密码注册/登录、图片拖拽/点击上传、查看所有用户图片
  - 数据库表：profiles（用户资料）、images（图片记录）
  - 需要用户配置：js/config.js 中的 Supabase URL 和 Anon Key
  - 需要在 Supabase 中执行 supabase-init.sql 初始化数据库
  - 需要在 Supabase Storage 中创建 images bucket 并设为 Public
