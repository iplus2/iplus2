# TOOLS.md - 本地开发速查

详细架构和完整流程见 `PROJECT.md`。

## 本地静态服务器

```bash
python3 -m http.server 8000
```

访问 `http://localhost:8000/`。项目没有安装步骤、`package.json` 或 build 命令；不要直接通过 `file://` 测试。

## 基础检查

```bash
for file in js/*.js; do node --check "$file" || exit 1; done
git diff --check
git status --short
```

浏览器中还需检查 Console、Network、本地资源 404，以及不同登录/会员/管理员状态。仓库没有自动化测试或 lint 配置。

## Supabase

- 浏览器客户端：仓库内 `js/supabase.min.js`，当前为 `@supabase/supabase-js` 2.49.4 UMD 构建。
- 客户端初始化：`js/config.js`。
- SQL：在 Supabase Dashboard 的 SQL Editor 中人工审查执行，顺序与风险见 `PROJECT.md`。
- Storage：使用 `attachments` bucket；上传/删除路径必须与 policy 同步。
- 前端只能使用 anon/publishable key。禁止把 key 值写入 Markdown，禁止使用 `service_role` key。

## Cloudflare Pages

- 部署内容：仓库根目录中的静态文件。
- Build 命令：无。
- 输出目录：仓库根目录，不是 `dist/` 或 `build/`。
- 仓库没有 Pages 配置文件；项目绑定、生产分支和环境设置需在 Dashboard 中确认。

## Git

使用当前环境的普通 Git 命令。提交前先运行 `git status --short` 和 `git diff --check`，不要使用硬编码本地路径、SSH key 或提交信息的自动推送脚本。
