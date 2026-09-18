// 照片信箱：服务端控制投递时间；图片始终通过带登录身份的私有下载读取。
(() => {
  const bucket = 'mailbox-photos';
  const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const pageSize = 10;
  let userId = null;
  let view = 'inbox';
  let cursor = null;
  let hasMore = false;
  let loading = false;
  let sending = false;
  let requestId = 0;
  let previewUrl = null;
  let pendingLetter = null;
  const photoUrls = new Set();
  const el = id => document.getElementById(`mailbox-${id}`);

  function message(id, text, error = false) {
    el(id).textContent = text;
    el(id).classList.toggle('mailbox-error', error);
  }

  function clearPhotos() {
    photoUrls.forEach(url => URL.revokeObjectURL(url));
    photoUrls.clear();
    el('feed').replaceChildren();
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    el('preview').removeAttribute('src');
    el('preview').hidden = true;
  }

  function savePending() {
    // 投递响应丢失或刷新页面后仍可确认原信件，不会重复寄送。
    try {
      const key = `mailbox-pending:${userId}`;
      if (pendingLetter) sessionStorage.setItem(key, JSON.stringify(pendingLetter));
      else sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('无法保存信箱重试状态');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        message('status', '请先登录后再打开信箱。');
        return;
      }
      userId = session.user.id;
      const { data: profile, error } = await supabase.from('profiles')
        .select('user_type, is_admin').eq('id', userId).single();
      if (error) throw error;
      if (!profile || (!profile.is_admin && profile.user_type !== 'svip')) {
        message('status', '信箱仅对站主和 SVIP 用户开放。');
        return;
      }

      let query = supabase.from('profiles').select('id, username').neq('id', userId);
      query = profile.is_admin
        ? query.eq('user_type', 'svip').or('is_admin.is.null,is_admin.eq.false')
        : query.eq('is_admin', true);
      const { data: recipients, error: recipientError } = await query.order('username');
      if (recipientError) throw recipientError;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = recipients?.length ? '请选择收件人' : '暂无可寄送的收件人';
      el('recipient').appendChild(placeholder);
      for (const recipient of recipients || []) {
        const option = document.createElement('option');
        option.value = recipient.id;
        option.textContent = recipient.username;
        el('recipient').appendChild(option);
      }
      if (recipients?.length === 1) el('recipient').value = recipients[0].id;

      try {
        const saved = JSON.parse(sessionStorage.getItem(`mailbox-pending:${userId}`));
        if (saved?.path?.startsWith(`${userId}/`) && typeof saved.recipientId === 'string') pendingLetter = saved;
      } catch (error) {
        console.warn('无法恢复信箱重试状态');
      }
      if (pendingLetter) {
        el('recipient').value = pendingLetter.recipientId;
        el('fields').disabled = true;
        el('send').textContent = '重试确认寄出';
        message('send-status', '有一张照片等待确认寄出，请重试。重复确认不会重复寄送。');
      } else if (!recipients?.length) {
        el('fields').disabled = true;
        el('send').disabled = true;
      }

      el('content').hidden = false;
      message('status', '所有日期均为上海时间。收到的照片会在寄出满 48 小时后出现在信箱中。');
      el('compose').addEventListener('submit', sendPhoto);
      el('file').addEventListener('change', previewPhoto);
      el('inbox').addEventListener('click', () => switchView('inbox'));
      el('sent').addEventListener('click', () => switchView('sent'));
      el('refresh').addEventListener('click', () => loadLetters());
      el('more').addEventListener('click', () => loadLetters(true));
      supabase.auth.onAuthStateChange(event => {
        if (event !== 'SIGNED_OUT') return;
        userId = null;
        requestId++;
        clearPhotos();
        clearPreview();
        el('content').hidden = true;
        message('status', '已退出登录，请重新登录后查看信箱。');
      });
      await loadLetters();
    } catch (error) {
      message('status', `信箱打开失败：${error.message || '请刷新重试'}`, true);
    }
  });

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
    } catch (error) {
      if (el('file').files[0] !== file) return;
      el('file').value = '';
      message('send-status', error.message, true);
    }
  }

  async function validatePhoto(file) {
    if (!file || !Object.hasOwn(imageTypes, file.type)) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('照片大小须在 0 到 10 MB 之间。');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch (error) {
      throw new Error('无法读取这张图片，请选择有效的照片。');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function sendPhoto(event) {
    event.preventDefault();
    if (sending || !userId) return;
    const senderId = userId;
    const recipientId = pendingLetter?.recipientId || el('recipient').value;
    const file = el('file').files[0];
    if (!recipientId) {
      message('send-status', '请先选择收件人。', true);
      return;
    }
    sending = true;
    el('fields').disabled = true;
    el('send').disabled = true;
    el('send').textContent = '正在寄出...';
    message('send-status', '');
    try {
      if (!pendingLetter) {
        await validatePhoto(file);
        if (userId !== senderId) return;
        const path = `${senderId}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, {
          contentType: file.type, upsert: false, cacheControl: '0'
        });
        if (error) throw error;
        if (userId !== senderId) return;
        pendingLetter = { path, recipientId };
        savePending();
      }
      const { data: letter, error } = await supabase.rpc('send_mailbox_photo', {
        p_recipient_id: pendingLetter.recipientId,
        p_storage_path: pendingLetter.path
      }).single();
      if (error) throw error;
      if (userId !== senderId) return;
      pendingLetter = null;
      savePending();
      el('file').value = '';
      clearPreview();
      message('send-status', `照片已寄出，对方可在 ${formatDate(letter.deliver_at)}（上海时间）后看到。`);
      switchView('sent');
    } catch (error) {
      if (userId === senderId) {
        message('send-status', pendingLetter
          ? `投递尚未确认：${error.message}。请重试确认，不会重复寄送。`
          : `寄出失败：${error.message}`, true);
      }
    } finally {
      sending = false;
      el('fields').disabled = Boolean(pendingLetter);
      el('send').disabled = false;
      el('send').textContent = pendingLetter ? '重试确认寄出' : '寄出照片';
    }
  }

  function switchView(nextView) {
    view = nextView;
    el('inbox').setAttribute('aria-pressed', String(view === 'inbox'));
    el('sent').setAttribute('aria-pressed', String(view === 'sent'));
    return loadLetters();
  }

  async function loadLetters(more = false) {
    if (!userId || (more && (loading || !hasMore))) return;
    const currentRequest = ++requestId;
    const currentView = view;
    if (!more) {
      cursor = null;
      hasMore = false;
      clearPhotos();
      el('more').hidden = true;
    }
    loading = true;
    el('more').disabled = true;
    message('list-status', '正在取信...');
    try {
      let query = supabase.from('mailbox_letters')
        .select('id, sender_id, recipient_id, storage_path, sent_at, deliver_at')
        .eq(currentView === 'inbox' ? 'recipient_id' : 'sender_id', userId)
        .order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1);
      if (cursor) {
        query = query.or(`sent_at.lt.${cursor.sent_at},and(sent_at.eq.${cursor.sent_at},id.lt.${cursor.id})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (currentRequest !== requestId) return;
      const letters = (data || []).slice(0, pageSize);
      const people = [...new Set(letters.map(letter => currentView === 'inbox' ? letter.sender_id : letter.recipient_id))];
      const names = new Map();
      if (people.length) {
        const { data: profiles, error: nameError } = await supabase.from('profiles').select('id, username').in('id', people);
        if (nameError) throw nameError;
        (profiles || []).forEach(profile => names.set(profile.id, profile.username));
      }
      if (currentRequest !== requestId) return;
      letters.forEach(letter => el('feed').appendChild(buildLetter(letter, currentView, names)));
      if (letters.length) cursor = letters[letters.length - 1];
      hasMore = (data || []).length > pageSize;
      message('list-status', !el('feed').children.length
        ? (currentView === 'inbox' ? '还没有到达的照片，过些时候再来看看。' : '还没有寄出的照片。')
        : (hasMore ? '' : '已加载全部照片。'));
      el('more').textContent = '加载更多';
    } catch (error) {
      if (currentRequest !== requestId) return;
      hasMore = true;
      message('list-status', `取信失败：${error.message || '请稍后重试'}`, true);
      el('more').textContent = '重试加载';
    } finally {
      if (currentRequest === requestId) {
        loading = false;
        el('more').disabled = false;
        el('more').hidden = !hasMore;
      }
    }
  }

  function buildLetter(letter, currentView, names) {
    const card = document.createElement('article');
    card.className = 'mailbox-card';
    const heading = document.createElement('h2');
    const personId = currentView === 'inbox' ? letter.sender_id : letter.recipient_id;
    heading.textContent = `${currentView === 'inbox' ? '来自' : '寄给'} ${names.get(personId) || '用户'}`;
    const dates = document.createElement('p');
    dates.className = 'mailbox-date';
    dates.textContent = `寄出：${formatDate(letter.sent_at)} · ${currentView === 'inbox' ? '送达' : '对方可见'}：${formatDate(letter.deliver_at)}（上海时间）`;
    const image = document.createElement('img');
    image.className = 'mailbox-photo';
    image.alt = '信箱中的照片';
    image.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.textContent = '查看照片';
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '正在打开...';
      try {
        const { data, error } = await supabase.storage.from(bucket).download(letter.storage_path);
        if (error) throw error;
        if (!card.isConnected || !userId) return;
        const url = URL.createObjectURL(data);
        photoUrls.add(url);
        image.src = url;
        image.hidden = false;
        button.hidden = true;
      } catch (error) {
        button.textContent = '照片打开失败，点击重试';
      } finally {
        button.disabled = false;
      }
    });
    card.append(heading, dates, button, image);
    return card;
  }
})();
