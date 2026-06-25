-- ============================================
-- 会员系统初始化（在 Supabase SQL Editor 中执行）
-- 执行顺序：1️⃣ → 2️⃣ → 3️⃣
-- ============================================

-- 1️⃣ profiles 表新增会员字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ DEFAULT NULL;

-- 2️⃣ 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('vip', 'svip')),
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ DEFAULT NULL
);

-- 3️⃣ 激活邀请码函数
CREATE OR REPLACE FUNCTION activate_vip_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ✅ 执行完成后可插入邀请码测试，例如：
-- INSERT INTO invite_codes (code, type) VALUES ('VIP001', 'vip'), ('SVIP001', 'svip');
