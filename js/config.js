// ============================================
// Supabase 配置 — 请替换为你的项目信息
// ============================================
// 1. 前往 https://supabase.com 创建项目
// 2. 在 Project Settings → API 中找到以下信息
// 3. 替换下方的占位符

const SUPABASE_URL = 'https://glumggyukihrkfrryogd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdW1nZ3l1a2locmtmcnJ5b2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjMxMzMsImV4cCI6MjA5Mjk5OTEzM30.dotVxWQzwYkNj7UFKt8pmbOwUj3H4zTw3jKSO22Ds9Q';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
