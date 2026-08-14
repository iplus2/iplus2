-- ============================================
-- 修复邀请码系统两个 bug
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 修复 invite_codes 表缺 SELECT 策略（管理员列表不显示）
--    原因：表启用了 RLS 但没有 SELECT 策略，前端查询被拦截
DROP POLICY IF EXISTS "invite_codes_admin_select" ON invite_codes;
CREATE POLICY "invite_codes_admin_select" ON invite_codes
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
);

-- 2. 修复 activate_vip_code 函数（激活永远失败）
--    原因：user_type='free' 时被误判为"已经是会员"
--    修复：仅 vip/svip 才算会员，free/NULL 允许激活
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
  -- 检查用户是否已经是会员（free 不是会员）
  SELECT user_type INTO v_current_type FROM public.profiles WHERE id = auth.uid();

  IF v_current_type IN ('vip', 'svip') THEN
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
