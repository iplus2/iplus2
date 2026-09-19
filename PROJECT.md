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

浏览器直接加载源文件。`js/supabase.min.js` 必须早于 `js/config.js`，共享 helper 必须早于调用它的页面脚本；不使用 ES modules。多数脚本共享全局作用域，信箱和心愿单使用 IIFE 隔离内部状态。

全站 header 由 `js/header-auth.js` 渲染到唯一的 `#site-header` 挂载点。页面行为通过外部脚本和 `addEventListener` 绑定，不添加内联脚本或事件属性。

## 页面与模块

下表只列页面专属逻辑；共享模块另列。

| 页面 | 功能 | 页面脚本 |
|---|---|---|
| `index.html` | 欢迎语、按身份显示功能入口 | `home.js`、`dinner.js` |
| `login.html` | 邮箱/密码登录 | `login.js` |
| `register.html` | 注册与最小化用户名查重 | `register.js` |
| `change-password.html` | 已登录用户改密 | `change-password.js` |
| `user-profile.html` | 资料、改名、会员激活 | `user-profile.js` |
| `contact.html` | VIP/SVIP 与站主的私密对话、附件 | `contact.js` |
| `mailbox.html` | 站主与 SVIP 的延迟照片信箱 | `mailbox.js` |
| `wishlist.html` | 站主与 SVIP 共享心愿、图片和完成状态 | `wishlist.js` |
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

首页入口与推荐页共用 `js/dinner.js`，含五套随机列表。按上海时间划分：04:00–11:00 早饭、11:00–14:00 午饭、14:00–17:00 下午茶、17:00–21:00 晚饭，其余时间夜宵。定时检查餐别，并在切回页面、窗口获焦或抽取时刷新。

### 个人空间

会员查看自己的空间；站主查看所有对话的汇总列表，回复对象选择器只决定发送目标。消息按 `created_at DESC, id DESC` 排序，初次显示 10 条，加载更多向底部追加 10 条。使用时间与 ID 联合游标，多查询一条判断是否还有历史。发送后回到最新一页，消息仅允许作者删除。

个人空间附件使用独立私有 `private-attachments` bucket，单个文件最大 20 MB。前端通过登录身份 `download()` 后以临时 blob URL 下载，不保存或使用公开链接，也不在本站直接执行附件内容。旧附件若尚未迁移，仅显示迁移提示，不回退访问公开 URL。

`send_private_post` 校验空间、当前会员资格和上传对象，并从 `profiles` 生成作者名；客户端不能伪造作者、时间、公开 URL 或引用他人附件。请求 UUID 支持发送失败后幂等确认，待确认请求保存在当前用户的 `sessionStorage`。消息先删除，再通过 Storage API 清理作者自己的孤立附件；清理失败会提示，孤立对象仅上传者在仍具备空间权限时可读取或删除，站主后台可清理。所有作者徽章取自 `profiles`。

### 信箱

首页入口只对站主和 SVIP 显示，每封信只寄一张图片，没有正文。站主选择 SVIP 收件人，SVIP 选择站主，双方均不能撤回、修改或删除信件。

发送者可立即查看已寄照片，指定收件者在服务器寄出时间满 48 小时后才能读取信件及图片。站主也受等待时间和收件人限制；降为普通/VIP 后失去信箱访问权限。

收件与寄件列表按 `sent_at DESC, id DESC` 分页，每次显示 10 条；点击刷新重新取信。上传成功但投递响应未确认时，`sessionStorage` 保存路径与收件人，RPC 重试返回原信件，不重复投递或重新计时。

### 心愿单

首页入口仅对站主和 SVIP 显示。每位 SVIP 与站主独立共享心愿；站主查看所有心愿的汇总，添加时选择 SVIP 用户。文本必填（最多 2000 字），可附至多一张图片。双方都可标记或取消完成，已完成卡片为绿色并带文字状态。

默认分批取完全部未完成心愿；点击加载更多，每次追加 10 条已完成心愿，以多查一条判断后续页。未完成排在前，已完成排在后，各自按 `created_at DESC, id DESC` 排序，使用时间与 ID 联合游标。刚标记完成的心愿保留在当前页面，便于取消；刷新或添加后回到仅显示未完成的初始列表。状态切换不改创建时间。

