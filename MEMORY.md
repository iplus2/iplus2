# MEMORY.md

- **2026-05-03**: 工作区创建，项目启动
- **2026-05-04**: 完成测试网页项目搭建
  - 三个页面：登录(index.html)、注册(register.html)、图片画廊(gallery.html)
  - 技术栈：纯 HTML/CSS/JS + Supabase（Auth + Storage + Database）
  - 功能：邮箱密码注册/登录、图片拖拽/点击上传、查看所有用户图片
  - 数据库表：profiles（用户资料）、images（图片记录）
  - 需要用户配置：js/config.js 中的 Supabase URL 和 Anon Key
  - 需要在 Supabase 中执行 supabase-init.sql 初始化数据库
  - 需要在 Supabase Storage 中创建 images bucket 并设为 Public
