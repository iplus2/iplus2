-- 个人空间私有附件增量迁移。执行前确认目标项目、备份数据库及 Storage 文件。
-- 先创建 private-attachments bucket：Private，File size limit = 20971520 bytes (20 MB)。
-- 不设置 MIME 白名单，保留图片、PDF、Office、TXT、ZIP 等原有附件类型。
-- 不迁移或删除旧公开附件；按 PROJECT.md 的旧附件迁移约束核对处理 attachments/private/。
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'private-attachments' AND public = false
      AND file_size_limit > 0 AND file_size_limit <= 20971520
  ) THEN
    RAISE EXCEPTION '请先创建私有 private-attachments bucket，并设置最大 20 MB';
  END IF;
END;
$$;

ALTER TABLE public.private_posts ADD COLUMN IF NOT EXISTS storage_bucket text;
CREATE INDEX IF NOT EXISTS private_posts_space_order ON public.private_posts (space_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS private_posts_order ON public.private_posts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS private_posts_attachment ON public.private_posts (storage_bucket, storage_path);

-- 身份只能由注册触发器、会员 RPC 和可信后台设置，客户端不能插入自选身份。
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, username, created_at, user_type, upgraded_at, is_admin),
  UPDATE (id, username, created_at, user_type, upgraded_at, is_admin)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.private_space_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin IS TRUE);
$$;
CREATE OR REPLACE FUNCTION public.private_space_has_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (is_admin IS TRUE OR user_type IN ('vip', 'svip')));
$$;
CREATE OR REPLACE FUNCTION public.private_space_can_access(p_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.private_space_has_access() AND EXISTS (
    SELECT 1 FROM public.private_spaces WHERE id = p_space_id
      AND (user_id = auth.uid() OR public.private_space_is_admin())
  );
$$;
REVOKE ALL ON FUNCTION public.private_space_is_admin(), public.private_space_has_access(),
  public.private_space_can_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_space_is_admin(), public.private_space_has_access(),
  public.private_space_can_access(uuid) TO anon, authenticated;

ALTER TABLE public.private_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_spaces, public.private_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.private_spaces, public.private_posts TO authenticated;
GRANT INSERT (user_id) ON public.private_spaces TO authenticated;
GRANT DELETE ON public.private_posts TO authenticated;
-- 客户端不能删除整个空间（否则 ON DELETE CASCADE 会连带删除站主的消息）。
DROP POLICY IF EXISTS private_spaces_delete ON public.private_spaces;
DROP POLICY IF EXISTS private_spaces_select ON public.private_spaces;
CREATE POLICY private_spaces_select ON public.private_spaces FOR SELECT TO authenticated
USING (public.private_space_has_access() AND (user_id = auth.uid() OR public.private_space_is_admin()));
DROP POLICY IF EXISTS private_spaces_insert ON public.private_spaces;
CREATE POLICY private_spaces_insert ON public.private_spaces FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.private_space_has_access());
-- 限制性策略防止其他历史宽泛策略绕过归属和当前会员身份校验。
DROP POLICY IF EXISTS private_spaces_read_guard ON public.private_spaces;
CREATE POLICY private_spaces_read_guard ON public.private_spaces AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (public.private_space_has_access() AND (user_id = auth.uid() OR public.private_space_is_admin()));
DROP POLICY IF EXISTS private_spaces_insert_guard ON public.private_spaces;
CREATE POLICY private_spaces_insert_guard ON public.private_spaces AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (user_id = auth.uid() AND public.private_space_has_access());

DROP POLICY IF EXISTS private_posts_insert ON public.private_posts;
DROP POLICY IF EXISTS private_posts_select ON public.private_posts;
CREATE POLICY private_posts_select ON public.private_posts FOR SELECT TO authenticated
USING (public.private_space_can_access(space_id));
DROP POLICY IF EXISTS private_posts_delete ON public.private_posts;
CREATE POLICY private_posts_delete ON public.private_posts FOR DELETE TO authenticated
USING (author_id = auth.uid() AND public.private_space_can_access(space_id));
DROP POLICY IF EXISTS private_posts_read_guard ON public.private_posts;
CREATE POLICY private_posts_read_guard ON public.private_posts AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (public.private_space_can_access(space_id));
DROP POLICY IF EXISTS private_posts_delete_guard ON public.private_posts;
CREATE POLICY private_posts_delete_guard ON public.private_posts AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (author_id = auth.uid() AND public.private_space_can_access(space_id));

