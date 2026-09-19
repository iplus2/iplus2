# TOOLS.md - 操作速查

## 本地运行与检查

在仓库根目录运行：

```bash
python3 -m http.server 8000
```

浏览器访问 `http://localhost:8000/`，不要通过 `file://` 打开页面。

```bash
for file in js/*.js; do node --check "$file" || exit 1; done
git diff --check
git status --short
```

浏览器回归范围见 [PROJECT.md](PROJECT.md#检查与部署)。仓库没有 `npm test`、lint 或 build 命令。

## 数据库备份

Supabase CLI 的 `db dump` 需要 Docker 引擎运行。macOS 的 Docker CLI 若安装在用户目录，可在当前终端补充路径：

```bash
export PATH="$HOME/.docker/bin:$PATH"
docker version
supabase --version
```

在 Supabase 项目的 **Connect → Connection String → Session pooler** 复制 URI，使用端口 5432；直接连接可能受 IPv6 网络限制。密码中的 URI 特殊字符需百分号编码。

以下命令适用于 macOS 默认 zsh，在仓库根目录运行。每次建立带上海时间和随机后缀的独立目录，保留历史备份；连接字符串隐藏输入：

```zsh
umask 077
mkdir -p sql_backup
IPLUS_BACKUP_DIR=$(mktemp -d "sql_backup/$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)-XXXXXX")
printf '备份目录：%s\n' "$IPLUS_BACKUP_DIR"
read -rs 'IPLUS_BACKUP_DB_URL?粘贴数据库连接字符串（隐藏输入）：'
printf '\n'
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f "$IPLUS_BACKUP_DIR/roles.sql" --role-only
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f "$IPLUS_BACKUP_DIR/schema.sql"
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f "$IPLUS_BACKUP_DIR/data.sql" --data-only --use-copy
unset IPLUS_BACKUP_DB_URL IPLUS_BACKUP_DIR
```

- 三份 SQL 分别保存角色、结构、数据；命令报错或文件存在不代表备份成功，应检查导出完成与文件内容。
- Auth 自定义触发器及其函数、Storage RLS 策略需另行记录，使用下方查询并导出 CSV。
- SQL 备份不包含图片和附件实体；Storage 文件需另行下载。恢复到其他项目还需重新核对 Auth 和服务配置。
- 文件检查不能替代隔离环境的恢复演练，不能用生产库试验恢复。
- `sql_backup/` 已被 Git 忽略，提交前可用 `git ls-files -- sql_backup memory` 确认没有被跟踪的文件；不要把备份上传到静态托管。

完整范围与恢复说明见 [Supabase 官方备份指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)。

### 补充导出 Auth triggers 与 Storage policies

在目标项目的 **SQL Editor** 中分别执行下面两条只读查询，将各自结果导出为 CSV，与同一批次的三份 SQL 一起保存在同一备份子目录。导出后检查结果未被行数限制截断，且多行定义完整保留。

**1. Auth 表上的非内部 trigger 及其调用函数**

导出为 `auth_triggers.csv`，包含 `auth` schema 的非内部触发器、函数定义和启用状态。恢复时区分自定义与平台维护的触发器，不能整批覆盖。

```sql
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_state,
  pg_get_triggerdef(t.oid, false) || ';' AS trigger_sql,
  fn.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_arguments,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.proacl AS function_acl,
  pg_get_functiondef(p.oid) AS function_sql
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS fn ON fn.oid = p.pronamespace
WHERE n.nspname = 'auth'
  AND NOT t.tgisinternal
ORDER BY n.nspname, c.relname, t.tgname;
```

`enabled_state`：`O` 为正常启用，`D` 为禁用，`R` 为仅复制模式启用，`A` 为始终启用。恢复时先核对并恢复自定义函数，再创建触发器，另行核对启用状态、函数所有者及授权；`trigger_sql` 本身不包含这些设置，也不会自动备份函数依赖的其他对象。

**2. Storage bucket 相关 RLS policies**

导出为 `storage_policies.csv`。bucket 的文件权限通常定义在 `storage.objects` 上，通过条件中的 `bucket_id` 区分；因此查询整个 `storage` schema，不按 bucket 名过滤，以保留跨 bucket 的通用策略及限制性策略。

```sql
SELECT
  schemaname AS table_schema,
  tablename AS table_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS check_expression,
  format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
    policyname,
    schemaname,
    tablename,
    permissive,
    cmd,
    (SELECT string_agg(quote_ident(role_name::text), ', ' ORDER BY role_name)
     FROM unnest(roles) AS policy_roles(role_name)),
    CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
    CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END
  ) AS policy_sql
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;
```

`policy_sql` 是供恢复时审查的建策略语句，已有同名策略时不能直接重复执行。策略引用的自定义函数、表和角色需要先恢复，并核对表的 RLS 开关及授权。此导出不包含 bucket 配置或图片实体；同时记录各 bucket 的 Public/Private、大小限制和 MIME 限制，并按前述说明另存 Storage 文件。

## 数据库变更与部署

SQL 执行顺序、bucket 配置和风险见 [PROJECT.md](PROJECT.md#数据库初始化与变更)。已有项目只执行对应增量 SQL，不重跑基础初始化脚本。

Cloudflare Pages 使用仓库根目录作为输出目录，无 build 命令；项目绑定和部署分支在 Dashboard 核对。

提交前用 `git diff --cached --stat`、`git diff --cached --check` 检查暂存范围和格式，并确认 `.env`、`sql_backup/`、`memory/` 未被跟踪。使用普通 Git 命令推送到已核对的远端与分支；推送成功不等于 Cloudflare 已完成部署。
