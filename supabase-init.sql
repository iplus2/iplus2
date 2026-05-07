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
  -- 设置安全的 search_path，防止搜索路径劫持
  PERFORM pg_catalog.set_config('search_path', '', false);
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::TEXT, 6))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. 图片记录表
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 行级安全策略 (RLS)

-- profiles: 任何人可读，只能改自己
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- images: 登录用户可读所有，只能操作自己的
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images_select" ON images FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "images_insert" ON images FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "images_delete" ON images FOR DELETE USING (auth.uid() = user_id);

-- 4. Storage Bucket
-- 在 Supabase Dashboard → Storage 中手动创建名为 "images" 的 bucket
-- 并设置该 bucket 为 Public（公开读取）
-- 然后在 Storage Policies 中添加:
--   INSERT: auth.uid() IS NOT NULL (允许登录用户上传)
--   SELECT: true (公开读取)
