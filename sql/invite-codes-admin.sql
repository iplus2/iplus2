-- ============================================
-- 邀请码管理 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 把 invite_codes 的 used 字段名统一（表里叫 is_used，函数里用 used）
ALTER TABLE invite_codes DROP COLUMN IF EXISTS used;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE;

-- 2. 新增 type 字段（每条邀请码指定是 vip 还是 svip）
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'vip';

-- 3. 创建邀请码生成函数（仅管理员可调用）
CREATE OR REPLACE FUNCTION create_invite_code(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_catalog, auth'
AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- 仅管理员可生成
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RAISE EXCEPTION '无权操作';
  END IF;

  -- 生成 8 位随机邀请码
  v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  INSERT INTO public.invite_codes (code, type, created_by)
  VALUES (v_code, p_type, auth.uid());

  RETURN v_code;
END;
$$;

-- 4. 创建管理员专属邀请码管理页面（HTML + 内联 JS）
-- 该页面仅 is_admin = TRUE 的用户可访问
