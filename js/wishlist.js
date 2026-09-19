(() => {
  const bucket = 'wishlist-photos';
  const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const columns = 'id, owner_id, author_id, content, storage_path, created_at, is_completed, author:profiles!wishlist_items_author_id_fkey(username), owner:profiles!wishlist_items_owner_id_fkey(username)';
  const el = id => document.getElementById(`wishlist-${id}`);
  const items = new Map();
  const photos = new Map();
  let userId = null;
  let isAdmin = false;
  let busy = false;
  let ready = false;
  let cursor = null;
  let hasMore = true;
  let previewUrl = null;
  let pending = null;
  let canCompose = true;

  function message(id, text, error = false) {
    el(id).textContent = text;
    el(id).classList.toggle('wishlist-error', error);
  }

  function setBusy(value) {
    busy = value;
    el('fields').disabled = value || !!pending || !canCompose;
    el('send').disabled = value || (!canCompose && !pending);
    el('send').textContent = pending ? '重试确认添加' : '添加心愿';
    el('refresh').disabled = value;
    el('more').disabled = value;
    el('feed').querySelectorAll('[data-toggle]').forEach(button => { button.disabled = value; });
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    el('preview').removeAttribute('src');
    el('preview').hidden = true;
    el('remove-photo').hidden = true;
  }

  function clearPhotos() {
    photos.forEach(url => URL.revokeObjectURL(url));
    photos.clear();
  }

  function savePending() {
    try {
      const key = `wishlist-pending:${userId}`;
      if (pending) sessionStorage.setItem(key, JSON.stringify(pending));
      else sessionStorage.removeItem(key);
    } catch (error) {
      // 同一页面仍可重试；浏览器禁用 sessionStorage 时不影响正常添加。
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        message('status', '请先登录后再打开心愿单。');
        return;
      }
      userId = session.user.id;
      const { data: profile, error } = await supabase.from('profiles')
        .select('user_type, is_admin').eq('id', userId).single();
      if (error) throw error;
      if (!profile || (!profile.is_admin && profile.user_type !== 'svip')) {
        message('status', '心愿单仅对站主和 SVIP 用户开放。');
        return;
      }
      isAdmin = profile.is_admin === true;
      if (isAdmin) {
        const { data: owners, error: ownersError } = await supabase.from('profiles')
          .select('id, username').eq('user_type', 'svip')
          .or('is_admin.is.null,is_admin.eq.false').order('username');
        if (ownersError) throw ownersError;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = owners.length ? '请选择 SVIP 用户' : '暂无 SVIP 用户';
        el('owner').appendChild(placeholder);
        for (const owner of owners) {
          const option = document.createElement('option');
          option.value = owner.id;
          option.textContent = owner.username;
          el('owner').appendChild(option);
        }
        if (owners.length === 1) el('owner').value = owners[0].id;
        canCompose = owners.length > 0;
        el('owner-wrap').hidden = false;
        el('owner').required = true;
      }
      try {
        const saved = JSON.parse(sessionStorage.getItem(`wishlist-pending:${userId}`));
        if (saved && typeof saved.id === 'string' && typeof saved.ownerId === 'string'
          && typeof saved.content === 'string'
          && (saved.path === null || (typeof saved.path === 'string' && saved.path.startsWith(`${userId}/`)))) {
          pending = saved;
          el('text').value = saved.content;
          el('owner').value = saved.ownerId;
          message('send-status', '上次添加尚未确认，请点击重试。不会重复添加心愿。');
        }
      } catch (error) {
        // 没有可恢复的请求。
      }
      el('content').hidden = false;
      message('status', isAdmin
        ? '所有心愿的汇总；选择用户可添加共享心愿。'
        : '与你的站主共享心愿，双方都可以标记完成。');
      el('compose').addEventListener('submit', addWish);
      el('file').addEventListener('change', previewPhoto);
      el('remove-photo').addEventListener('click', () => {
        el('file').value = '';
        clearPreview();
      });
      el('refresh').addEventListener('click', () => loadWishes());
      el('more').addEventListener('click', () => loadWishes(ready));
      supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event !== 'SIGNED_OUT' && (!nextSession || nextSession.user.id === userId)) return;
        userId = null;
        items.clear();
        clearPhotos();
        clearPreview();
        el('feed').replaceChildren();
        el('content').hidden = true;
        message('status', '登录状态已改变，请刷新后重新打开心愿单。');
      });
      await loadWishes();
    } catch (error) {
      message('status', `心愿单打开失败：${error.message || '请刷新重试'}`, true);
    }
  });

  async function validatePhoto(file) {
    if (!Object.hasOwn(imageTypes, file.type)) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('图片大小须在 0 到 10 MB 之间。');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch (error) {
      throw new Error('无法读取这张图片，请重新选择。');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function previewPhoto() {
    clearPreview();
    message('send-status', '');
    const file = el('file').files[0];
    if (!file) return;
    try {
      await validatePhoto(file);
      if (el('file').files[0] !== file || !userId) return;
      previewUrl = URL.createObjectURL(file);
      el('preview').src = previewUrl;
      el('preview').hidden = false;
      el('remove-photo').hidden = false;
    } catch (error) {
      if (el('file').files[0] !== file) return;
      el('file').value = '';
      message('send-status', error.message, true);
    }
  }

  function queryWishes(completed, after, limit) {
    let query = supabase.from('wishlist_items').select(columns).eq('is_completed', completed)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
    if (!isAdmin) query = query.eq('owner_id', userId);
    if (after) query = query.or(`created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`);
    return query;
  }

  async function loadWishes(more = false) {
    if (busy || !userId || (more && !hasMore)) return;
    const viewer = userId;
    setBusy(true);
    message('list-status', '正在加载...');
    try {
      if (!more) {
        const unfinished = [];
        let after = null;
        // 分批取完，避免 Supabase 单次返回上限截断「全部未完成」。
        while (true) {
          const { data, error } = await queryWishes(false, after, 200);
          if (viewer !== userId) return;
          if (error) throw error;
          if (!data.length) break;
          unfinished.push(...data);
          after = data[data.length - 1];
        }
        clearPhotos();
        items.clear();
        unfinished.forEach(item => items.set(item.id, item));
        cursor = null;
        hasMore = true;
        ready = true;
      } else {
        const { data, error } = await queryWishes(true, cursor, 11);
        if (viewer !== userId) return;
        if (error) throw error;
        const page = data.slice(0, 10);
        page.forEach(item => items.set(item.id, item));
        if (page.length) cursor = page[page.length - 1];
        hasMore = data.length > 10;
      }
      renderWishes();
      message('list-status', !items.size
        ? (more ? '还没有心愿。' : '暂无未完成心愿，可加载已完成心愿。')
        : (more && !hasMore ? '已加载全部已完成心愿。' : ''));
      el('more').textContent = '加载更多（已完成心愿）';
    } catch (error) {
      if (viewer !== userId) return;
      message('list-status', `加载失败：${error.message || '请稍后重试'}`, true);
      el('more').textContent = '重试加载';
    } finally {
      if (viewer === userId) {
        el('more').hidden = !hasMore;
        setBusy(false);
      }
    }
  }

  function renderWishes() {
    const sorted = [...items.values()].sort((a, b) => Number(a.is_completed) - Number(b.is_completed)
      || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    el('feed').replaceChildren(...sorted.map(buildWish));
  }

  function buildWish(item) {
    const card = document.createElement('article');
    card.className = `wishlist-card${item.is_completed ? ' is-completed' : ''}`;
    card.dataset.wishId = item.id;
    const state = document.createElement('p');
    state.className = 'wishlist-state';
    state.textContent = item.is_completed ? '✓ 已完成' : '○ 未完成';
    const meta = document.createElement('p');
    meta.className = 'wishlist-meta';
    meta.textContent = `${item.author?.username || '用户'} · ${formatDate(item.created_at)}`
      + (isAdmin ? ` · 与 ${item.owner?.username || 'SVIP 用户'} 共享` : '');
    const text = document.createElement('p');
    text.className = 'wishlist-text';
    text.textContent = item.content;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-secondary';
    toggle.dataset.toggle = item.id;
    toggle.setAttribute('aria-pressed', String(item.is_completed));
    toggle.textContent = item.is_completed ? '取消完成' : '标记完成';
    toggle.disabled = busy;
    toggle.addEventListener('click', () => setCompleted(item));
    card.append(state, meta, text);
    if (item.storage_path) {
      const image = document.createElement('img');
      image.className = 'wishlist-photo';
      image.alt = '心愿附图';
      image.hidden = true;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-secondary';
      retry.textContent = '正在加载图片...';
      retry.disabled = true;
      const download = async () => {
        retry.disabled = true;
        try {
          let url = photos.get(item.storage_path);
          if (!url) {
            const { data, error } = await supabase.storage.from(bucket).download(item.storage_path);
            if (error) throw error;
            if (!card.isConnected || !userId) return;
            url = photos.get(item.storage_path) || URL.createObjectURL(data);
            photos.set(item.storage_path, url);
          }
          image.src = url;
          image.hidden = false;
          retry.hidden = true;
        } catch (error) {
          retry.textContent = '图片加载失败，点击重试';
        } finally {
          retry.disabled = false;
        }
      };
      retry.addEventListener('click', download);
      card.append(image, retry);
      // DOM 挂载完成后再下载，以便刷新或登出时丢弃过期响应。
      queueMicrotask(download);
    }
    card.appendChild(toggle);
    return card;
  }

  async function setCompleted(item) {
    if (busy || !userId) return;
    const viewer = userId;
    setBusy(true);
    message('list-status', '正在更新...');
    try {
      const { data, error } = await supabase.rpc('set_wishlist_completed', {
        p_id: item.id, p_completed: !item.is_completed
      }).single();
      if (viewer !== userId) return;
      if (error) throw error;
      items.set(item.id, { ...item, ...data });
      renderWishes();
      message('list-status', data.is_completed ? '已标记完成。' : '已取消完成。');
    } catch (error) {
      if (viewer === userId) message('list-status', `更新失败：${error.message || '请重试或刷新确认状态'}`, true);
    } finally {
      if (viewer === userId) setBusy(false);
    }
  }

  async function addWish(event) {
    event.preventDefault();
    if (busy || !userId) return;
    const author = userId;
    const content = el('text').value.trim();
    const ownerId = isAdmin ? el('owner').value : userId;
    const file = el('file').files[0];
    if (!pending && (!content || !ownerId)) {
      message('send-status', '请填写心愿内容，并选择共享用户。', true);
      return;
    }
    setBusy(true);
    message('send-status', '正在添加...');
    let success = false;
    try {
      if (!pending) {
        const id = crypto.randomUUID();
        let path = null;
        if (file) {
          await validatePhoto(file);
          if (author !== userId) return;
          path = `${author}/${id}.${imageTypes[file.type]}`;
          const { error } = await supabase.storage.from(bucket).upload(path, file, {
            contentType: file.type, upsert: false, cacheControl: '0'
          });
          if (error) throw error;
          if (author !== userId) return;
        }
        pending = { id, ownerId, content, path };
        savePending();
      }
      const { error } = await supabase.rpc('create_wishlist_item', {
        p_id: pending.id, p_owner_id: pending.ownerId,
        p_content: pending.content, p_storage_path: pending.path
      }).single();
      if (author !== userId) return;
      if (error) throw error;
      pending = null;
      savePending();
      el('text').value = '';
      el('file').value = '';
      clearPreview();
      message('send-status', '心愿已添加。');
      success = true;
    } catch (error) {
      if (author === userId) message('send-status', pending
        ? `添加尚未确认：${error.message || '网络异常'}。请重试确认，不会重复添加。`
        : `添加失败：${error.message || '请稍后重试'}`, true);
    } finally {
      if (author === userId) setBusy(false);
    }
    if (success) await loadWishes();
  }
})();
