# 任务：搭建测试网页项目（登录/注册/图片画廊）

## 目标
为 David 搭建一个包含三个页面的测试网页：用户名密码登录、注册、图片上传与浏览。

## 项目结构
```
cf-dev-workspace/
├── index.html           # 登录页
├── register.html        # 注册页
├── gallery.html         # 图片上传/浏览页
├── css/style.css        # 共享样式
├── js/config.js         # Supabase 配置（需填入）
├── js/auth.js           # 认证工具函数
├── js/login.js          # 登录逻辑
├── js/register.js       # 注册逻辑
├── js/gallery.js        # 图片上传/展示逻辑
└── supabase-init.sql    # 数据库初始化脚本
```

## 技术实现
- **前端**: 纯 HTML/CSS/JS，无框架依赖
- **认证**: Supabase Auth（邮箱+密码），注册时存 username 到 user_metadata
- **存储**: Supabase Storage（images bucket），文件路径 `{userId}/{userId}_{timestamp}.{ext}`
- **数据库**: profiles 表（触发器自动创建）、images 表（记录上传信息）
- **安全**: RLS 行级安全策略，用户只能操作自己的数据
- **UI**: 现代简洁风格，响应式设计，支持拖拽上传

## 待完成（用户操作）
1. 在 Supabase 创建项目（选 Tokyo 区域）
2. 在 `js/config.js` 中填入 Supabase URL 和 Anon Key
3. 在 SQL Editor 中执行 `supabase-init.sql`
4. 在 Storage 中创建 `images` bucket 并设为 Public
5. 本地测试（`npx serve`）或部署到 Cloudflare Pages

## 结论
项目代码已完成，需要用户完成 Supabase 配置后即可运行。
