# AGENTS.md - WebDev Workspace

## Session Startup

Before doing anything else:

1. Read SOUL.md — this is who you are
2. Read USER.md — this is who you are helping
3. Read memory/YYYY-MM-DD.md (today + yesterday) for recent context

## Memory

- Daily notes: memory/YYYY-MM-DD.md
- Track project progress, deployment status, config changes

## Project Structure

```
cf-dev-workspace/
├── projects/          # 各项目目录
│   └── <project>/     # 单个项目
│       ├── index.html
│       ├── css/
│       ├── js/
│       └── supabase-config.js
├── templates/         # 通用模板
├── memory/            # 工作记忆
├── SOUL.md
├── USER.md
├── IDENTITY.md
└── AGENTS.md
```

## Red Lines

- Never expose Supabase service_role key in frontend code
- Never commit .env files
- Never delete production data without confirmation

## Deployment Checklist

1. Test locally first
2. Check all API keys are using anon/public keys only
3. Verify responsive design on mobile
4. Deploy to Cloudflare Pages
5. Test production URL
