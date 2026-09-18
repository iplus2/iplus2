# iplus2 项目说明

本文记录可由源码和 SQL 验证的架构与数据契约；协作规则见 [AGENTS.md](AGENTS.md)，命令见 [TOOLS.md](TOOLS.md)。

## 架构与目录

原生 HTML/CSS/JavaScript 多页静态网站，部署目标为 Cloudflare Pages。Supabase 提供 Auth、Postgres/RLS、RPC 和 Storage。没有前端框架、构建流水线、`package.json`、仓库内测试框架或 Cloudflare 配置。

| 位置 | 职责 |
|---|---|
| 根目录 `*.html` | 可直接访问的页面入口 |
| `css/style.css` | 全站样式；其余 CSS 为页面专属样式 |
| `js/` | 经典脚本、页面逻辑及 vendored Supabase JS 2.49.4 |
| `images/` | 静态图片 |
| `sql/`、`supabase-init.sql` | 人工执行的数据库脚本，不是自动迁移系统 |
| `memory/` | 本地短期记忆，不纳入 Git |
| `sql_backup/` | 本地数据库备份，不纳入 Git |

浏览器直接加载源文件。`js/supabase.min.js` 必须早于 `js/config.js`，共享 helper 必须早于调用它的页面脚本；不使用 ES modules。多数脚本共享全局作用域，信箱使用 IIFE 隔离内部状态。

全站 header 由 `js/header-auth.js` 渲染到唯一的 `#site-header` 挂载点。页面行为通过外部脚本和 `addEventListener` 绑定，不添加内联脚本或事件属性。

## 页面与模块

下表只列页面专属逻辑；共享模块另列。

| 页面 | 功能 | 页面脚本 |
|---|---|---|
| `index.html` | 欢迎语、按身份显示功能入口 | `home.js`、`dinner.js` |
| `login.html` | 邮箱/密码登录 | `login.js` |
| `register.html` | 注册、邮箱及用户名检查 | `register.js` |
| `change-password.html` | 已登录用户改密 | `change-password.js` |
| `user-profile.html` | 资料、改名、会员激活 | `user-profile.js` |
| `contact.html` | VIP/SVIP 与站主的私密对话、附件 | `contact.js` |
| `mailbox.html` | 站主与 SVIP 的延迟照片信箱 | `mailbox.js` |
| `admin-invite.html` | 站主管理邀请码 | `admin-invite.js` |
| `dinner.html` | 按上海时间推荐餐食 | `dinner.js` |
| `2048download.html` | Windows/macOS 下载入口 | 无 |
| `about.html` | 站点介绍和外部链接 | 无 |

| 共享脚本 | 职责 |
|---|---|
| `config.js` | 公开 Supabase URL、anon/publishable key 和全局 client |
| `auth.js` | `requireAuth`、登出、页面消息 helper |
| `header-auth.js` | header、登录状态、用户名与菜单 |
| `vip.js` | 会员查询、激活 RPC、徽章、会员区和上海日期格式化 |

`config.js` 是浏览器配置入口，没有 `.env` 注入机制。前端授权信息取自 `profiles`，不能以客户端常量替代 RLS。

### 餐食推荐

首页入口与推荐页共用 `js/dinner.js`，含五套随机列表。按上海时间划分：05:00–11:00 早饭、11:00–14:00 午饭、14:00–17:00 下午茶、17:00–21:00 晚饭，其余时间夜宵。定时检查餐别，并在切回页面、窗口获焦或抽取时刷新。

### 个人空间

会员查看自己的空间；站主查看所有对话的汇总列表，回复对象选择器只决定发送目标。消息按 `created_at DESC, id DESC` 排序，初次显示 10 条，加载更多向底部追加 10 条。使用时间与 ID 联合游标，多查询一条判断是否还有历史。发送后回到最新一页，消息仅允许作者删除。

### 信箱

首页入口只对站主和 SVIP 显示，每封信只寄一张图片，没有正文。站主选择 SVIP 收件人，SVIP 选择站主，双方均不能撤回、修改或删除信件。

发送者可立即查看已寄照片，指定收件者在服务器寄出时间满 48 小时后才能读取信件及图片。站主也受等待时间和收件人限制；降为普通/VIP 后失去信箱访问权限。

收件与寄件列表按 `sent_at DESC, id DESC` 分页，每次显示 10 条；点击刷新重新取信。上传成功但投递响应未确认时，`sessionStorage` 保存路径与收件人，RPC 重试返回原信件，不重复投递或重新计时。

## 时间约定

- 项目日期和时间统一按 `Asia/Shanghai` 展示和解释，JavaScript 格式化时显式指定时区。
- 数据库使用 `TIMESTAMPTZ` 保存绝对时间点，时间由数据库生成；信箱使用 `clock_timestamp()` 并加 `INTERVAL '48 hours'`。
- 相对时间按时间点差值计算；跨系统传递使用带时区的 ISO 8601 时间戳。

## 数据契约

### 表

| 表 | 内容 |
|---|---|
| `profiles` | 用户名、`user_type`、`upgraded_at`、`is_admin`；主键关联 `auth.users.id` |
| `invite_codes` | VIP/SVIP 邀请码及使用记录 |
| `private_spaces` | 每个会员至多一个与站主对话的空间 |
| `private_posts` | 空间消息及附件元数据 |
| `mailbox_letters` | 发送者、收件者、唯一 `storage_path`、`sent_at`、`deliver_at`；无正文或公开 URL |
| `posts` | 基础 SQL 中保留的早期帖子结构，无当前前端入口 |

### 触发器与 RPC

