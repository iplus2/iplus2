-- 信箱增量 SQL：在已有项目执行，不要重跑 supabase-init.sql。
-- 先在 Storage 创建 mailbox-photos：Private，大小上限 10485760 bytes，
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif。
-- 请先确认目标项目并备份；本脚本不修改或删除现有消息/附件。
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'mailbox-photos' AND public = FALSE
      AND file_size_limit > 0 AND file_size_limit <= 10485760
      AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
      AND allowed_mime_types <@ ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ) THEN
    RAISE EXCEPTION '请先按脚本顶部说明创建私有 mailbox-photos bucket 并设置大小和 MIME 限制';
  END IF;
END;
$$;

-- profiles 的行级 UPDATE policy 不能防止用户给自己提权。
-- 普通客户端只允许修改用户名；会员升级 RPC 和可信后台仍可修改权限字段。
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, username, created_at, user_type, upgraded_at, is_admin)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.mailbox_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  storage_path text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL,
  deliver_at timestamptz NOT NULL,
  CHECK (sender_id <> recipient_id),
  CHECK (deliver_at = sent_at + INTERVAL '48 hours')
);
CREATE INDEX IF NOT EXISTS mailbox_letters_sender_order
  ON public.mailbox_letters (sender_id, sent_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS mailbox_letters_recipient_order
  ON public.mailbox_letters (recipient_id, sent_at DESC, id DESC);
ALTER TABLE public.mailbox_letters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mailbox_letters FROM PUBLIC, anon, authenticated;
-- anon 只有查询权限、没有可用 RLS policy（结果为空），供 Storage guard 安全执行子查询。
GRANT SELECT ON public.mailbox_letters TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mailbox_has_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_admin IS TRUE OR user_type = 'svip')
  );
$$;
REVOKE ALL ON FUNCTION public.mailbox_has_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mailbox_has_access() TO anon, authenticated;

DROP POLICY IF EXISTS mailbox_letters_read ON public.mailbox_letters;
CREATE POLICY mailbox_letters_read ON public.mailbox_letters FOR SELECT TO authenticated
USING (
  public.mailbox_has_access()
  AND (sender_id = auth.uid() OR (recipient_id = auth.uid() AND deliver_at <= now()))
);
-- 没有客户端 INSERT/UPDATE/DELETE 权限或 policy；站主使用相同限制。

CREATE OR REPLACE FUNCTION public.send_mailbox_photo(p_recipient_id uuid, p_storage_path text)
RETURNS public.mailbox_letters
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_letter public.mailbox_letters;
  v_metadata jsonb;
  v_sent_at timestamptz;
BEGIN
  IF v_sender IS NULL OR NOT public.mailbox_has_access() THEN
    RAISE EXCEPTION '信箱仅对站主和 SVIP 开放';
  END IF;

  -- 同一照片重复确认只返回原信件，网络重试不会重复寄出或重新计时。
  SELECT * INTO v_letter FROM public.mailbox_letters WHERE storage_path = p_storage_path;
  IF FOUND THEN
    IF v_letter.sender_id <> v_sender OR v_letter.recipient_id <> p_recipient_id THEN
      RAISE EXCEPTION '这张照片已经寄出，不能更换收件人';
    END IF;
    RETURN v_letter;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles sender CROSS JOIN public.profiles recipient
    WHERE sender.id = v_sender AND recipient.id = p_recipient_id AND sender.id <> recipient.id
      AND ((sender.is_admin IS TRUE AND recipient.is_admin IS NOT TRUE AND recipient.user_type = 'svip')
        OR (sender.is_admin IS NOT TRUE AND sender.user_type = 'svip' AND recipient.is_admin IS TRUE))
  ) THEN
    RAISE EXCEPTION '只能在站主与 SVIP 用户之间寄送照片';
  END IF;

  IF p_storage_path IS NULL OR p_storage_path !~ (
    '^' || v_sender::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  ) THEN
    RAISE EXCEPTION '照片路径无效';
  END IF;

  -- 只引用真实上传到私有 bucket 的图片；时间和身份不接受客户端输入。
  SELECT metadata INTO v_metadata FROM storage.objects
    WHERE bucket_id = 'mailbox-photos' AND name = p_storage_path
    FOR SHARE;
  IF NOT FOUND OR v_metadata->>'mimetype' IS NULL
    OR v_metadata->>'mimetype' NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
    OR COALESCE((v_metadata->>'size')::bigint, 0) NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION '请先上传一张不超过 10 MB 的 JPG、PNG、WebP 或 GIF 图片';
  END IF;

  v_sent_at := clock_timestamp();
  INSERT INTO public.mailbox_letters (sender_id, recipient_id, storage_path, sent_at, deliver_at)
    VALUES (v_sender, p_recipient_id, p_storage_path, v_sent_at, v_sent_at + INTERVAL '48 hours')
    ON CONFLICT (storage_path) DO NOTHING RETURNING * INTO v_letter;
  IF NOT FOUND THEN
    SELECT * INTO v_letter FROM public.mailbox_letters WHERE storage_path = p_storage_path;
    IF v_letter.sender_id <> v_sender OR v_letter.recipient_id <> p_recipient_id THEN
      RAISE EXCEPTION '这张照片已经寄出，不能更换收件人';
    END IF;
  END IF;
  RETURN v_letter;
END;
$$;
REVOKE ALL ON FUNCTION public.send_mailbox_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_mailbox_photo(uuid, text) TO authenticated;

-- 兼容项目可能已有的宽泛 Storage policies：限制性策略与旧策略 AND 组合，
-- 防止旧的 SELECT true / INSERT authenticated / DELETE owner 放开信箱权限。
-- 其他 bucket 的行为不变。信箱文件禁止覆盖、移动、删除，未投递文件也不例外。
DROP POLICY IF EXISTS mailbox_storage_read_guard ON storage.objects;
CREATE POLICY mailbox_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (
  bucket_id <> 'mailbox-photos' OR EXISTS (
    SELECT 1 FROM public.mailbox_letters letter WHERE letter.storage_path = name
  )
);
DROP POLICY IF EXISTS mailbox_storage_read ON storage.objects;
CREATE POLICY mailbox_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mailbox-photos' AND EXISTS (
    SELECT 1 FROM public.mailbox_letters letter WHERE letter.storage_path = name
  )
);

DROP POLICY IF EXISTS mailbox_storage_upload_guard ON storage.objects;
CREATE POLICY mailbox_storage_upload_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (
  bucket_id <> 'mailbox-photos' OR (
    public.mailbox_has_access()
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
    -- 上传预检阶段不一定有完整 metadata；MIME/大小由 bucket 和寄送 RPC 检查。
  )
);
DROP POLICY IF EXISTS mailbox_storage_upload ON storage.objects;
CREATE POLICY mailbox_storage_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mailbox-photos' AND public.mailbox_has_access());

DROP POLICY IF EXISTS mailbox_storage_no_update ON storage.objects;
CREATE POLICY mailbox_storage_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id <> 'mailbox-photos') WITH CHECK (bucket_id <> 'mailbox-photos');
DROP POLICY IF EXISTS mailbox_storage_no_delete ON storage.objects;
CREATE POLICY mailbox_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (bucket_id <> 'mailbox-photos');

COMMIT;