访问权限取自 `profiles`，普通用户、VIP 及降级用户不能读取或修改心愿及其图片。客户端只有表查询权限，创建和状态修改经 RPC，不能改写作者、归属、正文、图片或时间。添加使用固定请求 UUID；响应未确认时，`sessionStorage` 保留请求以便幂等重试。

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
| `private_posts` | 空间消息及附件元数据；新附件记录 `storage_bucket = 'private-attachments'`、`storage_path`，不写 `file_url` |
| `mailbox_letters` | 发送者、收件者、唯一 `storage_path`、`sent_at`、`deliver_at`；无正文或公开 URL |
| `wishlist_items` | SVIP 归属 `owner_id`、作者、正文、可空且唯一的图片路径、创建时间、`is_completed` |
| `posts` | 基础 SQL 中保留的早期帖子结构，无当前前端入口 |

### 触发器与 RPC

| 名称 | 契约 |
|---|---|
| `handle_new_user` / `on_auth_user_created` | 注册后创建 `profiles` 行 |
| `activate_vip_code(p_code)` | 仅登录用户可调用；锁定用户资料及未用邀请码，原子完成一次升级和消费 |
| `create_invite_code(p_type, p_custom_code)` | 仅登录站主可生成 VIP/SVIP 邀请码，默认使用 32 位随机码；旧单参数重载不再向客户端开放 |
| `profile_can_read(p_id)` | 本人、站主，以及 VIP/SVIP 对站主资料的读取校验；SECURITY DEFINER 避免 profiles RLS 自引用递归 |
| `is_username_taken(p_username)` | 匿名注册和登录用户改名的精确查重，仅返回布尔值；唯一索引保证并发写入不会重名 |
| `private_space_is_admin()` / `private_space_has_access()` / `private_space_can_access(p_space_id)` | 按当前 `profiles` 校验站主/会员身份和空间归属 |
| `private_attachment_is_own(p_path)` / `private_attachment_can_read(p_path)` / `private_attachment_can_delete(p_path)` | 校验上传路径、已发布附件的空间权限，以及作者清理未被消息引用的对象 |
| `send_private_post(p_id, p_space_id, p_content, p_storage_path, p_file_name)` | 验证当前空间权限、正文、可选附件路径与大小；服务端生成作者、时间及存储字段，同一请求幂等 |
| `mailbox_has_access()` | 根据调用者的 `profiles` 判断信箱资格 |
| `send_mailbox_photo(p_recipient_id, p_storage_path)` | 校验站主与非管理员 SVIP 互寄关系、上传路径、对象 MIME/大小，生成寄出及可见时间；相同投递幂等 |
| `wishlist_has_access()` / `wishlist_can_access(p_owner_id)` | 校验当前站主/SVIP 身份及心愿归属；站主可访问汇总，SVIP 仅访问自己的一份 |
| `create_wishlist_item(p_id, p_owner_id, p_content, p_storage_path)` | 验证共享对象、正文、可选图片路径/MIME/大小；服务端生成作者、时间和未完成状态，同一请求幂等 |
| `set_wishlist_completed(p_id, p_completed)` | 站主或所属 SVIP 可设置完成/未完成；不改变其他字段 |
| `check_email_exists(p_email)` | 前端不再调用；如库中存在旧函数，加固脚本撤销其客户端执行权，避免额外邮箱枚举接口 |

### 授权

- 匿名用户不能查询 `profiles`；普通用户仅查本人，VIP/SVIP 可查本人及站主，站主可查全部。现有页面所需的收件人、作者姓名和徽章仍可获取，会员不能枚举其他会员资料。客户端只允许更新自己的 `username`，不能插入或改写身份；注册触发器仍可建立资料。用户名保留大小写敏感的比较规则，唯一索引保证查重与写入之间的并发安全。
- `invite_codes` 只允许登录站主查询，客户端没有直接写表权限；登录用户通过 SECURITY DEFINER RPC 激活。激活先锁定调用者资料，再锁定未使用的邀请码，防止同一用户或同一码被并发重复消费。RPC 固定空 search_path 并显式引用业务表。
- `private_spaces`、`private_posts` 只允许当前有资格的所属会员或站主读取，降为普通用户即失去权限。会员只能建立自己的空间；客户端不能删除整个空间、改写消息或直接插入消息。消息经发送 RPC 创建，只允许有空间权限的作者删除。
- `mailbox_letters` 客户端只有 SELECT 权限，INSERT 必须经寄送 RPC；RLS 同时检查身份、信件参与者和投递时间。
- `wishlist_items` 的 RLS 检查当前身份与归属；创建和修改完成状态仅经 RPC，站主和所属 SVIP 均可操作。

### Storage

