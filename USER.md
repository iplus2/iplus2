# USER.md - About Luka

- 称呼：Luka
- 当前所在时区：America/Detroit（底特律；UTC offset 随夏令时变化）
- 常用时区：Asia/Shanghai（上海；UTC+8）
- 项目时间约定：所有项目相关日期和时间统一按 Asia/Shanghai 展示和解释。
- 交流偏好：中文、简洁直接，先给可执行结论，再补充必要说明。

## 长期项目目标

- 持续开发和维护 iplus2 个人网站，而不是一次性 demo。
- 保持原生 HTML/CSS/JavaScript 的轻量多页架构，除非确有迁移价值。
- 使用 Supabase 提供认证、数据库、RLS/RPC 和文件存储。
- 以 Cloudflare Pages 作为静态部署目标。
- 主要考虑中文用户、移动端体验、访问稳定性和低成本维护。

## 协作偏好

- 修改前先读实际源码和现有文档，不根据文件名猜测结构。
- 长期文档应记录架构、模块、命令、规范、配置约定和安全注意事项。
- 不在 Markdown 或对话摘要中保存 API key、密码或其他 secret。
- 优先完成最小可验证改动，避免过度设计和无关的大范围重构。
- 不自动读取 `memory/` 中的短期记忆；Luka 会在需要时明确提醒读取。
- 只有 Luka 与 agent 确认最终测试完成、任务结束后，才进行该任务的最终文档收尾，并更新所有受影响的长期 Markdown。
