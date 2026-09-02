# iplus2 项目长期说明

本文档根据仓库中的 HTML、CSS、JavaScript、SQL 和脚本整理，是后续开发的事实入口。它描述当前仓库，而不是早期“图片画廊”原型。

## 1. 项目概览

iplus2 是一个原生 HTML/CSS/JavaScript 多页个人网站。页面由静态服务器直接提供，Supabase 承担用户认证、资料、会员邀请码、私密对话、附件存储和行级权限控制。当前没有 `package.json`、前端框架、模块打包器、自动化测试框架或仓库内 Cloudflare 配置。

运行链路如下：

```text
浏览器页面
  ├─ css/style.css + 页面专属 CSS
  ├─ js/supabase.min.js（Supabase JS 2.49.4，仓库内 vendored 文件）
  ├─ js/config.js（创建全局 supabase client）
  └─ 共享脚本 + 页面专属经典脚本
          ↓
      Supabase
      ├─ Auth
      ├─ Postgres + RLS
      ├─ SECURITY DEFINER RPC
      └─ attachments Storage bucket
```

所有脚本都通过普通 `<script>` 标签加载，不使用 ES modules。加载顺序是运行契约：`supabase.min.js` 必须早于 `config.js`，`config.js` 必须早于所有调用全局 `supabase` 的脚本。共享 helper 同样必须在调用它的页面逻辑之前可用。

## 2. 目录职责

```text
iplus2/
├── *.html                 # 每个文件都是可直接访问的页面入口
├── css/
│   ├── style.css          # 全站基础样式与共享组件
│   └── 其他 *.css         # 管理员、个人空间、用户中心的页面专属样式
├── js/
│   ├── supabase.min.js    # vendored @supabase/supabase-js 2.49.4 UMD 构建
│   ├── config.js          # 公开 Supabase 配置及全局 client 初始化
│   ├── auth.js            # 通用认证、登出和消息 helper
│   ├── header-auth.js     # 统一渲染全站 header，并处理认证状态和菜单
│   ├── vip.js             # 会员查询、激活和徽章/会员区渲染
│   └── 其他 *.js          # 页面专属行为
├── images/                # 静态图片资源
├── sql/                   # 后续功能 SQL 与修复脚本，不是自动迁移系统
├── supabase-init.sql      # 基础表、触发器、会员/RLS 的手工初始化脚本
├── AGENTS.md              # 开发代理入口与不可违反的规则
├── PROJECT.md             # 本文档，项目事实与维护指南
├── MEMORY.md              # 少量长期历史/决策
├── SOUL.md / USER.md      # 协作角色与用户偏好
├── TOOLS.md               # 本地工具和常用命令速查
└── memory/                # 按日期记录的短期工作记忆
```

## 3. 页面入口

| 页面 | 职责 | 主要逻辑 |
|---|---|---|
| `index.html` | 当前主页和功能导航 | `header-auth.js`、`vip.js`、`home.js` |
| `login.html` | 邮箱/密码登录 | `auth.js`、`login.js` |
| `register.html` | 注册、用户名重复检查 | `auth.js`、`register.js` |
| `change-password.html` | 已登录用户修改密码 | `change-password.js` |
| `user-profile.html` | 用户资料、改名、会员状态和邀请码激活 | `vip.js`、`user-profile.js`、`user-profile.css` |
| `contact.html` | VIP/SVIP 与管理员的私密对话、附件上传 | `auth.js`、`vip.js`、`contact.js`、`contact.css` |
| `admin-invite.html` | 管理员生成和查看邀请码 | `admin-invite.js`、`admin-invite.css`、`create_invite_code` RPC |
| `2048download.html` | Windows/macOS 下载入口 | 静态 Supabase Storage 公共链接 |
| `dinner.html` | 本地随机晚餐工具 | `dinner.js`，不读写后端 |
| `about.html` | 站点介绍和外部主页链接 | 仅共享 header/会员脚本 |

