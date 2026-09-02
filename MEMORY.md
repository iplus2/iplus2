# MEMORY.md - 长期项目记忆

## 稳定决策

- 项目采用原生 HTML/CSS/JavaScript，多页静态站点形态，避免不必要的前端框架和构建依赖。
- 后端使用 Supabase Auth、Postgres/RLS、RPC 和 Storage；部署目标是 Cloudflare Pages。
- 用户体验优先考虑中文用户、移动端和低维护成本。
- 权限必须由 Supabase RLS/RPC 保证，前端显示控制不能替代后端授权。
- 浏览器端只允许公开 Supabase URL 与 anon/publishable key；任何 Markdown 都不得记录 key 的实际值。

## 项目演进

- 项目最初是登录、注册和图片画廊原型，后来演进为 iplus2 个人网站。
- 当前功能包括认证与用户中心、VIP/SVIP 邀请码、管理员邀请码管理、会员私密空间及附件、双人 2048 下载页、晚餐随机工具和关于页。
- 早期 gallery/post 前端样式、文案和失效资源引用已清理；`posts` 数据库结构暂时保留，等待未来结合线上实际状态处理。
- 全站 header 由 `js/header-auth.js` 统一渲染；管理员、个人空间、用户中心和晚餐页面的行为/复杂样式已拆分为独立 JS/CSS 文件。
- Git 远程仓库为 `iplus2/iplus2`。历史环境曾使用 WSL 专用推送脚本；这些不可移植的辅助脚本已从仓库移除，后续使用当前环境的普通 Git 命令。

## 文档入口

- 开发代理规则：`AGENTS.md`
- 架构、目录、命令、数据契约和注意事项：`PROJECT.md`
- 本地工具速查：`TOOLS.md`
- 短期进展：`memory/YYYY-MM-DD.md`

不得在本文件加入 API key、密码、token、SSH key 或其他凭据，也不要保存一次性任务状态。
