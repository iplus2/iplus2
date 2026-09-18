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

以下命令适用于 macOS 默认 zsh，在仓库根目录运行。隐藏输入完整连接字符串，避免把密码写进命令历史：

```zsh
umask 077
mkdir -p sql_backup
read -rs 'IPLUS_BACKUP_DB_URL?粘贴数据库连接字符串（隐藏输入）：'
printf '\n'
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f sql_backup/roles.sql --role-only
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f sql_backup/schema.sql
supabase db dump --db-url "$IPLUS_BACKUP_DB_URL" -f sql_backup/data.sql --data-only --use-copy
unset IPLUS_BACKUP_DB_URL
```

- 三份 SQL 分别保存角色、结构、数据；命令报错或文件存在不代表备份成功，应检查导出完成与文件内容。
- Auth 自定义触发器及其函数、Storage RLS 策略需另行记录，可在 SQL Editor 查询系统目录并导出 CSV。
- SQL 备份不包含图片和附件实体；Storage 文件需另行下载。恢复到其他项目还需重新核对 Auth 和服务配置。
- 文件检查不能替代隔离环境的恢复演练，不能用生产库试验恢复。
- `sql_backup/` 已被 Git 忽略，提交前可用 `git ls-files -- sql_backup memory` 确认没有被跟踪的文件；不要把备份上传到静态托管。

完整范围与恢复说明见 [Supabase 官方备份指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)。

## 数据库变更与部署

SQL 执行顺序、bucket 配置和风险见 [PROJECT.md](PROJECT.md#数据库初始化与变更)。已有项目只执行对应增量 SQL，不重跑基础初始化脚本。

Cloudflare Pages 使用仓库根目录作为输出目录，无 build 命令；项目绑定和部署分支在 Dashboard 核对。

Git 使用普通命令，不使用历史环境的硬编码推送脚本。推送前检查差异、暂存范围和敏感文件排除情况。