-- 新路径为 <space UUID>/<author UUID>/<post UUID>，文件名仅作为消息元数据保存。
CREATE OR REPLACE FUNCTION public.private_attachment_is_own(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_path IS NULL OR p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$' THEN RETURN false; END IF;
  RETURN split_part(p_path, '/', 2) = auth.uid()::text
    AND public.private_space_can_access(split_part(p_path, '/', 1)::uuid);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END;
$$;
CREATE OR REPLACE FUNCTION public.private_attachment_can_read(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.private_attachment_is_own(p_path) OR EXISTS (
    SELECT 1 FROM public.private_posts WHERE storage_bucket = 'private-attachments'
      AND storage_path = p_path AND public.private_space_can_access(space_id)
  );
$$;
CREATE OR REPLACE FUNCTION public.private_attachment_can_delete(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.private_attachment_is_own(p_path) AND NOT EXISTS (
    SELECT 1 FROM public.private_posts WHERE storage_bucket = 'private-attachments' AND storage_path = p_path
  );
$$;
REVOKE ALL ON FUNCTION public.private_attachment_is_own(text), public.private_attachment_can_read(text),
  public.private_attachment_can_delete(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_attachment_is_own(text), public.private_attachment_can_read(text),
  public.private_attachment_can_delete(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_private_post(
  p_id uuid, p_space_id uuid, p_content text,
  p_storage_path text DEFAULT NULL, p_file_name text DEFAULT NULL
)
RETURNS public.private_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid := auth.uid();
  v_name text;
  v_content text := nullif(btrim(p_content), '');
  v_post public.private_posts;
  v_metadata jsonb;
BEGIN
  IF v_author IS NULL OR NOT public.private_space_can_access(p_space_id) THEN
    RAISE EXCEPTION '无权向这个空间发送消息';
  END IF;
  IF p_id IS NULL OR char_length(v_content) > 2000 OR (v_content IS NULL AND p_storage_path IS NULL) THEN
    RAISE EXCEPTION '请输入最多 2000 字的内容或添加附件';
  END IF;
  SELECT * INTO v_post FROM public.private_posts WHERE id = p_id;
  IF NOT FOUND THEN
    IF p_storage_path IS NOT NULL THEN
      IF p_storage_path <> p_space_id::text || '/' || v_author::text || '/' || p_id::text
        OR p_file_name IS NULL OR char_length(p_file_name) NOT BETWEEN 1 AND 255 THEN
        RAISE EXCEPTION '附件路径或文件名无效';
      END IF;
      SELECT metadata INTO v_metadata FROM storage.objects
        WHERE bucket_id = 'private-attachments' AND name = p_storage_path FOR SHARE;
      IF NOT FOUND OR COALESCE((v_metadata->>'size')::bigint, 0) NOT BETWEEN 1 AND 20971520 THEN
        RAISE EXCEPTION '请先上传不超过 20 MB 的附件';
      END IF;
    ELSIF p_file_name IS NOT NULL THEN
      RAISE EXCEPTION '没有附件时不能设置文件名';
    END IF;
    SELECT username INTO v_name FROM public.profiles WHERE id = v_author;
    INSERT INTO public.private_posts
      (id, space_id, author_id, author_name, content, file_name, file_type, storage_path, storage_bucket, created_at)
      VALUES (p_id, p_space_id, v_author, v_name, v_content, p_file_name, v_metadata->>'mimetype', p_storage_path,
        CASE WHEN p_storage_path IS NULL THEN NULL ELSE 'private-attachments' END, clock_timestamp())
      ON CONFLICT (id) DO NOTHING RETURNING * INTO v_post;
    IF NOT FOUND THEN SELECT * INTO v_post FROM public.private_posts WHERE id = p_id; END IF;
  END IF;
  IF v_post.author_id <> v_author OR v_post.space_id <> p_space_id
    OR v_post.content IS DISTINCT FROM v_content OR v_post.storage_path IS DISTINCT FROM p_storage_path
    OR v_post.file_name IS DISTINCT FROM p_file_name THEN
    RAISE EXCEPTION '请求已用于另一条消息，请刷新后重试';
  END IF;
  RETURN v_post;
END;
$$;
REVOKE ALL ON FUNCTION public.send_private_post(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_private_post(uuid, uuid, text, text, text) TO authenticated;

DROP POLICY IF EXISTS private_attachment_read_guard ON storage.objects;
CREATE POLICY private_attachment_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (bucket_id <> 'private-attachments' OR public.private_attachment_can_read(name));
DROP POLICY IF EXISTS private_attachment_read ON storage.objects;
CREATE POLICY private_attachment_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'private-attachments' AND public.private_attachment_can_read(name));
DROP POLICY IF EXISTS private_attachment_insert_guard ON storage.objects;
CREATE POLICY private_attachment_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (bucket_id <> 'private-attachments' OR public.private_attachment_is_own(name));
DROP POLICY IF EXISTS private_attachment_insert ON storage.objects;
CREATE POLICY private_attachment_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'private-attachments' AND public.private_attachment_is_own(name));
DROP POLICY IF EXISTS private_attachment_update_guard ON storage.objects;
CREATE POLICY private_attachment_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id <> 'private-attachments') WITH CHECK (bucket_id <> 'private-attachments');
DROP POLICY IF EXISTS private_attachment_delete_guard ON storage.objects;
CREATE POLICY private_attachment_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (bucket_id <> 'private-attachments' OR public.private_attachment_can_delete(name));
DROP POLICY IF EXISTS private_attachment_delete ON storage.objects;
CREATE POLICY private_attachment_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'private-attachments' AND public.private_attachment_can_delete(name));

-- 公共附件仍可通过原 public URL 下载；上传、覆盖和删除只允许站主。
-- 删除历史跨 bucket DELETE policy，避免其他 bucket 意外受它授权。
DROP POLICY IF EXISTS attachments_delete ON storage.objects;
DROP POLICY IF EXISTS public_attachment_insert_guard ON storage.objects;
CREATE POLICY public_attachment_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (bucket_id <> 'attachments' OR (public.private_space_is_admin() AND name NOT LIKE 'private/%'));
DROP POLICY IF EXISTS public_attachment_update_guard ON storage.objects;
CREATE POLICY public_attachment_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id <> 'attachments' OR public.private_space_is_admin())
WITH CHECK (bucket_id <> 'attachments' OR (public.private_space_is_admin() AND name NOT LIKE 'private/%'));
DROP POLICY IF EXISTS public_attachment_delete_guard ON storage.objects;
CREATE POLICY public_attachment_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (bucket_id <> 'attachments' OR public.private_space_is_admin());
DROP POLICY IF EXISTS public_attachment_admin ON storage.objects;
CREATE POLICY public_attachment_admin ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'attachments' AND public.private_space_is_admin())
WITH CHECK (bucket_id = 'attachments' AND public.private_space_is_admin());

COMMIT;