| 名称 | 契约 |
|---|---|
| `handle_new_user` / `on_auth_user_created` | 注册后创建 `profiles` 行 |
| `activate_vip_code(p_code)` | 校验、消费邀请码并更新会员资料 |
| `create_invite_code(p_type, p_custom_code)` | 仅站主可生成邀请码 |
| `mailbox_has_access()` | 根据调用者的 `profiles` 判断信箱资格 |
| `send_mailbox_photo(p_recipient_id, p_storage_path)` | 校验站主与非管理员 SVIP 互寄关系、上传路径、对象 MIME/大小，生成寄出及可见时间；相同投递幂等 |
| `check_email_exists(p_email)` | 注册页尝试调用，但仓库未提供定义；调用失败时前端继续注册 |

### 授权

- `profiles` 可读，客户端只允许更新自己行的 `username`。列权限保护由 `sql/mailbox-schema.sql` 添加，基础初始化脚本单独执行时不具备这层保护。
- `invite_codes` 只允许站主查询；普通用户通过 SECURITY DEFINER RPC 激活。
- `private_spaces`、`private_posts` 只允许空间所属用户或站主读取；具体限制与已知缺陷见对应 SQL 和文末。
- `mailbox_letters` 客户端只有 SELECT 权限，INSERT 必须经寄送 RPC；RLS 同时检查身份、信件参与者和投递时间。

### Storage

| bucket | 读取方式 | 路径 | 类型与大小 |
|---|---|---|---|
| `attachments` | Public，前端保存并使用 `getPublicUrl()` | `private/<spaceId>/<随机后缀>_<原文件名>` | 个人空间附件，配置以实际 bucket 为准 |
| `mailbox-photos` | Private，通过登录身份调用 `download()` | `<发送者 UUID>/<随机 UUID>.<扩展名>` | 最大 10 MB；`image/jpeg`、`image/png`、`image/webp`、`image/gif` |

个人空间使用数据库中的 `storage_path` 删除对象。路径变更必须同步检查上传、数据库记录、删除逻辑和 policy。

信箱图片下载后只生成页面内临时 blob URL，不保存公开或签名链接。Storage SELECT 通过信件 RLS 限制访问；限制性 policies 防止原有宽泛附件策略放行，客户端不能覆盖、移动或删除信箱对象。不能把信箱 bucket 改成 Public。

前端会解码所选图片；服务端仅校验声明的 MIME 与大小，不对图片字节做解码鉴定。上传后未完成投递的孤立对象不向收件人开放，也不自动删除；运维清理需确认无对应信件并通过 Storage API 操作。

## 数据库初始化与变更

SQL 在 Supabase SQL Editor 中人工审查执行。全新项目按以下顺序准备：

1. `supabase-init.sql`：基础资料、帖子、会员与邀请码结构。
2. `sql/private-space-schema.sql`：私密空间及 RLS。
3. `sql/invite-codes-admin.sql`、`sql/fix-invite-bugs.sql`：邀请码管理及激活修复。
4. 创建公开 `attachments` bucket，配置与上传路径一致的 Storage policies；通过可信后台设置站主身份。
5. 创建符合上表限制的私有 `mailbox-photos` bucket，执行 `sql/mailbox-schema.sql`：检查 bucket、建立信箱表/RPC/RLS、收紧资料更新权限。

已有项目使用增量 SQL，不能重跑基础初始化脚本。`supabase-init.sql` 会删除 `posts`，旧脚本的 policy 也不全支持重复创建；执行前须确认目标项目并备份。信箱脚本在事务内执行，可重复运行，不删除已有消息或附件。

`sql/membership-schema.sql` 是早期脚本，已被基础初始化和后续修复覆盖，不应重复执行。

## 检查与部署

启动及语法检查命令见 [TOOLS.md](TOOLS.md)。语法检查不覆盖浏览器、权限或数据库运行时；功能修改需按影响范围验证：

- 桌面/手机布局、本地资源、浏览器 Console 与 Network。
- 未登录、普通用户、VIP、SVIP、站主的入口与权限。
- 注册、登录、登出、改名、改密、邀请码激活和管理。
- 餐别边界与设备时区变化；个人空间分页、发送、删除和附件同步。
- 信箱双向寄图、失败重试、48 小时前后的表查询与图片读取，以及直接修改/删除被拒绝。时间边界夹具只能在隔离测试库设置。

Cloudflare Pages 无 build 命令，输出目录为仓库根目录，不是 `dist/` 或 `build/`。项目绑定、部署分支、生产 URL 在 Dashboard 核对；部署后还需检查 Auth Site URL/Redirect URLs、Storage 访问和移动端。

## 代码约定

- HTML/CSS/JS 使用 2 空格缩进；JavaScript 使用单引号、分号、`const`/`let`、camelCase、`async/await`。
- 共享样式放在 `css/style.css`，复杂页面样式放在同名 CSS；保持原生技术栈，不为小改动增加依赖。
- 用户文本使用 `textContent` 或显式转义；异步提交时禁用按钮并恢复状态，错误向用户展示。
- 页面路径、表字段、RPC 参数、Storage 路径均为接口契约；变更时全仓检查调用点。
- 没有统一 formatter/linter，不做无关的全文件格式化。

## 已知约束

- `check_email_exists` 的定义缺失，见 RPC 表。
- `sql/private-space-schema.sql` 的附件 DELETE policy 注释按首级目录匹配用户 ID，与实际 `private/<spaceId>/...` 路径不一致，可能造成 Storage 对象遗留。
- `private_spaces_insert` 未要求普通会员插入的 `user_id = auth.uid()`，可能允许占用他人的空间。
- `js/contact.js` 的固定管理员 UUID 只用于徽章，可能与 `profiles.is_admin` 不一致，不能用作授权。
- `posts` 的线上状态不能由基础 SQL 推断；删除或重建前须核对实际数据库。
