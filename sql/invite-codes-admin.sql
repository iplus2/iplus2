-- ============================================
-- 邀请码管理 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 邀请码生成函数（支持自定义码，仅管理员可用）
-- 参数 p_type: 'vip' 或 'svip'
-- 参数 p_custom_code: 可选，自定义邀请码（不填则自动生成8位随机码）
CREATE OR REPLACE FUNCTION create_invite_code(p_type TEXT, p_custom_code TEXT DEFAULT NULL)
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

  -- 决定码内容
  IF p_custom_code IS NOT NULL AND length(trim(p_custom_code)) > 0 THEN
    v_code := trim(p_custom_code);
  ELSE
    v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  END IF;

  -- 检查码是否重复
  IF EXISTS (SELECT 1 FROM public.invite_codes WHERE code = v_code) THEN
    RAISE EXCEPTION '邀请码已存在，请换一个';
  END IF;

  INSERT INTO public.invite_codes (code, type)
  VALUES (v_code, lower(p_type));

  RETURN v_code;
END;
$$;
