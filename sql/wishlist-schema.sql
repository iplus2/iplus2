-- 心愿单增量 SQL。执行前确认目标项目并备份，不要重跑 supabase-init.sql。
-- 先在 Storage 创建 wishlist-photos：Private，最大 10485760 bytes，
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif。
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'wishlist-photos' AND public = FALSE
      AND file_size_limit > 0 AND file_size_limit <= 10485760
      AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
      AND allowed_mime_types <@ ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ) THEN
    RAISE EXCEPTION '请先创建私有 wishlist-photos bucket 并设置脚本顶部指定的大小和 MIME 限制';
  END IF;
END;
$$;

-- 防止绕过 profiles 的行级策略自助提权；与信箱的列权限保持一致。
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, username, created_at, user_type, upgraded_at, is_admin)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
  storage_path text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_completed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS wishlist_items_owner_order
  ON public.wishlist_items (owner_id, is_completed, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS wishlist_items_status_order
  ON public.wishlist_items (is_completed, created_at DESC, id DESC);
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wishlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wishlist_items TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.wishlist_has_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_admin IS TRUE OR user_type = 'svip')
  );
$$;
CREATE OR REPLACE FUNCTION public.wishlist_can_access(p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (is_admin IS TRUE OR (user_type = 'svip' AND id = p_owner_id))
  );
$$;
REVOKE ALL ON FUNCTION public.wishlist_has_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wishlist_can_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wishlist_has_access() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wishlist_can_access(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS wishlist_items_read ON public.wishlist_items;
CREATE POLICY wishlist_items_read ON public.wishlist_items FOR SELECT TO authenticated
USING (public.wishlist_can_access(owner_id));

-- 只允许 RPC 创建、设置完成状态；不能伪造作者、时间或改写内容及归属。
CREATE OR REPLACE FUNCTION public.create_wishlist_item(
  p_id uuid, p_owner_id uuid, p_content text, p_storage_path text DEFAULT NULL
)
RETURNS public.wishlist_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid := auth.uid();
  v_item public.wishlist_items;
  v_metadata jsonb;
BEGIN
  IF v_author IS NULL OR NOT public.wishlist_can_access(p_owner_id) THEN
    RAISE EXCEPTION '无权向这份心愿单添加心愿';
  END IF;
  IF p_id IS NULL OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION '请输入 1 至 2000 字的心愿';
  END IF;

  -- 固定请求 ID 使响应丢失后的重试幂等，纯文本心愿同样不会重复添加。
  SELECT * INTO v_item FROM public.wishlist_items WHERE id = p_id;
  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = p_owner_id
        AND user_type = 'svip' AND is_admin IS NOT TRUE
    ) THEN
      RAISE EXCEPTION '请选择要共享心愿的 SVIP 用户';
    END IF;

    IF p_storage_path IS NOT NULL THEN
      IF p_storage_path !~ ('^' || v_author::text || '/' || p_id::text || '\.(jpg|png|webp|gif)$') THEN
        RAISE EXCEPTION '图片路径无效';
      END IF;
      SELECT metadata INTO v_metadata FROM storage.objects
        WHERE bucket_id = 'wishlist-photos' AND name = p_storage_path FOR SHARE;
      IF NOT FOUND OR v_metadata->>'mimetype' IS NULL
        OR v_metadata->>'mimetype' NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
        OR COALESCE((v_metadata->>'size')::bigint, 0) NOT BETWEEN 1 AND 10485760 THEN
        RAISE EXCEPTION '请先上传一张不超过 10 MB 的 JPG、PNG、WebP 或 GIF 图片';
      END IF;
    END IF;

    INSERT INTO public.wishlist_items (id, owner_id, author_id, content, storage_path)
      VALUES (p_id, p_owner_id, v_author, btrim(p_content), p_storage_path)
      ON CONFLICT (id) DO NOTHING RETURNING * INTO v_item;
    IF NOT FOUND THEN
      SELECT * INTO v_item FROM public.wishlist_items WHERE id = p_id;
    END IF;
  END IF;
  IF v_item.author_id <> v_author OR v_item.owner_id <> p_owner_id
    OR v_item.content <> btrim(p_content) OR v_item.storage_path IS DISTINCT FROM p_storage_path THEN
    RAISE EXCEPTION '该请求已用于另一条心愿，请刷新后重试';
  END IF;
  RETURN v_item;
END;
$$;
REVOKE ALL ON FUNCTION public.create_wishlist_item(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_wishlist_item(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_wishlist_completed(p_id uuid, p_completed boolean)
RETURNS public.wishlist_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.wishlist_items;
BEGIN
  IF p_completed IS NULL THEN RAISE EXCEPTION '请选择完成状态'; END IF;
  UPDATE public.wishlist_items SET is_completed = p_completed
    WHERE id = p_id AND public.wishlist_can_access(owner_id)
    RETURNING * INTO v_item;
  IF NOT FOUND THEN RAISE EXCEPTION '心愿不存在或无权修改'; END IF;
  RETURN v_item;
END;
$$;
REVOKE ALL ON FUNCTION public.set_wishlist_completed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_wishlist_completed(uuid, boolean) TO authenticated;

-- 限制性策略防止历史宽泛 policies 放开私有心愿图片，其他 bucket 不受影响。
DROP POLICY IF EXISTS wishlist_storage_read_guard ON storage.objects;
CREATE POLICY wishlist_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (
  bucket_id <> 'wishlist-photos' OR EXISTS (
    SELECT 1 FROM public.wishlist_items item WHERE item.storage_path = name
  )
);
DROP POLICY IF EXISTS wishlist_storage_read ON storage.objects;
CREATE POLICY wishlist_storage_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'wishlist-photos' AND EXISTS (
    SELECT 1 FROM public.wishlist_items item WHERE item.storage_path = name
  )
);
DROP POLICY IF EXISTS wishlist_storage_upload_guard ON storage.objects;
CREATE POLICY wishlist_storage_upload_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (
  bucket_id <> 'wishlist-photos' OR (
    public.wishlist_has_access()
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
  )
);
DROP POLICY IF EXISTS wishlist_storage_upload ON storage.objects;
CREATE POLICY wishlist_storage_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wishlist-photos' AND public.wishlist_has_access());
DROP POLICY IF EXISTS wishlist_storage_no_update ON storage.objects;
CREATE POLICY wishlist_storage_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id <> 'wishlist-photos') WITH CHECK (bucket_id <> 'wishlist-photos');
DROP POLICY IF EXISTS wishlist_storage_no_delete ON storage.objects;
CREATE POLICY wishlist_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (bucket_id <> 'wishlist-photos');

COMMIT;