所有页面只保留 `<div id="site-header"></div>` 挂载点，实际 header markup 由 `header-auth.js` 统一生成。页面不再包含 `<style>` 或无 `src` 的内联 `<script>` 块；可复用行为进入共享文件，页面专属行为和复杂样式分别放入同名 JS/CSS 文件。

## 4. 关键 JavaScript 模块

| 文件 | 公开/全局职责 | 依赖 |
|---|---|---|
| `js/config.js` | 定义全局 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `supabase` client | `window.supabase` |
| `js/auth.js` | `requireAuth`、`logout`、`showMessage`、`hideMessage` | 全局 `supabase`、固定页面路径 |
| `js/header-auth.js` | 渲染共享 header，查询 session/profile，显示认证状态并处理菜单 | `profiles` 表；可选调用 `updateMemberBadgeInDropdown` |
| `js/vip.js` | 查询会员状态、调用激活 RPC、渲染 VIP/SVIP UI | `profiles`、`activate_vip_code` |
| `js/home.js` | 更新主页欢迎语，按会员/管理员状态显示入口 | Auth、`profiles` |
| `js/login.js` | 表单校验与 `signInWithPassword` | `auth.js` |
| `js/register.js` | 注册校验、邮箱/用户名检查和 `signUp` | `auth.js`、`profiles`、可选 `check_email_exists` RPC |
| `js/change-password.js` | 校验新密码并调用 `auth.updateUser` | Auth |
| `js/contact.js` | 创建/选择空间、对话 CRUD、附件上传/删除、DOM 转义 | `vip.js`、三张业务表、`attachments` bucket |
| `js/user-profile.js` | 加载资料、修改用户名、绑定会员激活和改密入口 | `vip.js`、Auth、`profiles` |
| `js/admin-invite.js` | 管理员校验、邀请码生成/列表/复制；使用 DOM API 安全渲染后端文本 | Auth、`profiles`、`invite_codes`、`create_invite_code` |
| `js/dinner.js` | 本地晚餐随机选择与动画 | DOM，无后端依赖 |

脚本使用全局函数与变量，没有模块隔离；新增同名顶层标识符可能覆盖其他脚本。页面行为通常在 `DOMContentLoaded` 中绑定，异步 Supabase 调用使用 `async/await`。

## 5. Supabase 数据契约

### 表

- `profiles`：以 `auth.users.id` 为主键；保存 `username`、`user_type`、`upgraded_at`、`is_admin`。前端把它视为用户名、会员和管理员状态的权威来源。
- `posts`：早期公共“复平面/帖子”数据结构，包含文本和附件元数据。当前仓库没有对应页面脚本，但表仍由基础 SQL 创建。
- `invite_codes`：VIP/SVIP 邀请码、使用状态、使用者和时间。
- `private_spaces`：每个会员用户至多一个与管理员对话的空间。
- `private_posts`：私密空间内的消息和可选附件元数据。

### 触发器和 RPC

- `handle_new_user` + `on_auth_user_created`：注册后创建 `profiles` 行。
- `activate_vip_code(p_code)`：校验并消费邀请码，更新 `profiles.user_type`。
- `create_invite_code(p_type, p_custom_code)`：仅管理员生成邀请码。
- `check_email_exists(p_email)`：`register.js` 会尝试调用，但仓库 SQL 没有提供其定义；调用报错时当前前端忽略错误并继续注册流程。

### RLS 和授权

- `profiles` 可读，用户只能更新自己的行。
- `invite_codes` 的列表查询只允许 `profiles.is_admin = true` 的用户；普通用户通过 SECURITY DEFINER RPC 激活。
- `private_spaces` 和 `private_posts` 只允许空间所属用户或管理员访问；消息删除只允许作者本人。
- 页面上的按钮显示/隐藏只是 UX，真正的授权必须由 RLS 或 RPC 内的管理员检查完成。

### Storage

- bucket 名称固定为 `attachments`。
- 当前设计要求 bucket 公开读取，因为数据库保存并渲染 `getPublicUrl` 返回的 URL。
- 私密对话附件路径格式为 `private/<spaceId>/<随机后缀>_<原文件名>`。
- 数据库中的 `storage_path` 用于删除对应对象；改路径规则时必须同时修改上传、数据库记录、删除逻辑和 Storage policy。