| bucket | 读取方式 | 路径 | 类型与大小 |
|---|---|---|---|
| `attachments` | Public，公共页面通过固定 public URL 下载 | 如 `2048download/...` | 仅存公共页面文件；上传、覆盖、删除限站主 |
| `private-attachments` | Private，带登录身份 `download()` | `<空间 UUID>/<作者 UUID>/<消息 UUID>` | 最大 20 MB，原始文件名保存在消息中 |
| `mailbox-photos` | Private，通过登录身份调用 `download()` | `<发送者 UUID>/<随机 UUID>.<扩展名>` | 最大 10 MB；`image/jpeg`、`image/png`、`image/webp`、`image/gif` |
| `wishlist-photos` | Private，通过登录身份调用 `download()` | `<作者 UUID>/<心愿 UUID>.<扩展名>` | 最大 10 MB；`image/jpeg`、`image/png`、`image/webp`、`image/gif` |

个人空间按数据库中的 `storage_bucket` 和 `storage_path` 读取、删除对象。私有附件禁止覆盖或移动；限制性策略防止历史宽泛 Storage policies 放开权限。新公开附件不允许写入 `attachments/private/`，但已有公开对象不会被 SQL 自动迁移或删除，处理约束见下文「旧附件迁移约束」。

公共 bucket 的 public URL 下载不受 SELECT RLS 保护，旧私密文件必须从公共 bucket 清除后才能阻断源站公开访问；已被下载或缓存的副本无法靠 RLS 收回。[Supabase bucket 访问规则](https://supabase.com/docs/guides/storage/buckets/fundamentals)

信箱图片下载后只生成页面内临时 blob URL，不保存公开或签名链接。Storage SELECT 通过信件 RLS 限制访问；限制性 policies 防止原有宽泛附件策略放行，客户端不能覆盖、移动或删除信箱对象。不能把信箱 bucket 改成 Public。

前端会解码所选图片；服务端仅校验声明的 MIME 与大小，不对图片字节做解码鉴定。上传后未完成投递的孤立对象不向收件人开放，也不自动删除；运维清理需确认无对应信件并通过 Storage API 操作。

心愿图片同样使用临时 blob URL；Storage SELECT 通过心愿 RLS 限制读取。限制性策略防止历史宽泛策略放开上传、读取、覆盖、移动或删除权限。上传后未创建心愿的孤立图片不开放读取，也不自动清理；清理前须核实关联并通过 Storage API 操作。不能把心愿 bucket 改为 Public。

## 数据库初始化与变更

SQL 在 Supabase SQL Editor 中人工审查执行。全新项目按以下顺序准备：

1. `supabase-init.sql`：基础资料、帖子、会员与邀请码结构。
2. `sql/private-space-schema.sql`：私密空间及 RLS。
3. `sql/invite-codes-admin.sql`、`sql/fix-invite-bugs.sql`：邀请码管理及激活修复。
4. 创建仅存公共页面文件的公开 `attachments` bucket；通过可信后台设置站主身份。
5. 创建符合上表限制的私有 `mailbox-photos` bucket，执行 `sql/mailbox-schema.sql`：检查 bucket、建立信箱表/RPC/RLS、收紧资料更新权限。
6. 创建符合上表限制的私有 `wishlist-photos` bucket，执行 `sql/wishlist-schema.sql`：检查 bucket、建立心愿表/RPC/RLS 和图片策略。心愿单不依赖信箱表，脚本在事务内执行、可重复运行，不删除现有数据。
7. 创建私有 `private-attachments` bucket（20 MB），执行 `sql/private-attachments.sql`，建立个人空间发送 RPC、附件策略并收紧空间与身份权限。该脚本不依赖信箱或心愿表，可重复执行，不删除消息或 Storage 文件。已有公开私密附件按下文约束迁移、核验和清理。
8. 最后执行 `sql/privacy-hardening.sql`，并配套发布新版注册和用户中心脚本：收紧资料读取、邀请码 RPC 与整表授权，建立用户名唯一索引。存在历史重名时整个事务停止，不自动删除或改名，先核对再处理。

已有项目只执行所需增量 SQL，先确认目标项目并备份。信箱、心愿单、私有附件和隐私加固脚本均在事务中执行、支持重复运行，不删除已有消息或文件。不要重跑 `supabase-init.sql`：它会删除 `posts`，旧 policy 也不全支持重复创建。权限脚本以 `privacy-hardening.sql` 收尾，重跑旧脚本后须核对授权，避免恢复过宽权限。

`sql/membership-schema.sql` 是早期脚本，已被基础初始化和后续修复覆盖，不应重复执行。

数据库与前端须配套：个人空间依赖 `storage_bucket` 和 `send_private_post`，注册及改名依赖 `is_username_taken`。先准备数据库，再发布对应前端；不要用 SQL Editor 的管理员身份代替真实用户验证 RLS。

### 旧附件迁移约束

仅在旧消息或 `attachments/private/` 仍有附件时需要处理；不存在旧附件则跳过。

- 先备份原文件。通过 Storage Dashboard/API 将文件复制至 `private-attachments/<space_id>/<author_id>/<post_id>`，核对内容后更新对应消息的 `storage_bucket`、`storage_path` 并清空 `file_url`，保留原 `file_name`。
- 用双方账号验证读取后，核对旧对象是否仍有引用，再经确认删除公开原件或孤立对象。公共页面依赖的 `2048download/` 等目录必须保留。
- 不直接修改或删除 `storage.objects` 元数据来迁移文件；必须通过 Storage Dashboard/API 操作文件实体。RLS 不能使公共 bucket 的旧 public URL 自动失效，也无法收回已下载的副本。

## 检查与部署

启动及语法检查命令见 [TOOLS.md](TOOLS.md)。语法检查不覆盖浏览器、权限或数据库运行时；功能修改需按影响范围验证：

- 桌面/手机布局、本地资源、浏览器 Console 与 Network。
- 未登录、普通用户、VIP、SVIP、站主的入口与权限。
- 注册、登录、登出、改名、改密、邀请码激活和管理；匿名不能枚举资料/消耗邀请码，会员不能读取其他会员资料，用户名冲突与查重失败要正确反馈，邀请码同码/同用户并发消费只能成功一次。
- 餐别边界与设备时区变化；个人空间分页、幂等发送、私有附件下载、作者删除和清理失败提示；越权/降级、跨空间上传、伪造作者或附件引用必须被拒绝，公共页面下载继续可用。
- 信箱双向寄图、失败重试、48 小时前后的表查询与图片读取，以及直接修改/删除被拒绝。时间边界夹具只能在隔离测试库设置。
- 心愿单全部未完成加载、已完成每次 10 条、同时间游标、双向完成/取消、纯文本/单图添加与失败重试；检查其他 SVIP、降级用户和未登录者无法越权读取、上传或修改。

Cloudflare Pages 无 build 命令，输出目录为仓库根目录，不是 `dist/` 或 `build/`。项目绑定、部署分支、生产 URL 在 Dashboard 核对；部署后还需检查 Auth Site URL/Redirect URLs、Storage 访问和移动端。

## 代码约定

- HTML/CSS/JS 使用 2 空格缩进；JavaScript 使用单引号、分号、`const`/`let`、camelCase、`async/await`。
- 共享样式放在 `css/style.css`，复杂页面样式放在同名 CSS；保持原生技术栈，不为小改动增加依赖。
- 用户文本使用 `textContent` 或显式转义；异步提交时禁用按钮并恢复状态，错误向用户展示。
- 页面路径、表字段、RPC 参数、Storage 路径均为接口契约；变更时全仓检查调用点。
- 没有统一 formatter/linter，不做无关的全文件格式化。

## 已知约束与保留风险

- 用户名布尔查重仍允许逐个猜测名称，但不返回 UUID 或会员身份；尚未增加网关级限流。自定义短邀请码、注册频率和邮箱确认行为需结合实际 Auth/网关配置管理。
- 会员可读取站主资料行，用于显示交互对象；若需隐藏站主的身份或时间字段，应改用受限视图或专用 RPC。
- 未全局更改数据库默认权限、平台内部授权或未知后台依赖。新增表和 RPC 必须显式授权并审查 RLS；RLS 不约束 TRUNCATE 等整表操作，不能替代最小权限。[PostgreSQL 行级安全说明](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- `sql/private-space-schema.sql` 仅提供旧基础结构，必须配合后续私有附件和隐私加固脚本。旧单参数邀请码函数及可能存在的邮箱查重函数保留对象，但客户端执行权已撤销。
- `posts` 等遗留对象的线上状态不能仅由初始化 SQL 推断，删除或重建前须核对。历史备份也不能代表当前线上权限；结构、触发器和 Storage 策略应按同一批次完整导出。
- 本地隔离数据库及浏览器检查已覆盖功能和角色权限；邀请码真实多连接并发压力测试尚未覆盖，需在隔离 PostgreSQL 中验证，不使用生产邀请码压测。
