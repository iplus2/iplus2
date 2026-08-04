-- ============================================
-- 专属空间 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 给 profiles 添加 is_admin 字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. 专属空间表（admin 和 svip 用户配对）
CREATE TABLE IF NOT EXISTS private_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 3. 私信帖子表
CREATE TABLE IF NOT EXISTS private_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS 策略
ALTER TABLE private_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_posts ENABLE ROW LEVEL SECURITY;

-- private_spaces: 只有 admin 或该 space 的 user 可以查看
CREATE POLICY "private_spaces_select" ON private_spaces FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE
  )
  OR auth.uid() = user_id
);

-- private_spaces: admin 或 VIP/SVIP 用户可以插入（创建自己的 space）
CREATE POLICY "private_spaces_insert" ON private_spaces FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type IN ('vip', 'svip'))
);

-- private_spaces: admin 或该用户可以删除自己的 space
CREATE POLICY "private_spaces_delete" ON private_spaces FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  OR auth.uid() = user_id
);

-- private_posts: admin 或该 space 的 user 可以查看
CREATE POLICY "private_posts_select" ON private_posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  OR EXISTS (
    SELECT 1 FROM private_spaces ps
    WHERE ps.id = space_id AND ps.user_id = auth.uid()
  )
);

-- private_posts: admin 或 space 的 user 可以发布
CREATE POLICY "private_posts_insert" ON private_posts FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM private_spaces WHERE id = space_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
);

-- private_posts: 只有发布者可以删除
CREATE POLICY "private_posts_delete" ON private_posts FOR DELETE USING (
  author_id = auth.uid()
);

-- ============================================
-- Storage DELETE 策略（attachments bucket）
-- 在 Supabase Dashboard → Storage → attachments bucket → Policies 添加：
-- CREATE POLICY "attachments_delete" ON storage.objects FOR DELETE
-- USING (auth.uid()::text = (storage.foldername(name))[1]);
-- 这样只有上传者才能删除自己上传的附件。
-- ============================================