## 6. 配置和环境变量约定

当前没有 `.env`、运行时配置文件或构建时环境变量注入。浏览器公开配置位于 `js/config.js`：

- 只允许放 Supabase 项目 URL 和浏览器可公开使用的 anon/publishable key。
- 绝不能放 `service_role` key、数据库密码或任何服务器 secret。
- 不要把 key 的实际值复制到 Markdown、截图、日志或提交说明。
- 若未来引入 `.env`，必须同时引入能够在部署时安全注入配置的构建/服务端方案；仅创建 `.env` 不会影响当前静态页面。

管理员身份通过 `profiles.is_admin` 管理，不应通过前端常量授予。`js/contact.js` 中现有的固定管理员 UUID 只影响消息徽章显示，不是可靠授权机制；修改管理员模型时应移除这种重复来源。

### 时间约定

- 所有面向用户的项目日期和时间统一按 IANA 时区 `Asia/Shanghai` 显示，不跟随开发者当前设备所在的底特律时区。
- 数据库继续使用 `TIMESTAMPTZ` 和 `NOW()` 保存绝对时间点；不要把数据库字段改成无时区的本地时间字符串。
- JavaScript 格式化绝对日期时必须显式传入 `timeZone: 'Asia/Shanghai'`。相对时间（如“5 分钟前”）按时间点差值计算，不需要时区转换。
- 日志、部署说明或人工输入日期如未注明其他时区，均按上海时间解释；跨系统传递优先使用 ISO 8601 时间戳。

## 7. 数据库初始化与变更

仓库没有迁移工具，所有 SQL 需要在 Supabase SQL Editor 中人工审查和执行。对全新项目，当前脚本的逻辑顺序是：

1. `supabase-init.sql`：基础 `profiles`、触发器、`posts`、会员字段、`invite_codes` 和基础 RLS/RPC。
2. `sql/private-space-schema.sql`：私密空间表与 RLS。
3. `sql/invite-codes-admin.sql`：管理员生成邀请码 RPC。
4. `sql/fix-invite-bugs.sql`：管理员查看策略，以及兼容 `user_type = 'free'` 的激活函数修复。
5. 在 Dashboard 手工创建公开读取的 `attachments` bucket，并为上传/删除配置与实际路径一致的 Storage policies。
6. 在可信管理界面或经审查的 SQL 中设置管理员的 `profiles.is_admin`；不要在客户端实现提权。

`sql/membership-schema.sql` 是早期会员功能脚本，功能已被 `supabase-init.sql` 和后续修复覆盖，不应与上述流程无判断地重复执行。

重要限制：这些文件不是严格的、可回滚的、全部幂等的迁移。尤其 `supabase-init.sql` 会删除 `posts` 表；重复创建同名 policy 也可能失败。对已有环境执行前必须确认目标项目、检查已存在对象、备份数据，并把新变更写成明确的增量 SQL。

## 8. 本地开发、检查和部署

### 启动

项目必须通过 HTTP 访问，不建议直接用 `file://` 打开：

```bash
cd /path/to/iplus2
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/`。也可临时使用 `npx serve .`，但仓库没有固定 Node 依赖或 lockfile，不应把它当成已安装的项目命令。

### 语法和基础检查

仓库当前没有 `npm test`、lint、build 或端到端测试。可执行：

```bash
for file in js/*.js; do node --check "$file" || exit 1; done
git diff --check
```

`node --check` 只能覆盖独立 `.js` 文件，不能覆盖 DOM、CSS 或浏览器/Supabase 运行时行为。修改页面后还需人工检查浏览器控制台和 Network 面板。

最低手工回归范围：

- 桌面和窄屏下逐页打开，确认本地 CSS/JS 没有 404。
- 未登录、普通用户、VIP/SVIP、管理员四种状态的 header 和入口权限。
- 注册、登录、登出、改名、改密码和邀请码激活。
- 私密空间创建、双方发消息、上传/打开/删除附件，并确认 Storage 对象是否同步删除。
- 管理员生成/查看邀请码，以及非管理员的 RLS 拒绝行为。

