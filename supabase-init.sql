-- ============================================
-- Supabase 数据库初始化脚本
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 注册时自动创建 profile（触发器）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, user_type, upgraded_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::TEXT, 8)),
    'free',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_catalog, auth;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. 帖子表（复平面）
DROP TABLE IF EXISTS posts;
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 行级安全策略 (RLS)

-- profiles: 任何人可读，只能改自己
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- posts: 所有人可读，登录用户可发布/删除自己的
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_type IN ('vip', 'svip')
  )
);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (auth.uid() = user_id);

-- 4. 会员系统

-- 给 profiles 表添加用户类型字段（NULL=普通用户, vip, svip）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ DEFAULT NULL;

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('vip', 'svip')),
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ DEFAULT NULL
);

-- 邀请码 RLS: 仅服务端可操作，用户端通过函数调用
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- 5. 激活邀请码函数（SECURITY DEFINER 绕过 RLS）
CREATE OR REPLACE FUNCTION activate_vip_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog, auth'
AS $$
DECLARE
  v_type TEXT;
  v_current_type TEXT;
BEGIN
  -- 检查用户是否已经是会员
  SELECT user_type INTO v_current_type FROM public.profiles WHERE id = auth.uid();
  
  IF v_current_type IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '您已经是 ' || UPPER(v_current_type) || ' 会员，无需重复激活');
  END IF;

  -- 检查邀请码是否存在且未被使用
  SELECT type INTO v_type FROM public.invite_codes WHERE code = p_code AND used = FALSE;
  
  IF v_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '邀请码无效或已被使用');
  END IF;
  
  -- 更新用户类型
  UPDATE public.profiles SET user_type = v_type, upgraded_at = NOW() WHERE id = auth.uid();
  
  -- 标记邀请码已使用
  UPDATE public.invite_codes SET used = TRUE, used_by = auth.uid(), used_at = NOW()
  WHERE code = p_code;
  
  RETURN jsonb_build_object(
    'success', true,
    'type', v_type,
    'message', CASE v_type WHEN 'vip' THEN '🎉 VIP 会员激活成功！' ELSE '🌟 SVIP 会员激活成功！' END
  );
END;
$$;

-- 6. Storage Bucket
-- 在 Supabase Dashboard → Storage 中手动创建名为 "attachments" 的 bucket
-- 并设置该 bucket 为 Public（公开读取）
-- 然后在 Storage Policies 中添加:
--   INSERT: auth.uid() IS NOT NULL (允许登录用户上传)
--   SELECT: true (公开读取)
