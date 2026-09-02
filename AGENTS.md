# AGENTS.md - iplus2 项目协作说明

本文件是 Codex/自动化开发代理进入仓库后的首要说明。项目事实以源码、SQL 和 `PROJECT.md` 为准；文档与代码冲突时，先核对代码，再同步修正文档。

## 会话启动

开始任何任务前按顺序读取：

1. `SOUL.md`：协作角色与技术取向。
2. `USER.md`：用户背景与长期偏好。
3. `PROJECT.md`：当前架构、目录职责、数据契约、命令和维护注意事项。
4. 与任务直接相关的 HTML、JS、CSS 或 SQL；不能只依据文档推断实现。

不要在会话启动时自动读取 `memory/` 中的短期记忆，包括今天和昨天的文件。只有 Luka 明确要求读取时，才读取其指定的 memory 文件。

## 项目定位

- 这是一个部署到静态托管平台的多页网站，不是 SPA，也没有前端框架或构建流水线。
- 浏览器直接运行根目录 HTML、`css/style.css` 和经典脚本 `js/*.js`。
- Supabase 提供 Auth、Postgres/RLS、RPC 和 Storage；前端只允许使用公开 URL 与 anon/publishable key。
- Luka 当前使用底特律时区，常用时区为上海；所有项目相关日期和时间统一以 `Asia/Shanghai` 展示和解释。
- 详细页面、模块和数据库说明见 `PROJECT.md`。

## 必须遵守的红线

- 禁止在 Markdown、日志、提交消息或前端代码中加入 `service_role` key、数据库密码、访问令牌等 secret。
- 不要在文档中复制 anon key 的具体值；只记录配置位置和用途。
- `.env` 文件不得提交。当前项目没有环境变量注入机制，不能假设 `.env` 会自动生效。
- 不得未经确认删除或修改生产数据，也不得直接在生产库试跑具有破坏性的 SQL。
- `supabase-init.sql` 包含 `DROP TABLE IF EXISTS posts`；执行前必须确认目标环境并备份数据。
- 数据访问控制必须落在 Supabase RLS/RPC，不能只依赖前端隐藏按钮或页面跳转。
- 不要把管理员 UUID、会员状态或其他客户端常量当成授权依据；权威来源是 `profiles` 和 RLS。

## 修改代码的工作方式

1. 先检查 `git status --short`，保留用户已有改动。
2. 阅读入口页面及其实际 `<script>` 顺序，并追踪相关表、RPC、Storage bucket 和 RLS。
3. 保持原生 HTML/CSS/JavaScript 与经典全局脚本架构，除非任务明确要求迁移技术栈。
4. 公共行为优先放入 `js/`，公共样式优先放入 `css/style.css`；修改共享 header 时检查所有页面的重复 markup。
5. 改动数据库契约时同步检查 SQL、调用端、RLS、Storage policy 和 `PROJECT.md`。
6. 至少执行与改动相称的本地检查；完整命令与手工场景见 `PROJECT.md`。
7. 部署前确认移动端布局、登录/未登录状态、权限边界和生产 URL。

## 文档维护

- `PROJECT.md` 只记录跨任务稳定、可由仓库验证的信息。
- `MEMORY.md` 保存少量长期决策和历史背景，不保存凭据、一次性 TODO 或容易过期的部署状态。
- `memory/YYYY-MM-DD.md` 可记录短期进展，但不得记录 secret。
- 修复 `PROJECT.md`“已知约束”中的事项后，应在同一改动中删掉或更新对应条目。
- agent 不能单方面认定任务已关闭。只有 Luka 与 agent 明确确认最终测试完成、任务结束后，才执行最终文档收尾。
- 文档收尾时检查所有受影响的 Markdown（至少包括 `AGENTS.md`、`PROJECT.md`、`MEMORY.md`、`USER.md`、`TOOLS.md`），更新其中需要长期保留的内容；无变化的文件不为凑数修改。
- 最终文档只记录长期有效的架构、约定、命令、决策和风险，不记录本次任务的临时过程。