### Build 与部署

- Build：无；源文件就是部署产物。
- 静态站点根目录：仓库根目录。
- 目标托管：Cloudflare Pages。仓库内没有 `wrangler.toml` 或 Pages 配置，实际项目绑定、分支和命令必须到 Cloudflare Dashboard 核对。
- 若 Pages 要求输出目录，使用仓库根目录；不要填写不存在的 `dist/` 或 `build/`。
- 部署后必须测试生产 URL，尤其检查 Supabase Auth 允许的 Site URL/Redirect URLs、下载链接、Storage CORS/权限和移动端布局。

## 9. 代码约定

以下约定来自现有代码并作为后续改动的默认规则：

- HTML 使用 2 空格缩进、语义化结构和相对路径；每个页面必须保留唯一的 `#site-header` 挂载点并加载 `header-auth.js`，不要复制 header markup。
- CSS 使用 `:root` custom properties、Flexbox/Grid 和移动端 media query；公共规则进入 `css/style.css`，页面专属规则进入独立 CSS，不新增 `<style>` 块。
- JavaScript 使用 2 空格缩进、单引号、分号、`const`/`let`、camelCase、`async/await` 和早返回。
- DOM 用户文本使用 `textContent` 或显式 `escapeHtml`；不要把未经转义的用户名、文件名、邀请码或消息拼入 `innerHTML`。
- 页面逻辑使用外部 JS 文件和 `addEventListener`，不要新增无 `src` 的 `<script>` 块或 `onclick` 等内联事件。
- 异步提交时禁用按钮并恢复状态；用户可见错误使用页面消息，诊断信息才写控制台。
- 文件名和路径是公开 URL 契约；重命名页面或脚本时要全仓搜索所有 `href`、`src` 和重定向字符串。
- 数据库字段、RPC 参数、Storage 路径和 RLS 是一个整体，不能只改单侧。
- 不新增框架或运行时依赖，除非收益明确且任务范围包含构建、部署和文档迁移。

仓库没有正式 formatter/linter 配置，因此不要进行与任务无关的大范围格式化。

## 10. 已知约束和维护风险

这些是当前源码可验证的事实；修复后应立即更新本节。

- 当前前端引用 `check_email_exists` RPC，但仓库 SQL 未定义它。
- `supabase-init.sql` 不是安全迁移：它会 `DROP TABLE IF EXISTS posts`，且 policy 创建并非全部可重复执行。
- 当前附件上传路径以 `private/` 开头，而 `sql/private-space-schema.sql` 注释中的 DELETE policy 示例按首级目录匹配用户 id；两者不一致，可能导致数据库消息已删但 Storage 对象仍保留。
- `private_spaces_insert` policy 只检查请求者是否为会员/管理员，没有要求普通会员插入的 `user_id = auth.uid()`；会员可能为其他用户占用唯一空间，需要在后续数据库修复中收紧。
- `js/contact.js` 中存在固定管理员 UUID，仅用于徽章判断；管理员授权本身来自 `profiles.is_admin`。两套来源可能不一致。
- 早期 `posts` 表仍由 `supabase-init.sql` 创建，但当前没有对应页面或前端脚本；在核实线上数据库和历史临时 SQL 前不要删除或重建该表。

## 11. 修改完成检查清单

1. `git status --short` 只包含预期文件。
2. 本地资源引用存在，经典脚本加载顺序正确。
3. 独立 JS 通过 `node --check`，`git diff --check` 无错误。
4. 相关身份和权限场景已手工验证，浏览器控制台无新增错误。
5. 数据库变更包含相应 RLS/RPC/Storage policy，并经过目标环境确认与备份。
6. 前端配置只含公开值，变更和文档中没有 secret。
7. 架构、命令或数据契约发生变化时，同步更新本文档。
8. Luka 与 agent 确认最终测试完成、任务结束后，检查并更新所有受影响的长期 Markdown；不要写入临时任务过程。
