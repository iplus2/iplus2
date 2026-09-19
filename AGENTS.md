# AGENTS.md - iplus2 协作规则

## 会话启动

开始任务前依次读取 `SOUL.md`、`USER.md`、`PROJECT.md`，再阅读相关 HTML、JS、CSS 和 SQL。实现以源码为准，文档不一致时先核实再修正。

不要自动读取 `memory/`；只有 Luka 明确要求时，才读取其指定的短期记忆文件。

## 不可违反的约束

- 保持原生 HTML/CSS/JavaScript 多页架构，除非任务明确要求迁移技术栈。
- 项目日期和时间统一按 `Asia/Shanghai` 展示和解释，具体规则见 `PROJECT.md`。
- 禁止在前端、Markdown、日志或提交消息中写入数据库密码、访问令牌、service_role key 等 secret；不要在文档中复制 anon key 的具体值。
- `.env`、`sql_backup/` 和 `memory/` 不得提交；根目录 `MEMORY.md` 是可跟踪的长期文档。忽略规则不会自动移除已跟踪文件。
- 不得未经确认修改或删除生产数据。数据库变更先确认目标环境并备份；`supabase-init.sql` 含 `DROP TABLE IF EXISTS posts`，不能当作增量迁移。
- 权限必须由 RLS/RPC 保证，以 `profiles` 为身份来源，不能只依赖前端按钮、跳转或固定 UUID。

## 工作流程

1. 检查 `git status --short`，保留用户已有改动。
2. 阅读入口页面的实际脚本顺序，追踪涉及的表、RPC、bucket 和 policies。
3. 共享行为优先放入 `js/`，共享样式优先放入 `css/style.css`；修改公共组件时检查所有页面。
4. 数据契约变更同步检查调用端、SQL、RLS、Storage policy 和 `PROJECT.md`。
5. 执行与改动相称的检查，命令见 `TOOLS.md`；浏览器回归与部署要求见 `PROJECT.md`。
6. 提交前确认文件范围及敏感文件排除情况；不得把备份数据写入代码或文档。

## 文档维护

- `PROJECT.md`：架构、模块、数据契约和已知风险的唯一详细说明；修复已知约束时同步更新对应条目。
- `TOOLS.md`：长期复用的本地命令、备份和部署操作；不保留单次任务步骤或验收状态，项目专属契约与迁移约束归入 `PROJECT.md`。
- `MEMORY.md`：少量长期决策与历史背景，不重复当前功能清单，不写一次性 TODO 或部署状态。
- `USER.md`：用户背景与长期偏好；`SOUL.md`：协作角色与技术取向。
- 最终文档收尾须在 Luka 与 agent 明确确认验收完成、任务结束后进行，不能由 agent 单方面关闭任务。
- 收尾至少检查 `AGENTS.md`、`PROJECT.md`、`MEMORY.md`、`USER.md`、`TOOLS.md`，只更新需要长期保留的内容；无变化的文件不为凑数修改。
