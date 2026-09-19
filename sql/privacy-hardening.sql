-- 隐私与邀请码增量加固：在 private-attachments.sql 之后执行。
-- 先确认目标项目并备份；此脚本不删除用户、消息、邀请码或文件。
-- 与新版 register.js、user-profile.js 配套发布，事务失败时整体回滚。
BEGIN;

-- 保留大小写敏感的现有用户名规则；有历史重名时停止，不自动改名。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles GROUP BY username HAVING count(*) > 1) THEN
    RAISE EXCEPTION '存在重复用户名，请先核对处理，再执行加固脚本';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username);

CREATE OR REPLACE FUNCTION public.profile_can_read(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles viewer WHERE viewer.id = auth.uid()
      AND (viewer.id = p_id OR viewer.is_admin IS TRUE
        OR (viewer.user_type IN ('vip', 'svip') AND EXISTS (
          SELECT 1 FROM public.profiles target WHERE target.id = p_id AND target.is_admin IS TRUE
        )))
  );
$$;
REVOKE ALL ON FUNCTION public.profile_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_can_read(uuid) TO authenticated;

REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, username, created_at, user_type, upgraded_at, is_admin),
  UPDATE (id, username, created_at, user_type, upgraded_at, is_admin)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (public.profile_can_read(id));
DROP POLICY IF EXISTS profiles_read_guard ON public.profiles;
CREATE POLICY profiles_read_guard ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.profile_can_read(id));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_guard ON public.profiles;
CREATE POLICY profiles_update_guard ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

-- 匿名注册与改名只返回精确用户名是否已用，不返回 UUID、身份或时间。
-- 仍可用于逐个猜测用户名，限流需在网关/Auth 层处理。
CREATE OR REPLACE FUNCTION public.is_username_taken(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE username = btrim(p_username));
$$;
REVOKE ALL ON FUNCTION public.is_username_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_taken(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_vip_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current_type text;
  v_type text;
  v_code text := btrim(p_code);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '请先登录后再激活邀请码' USING ERRCODE = '42501';
  END IF;
  -- 同一用户并发使用不同邀请码时，也只能升级一次。
  SELECT user_type INTO v_current_type FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '用户资料不存在，请联系站主');
  END IF;
  IF v_current_type IN ('vip', 'svip') THEN
    RETURN jsonb_build_object('success', false, 'message', '您已经是会员，无需重复激活');
  END IF;
  -- 不同用户竞争同一码时，锁定并重新检查未使用状态。
  SELECT type INTO v_type FROM public.invite_codes WHERE code = v_code AND used IS FALSE FOR UPDATE;
  IF NOT FOUND OR v_type NOT IN ('vip', 'svip') THEN
    RETURN jsonb_build_object('success', false, 'message', '邀请码无效或已被使用');
  END IF;
  UPDATE public.profiles SET user_type = v_type, upgraded_at = now() WHERE id = v_user;
  UPDATE public.invite_codes SET used = true, used_by = v_user, used_at = now() WHERE code = v_code;
  RETURN jsonb_build_object('success', true, 'type', v_type,
    'message', CASE v_type WHEN 'vip' THEN '🎉 VIP 会员激活成功！' ELSE '🌟 SVIP 会员激活成功！' END);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_vip_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_vip_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invite_code(p_type text, p_custom_code text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_type text := lower(btrim(p_type));
  v_code text := nullif(btrim(p_custom_code), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE) THEN
    RAISE EXCEPTION '无权操作' USING ERRCODE = '42501';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('vip', 'svip') THEN RAISE EXCEPTION '会员类型无效'; END IF;
  IF v_code IS NOT NULL AND char_length(v_code) > 32 THEN RAISE EXCEPTION '邀请码不能超过 32 字符'; END IF;
  -- UUID 随机源替代 random()/短 MD5，默认邀请码长度与前端 32 字符上限兼容。
  IF v_code IS NULL THEN v_code := replace(gen_random_uuid()::text, '-', ''); END IF;
  INSERT INTO public.invite_codes (code, type) VALUES (v_code, v_type);
  RETURN v_code;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION '邀请码已存在，请换一个';
END;
$$;
REVOKE ALL ON FUNCTION public.create_invite_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite_code(text, text) TO authenticated;

-- 停用旧重载；保留对象以免破坏未知后台依赖，不授予客户端执行权。
DO $$
BEGIN
  IF to_regprocedure('public.create_invite_code(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_invite_code(text) FROM PUBLIC, anon, authenticated;
  END IF;
  -- 不新建邮箱枚举 RPC；若已有旧版本，则关闭客户端执行权。
  IF to_regprocedure('public.check_email_exists(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

REVOKE ALL ON public.invite_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invite_codes TO authenticated;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invite_codes_admin_select ON public.invite_codes;
CREATE POLICY invite_codes_admin_select ON public.invite_codes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE));
DROP POLICY IF EXISTS invite_codes_read_guard ON public.invite_codes;
CREATE POLICY invite_codes_read_guard ON public.invite_codes AS RESTRICTIVE FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE));

-- 只缩减已知无业务用途的整表权限，不更改 provider 内部对象、默认权限或未知表。
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'invite_codes', 'private_spaces', 'private_posts', 'mailbox_letters', 'wishlist_items', 'users', 'posts'] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
