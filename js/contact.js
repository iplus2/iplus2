// ============================================
// 个人空间 JS 逻辑
// ============================================

let currentSpaceId = null;
let currentUserId = null;
let selectedFile = null;
let isAdminUser = false;
const postsPageSize = 10;
let postsCursor = null;
let hasMorePosts = false;
let postsLoading = false;
let postsRequestId = 0;

const privateAttachmentBucket = 'private-attachments';
const postProfiles = new Map();
const attachmentUrls = new Set();
let postSending = false;
let pendingPost = null;
const deletingPosts = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      showNotice('请先登录后再访问个人空间。');
      document.getElementById('space-status').textContent = '请先登录';
      return;
    }

    currentUserId = session.user.id;

    // 获取当前用户会员信息
    const memberInfo = await getMemberInfo();
    const isAdmin = await checkIsAdmin(currentUserId);
    isAdminUser = isAdmin;
    const canAccess = isAdmin || memberInfo.userType === 'vip' || memberInfo.userType === 'svip';

    if (!canAccess) {
      showNotice('⚠️ 此页面仅对 VIP/SVIP 会员和网站管理员开放。');
      document.getElementById('space-status').textContent = '无权访问';
      document.getElementById('private-compose').style.display = 'none';
      return;
    }

    supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event !== 'SIGNED_OUT' && (!nextSession || nextSession.user.id === currentUserId)) return;
      currentUserId = null;
      postsRequestId++;
      clearAttachmentUrls();
      document.getElementById('private-feed').replaceChildren();
      document.getElementById('private-compose').style.display = 'none';
      document.getElementById('btn-load-more').hidden = true;
      document.getElementById('space-status').textContent = '登录状态已改变，请刷新后重新进入。';
    });

    // 初始化空间 & 加载对话
    await initSpace(isAdmin);
    document.getElementById('btn-load-more').addEventListener('click', () => loadPosts(true));
    await loadPosts();
    bindComposeEvents();
    restorePendingPost();
  } catch (error) {
    document.getElementById('space-status').textContent = `空间打开失败：${error.message || '请刷新重试'}`;
    document.getElementById('private-compose').style.display = 'none';
  }
});

// 显示顶部提示
function showNotice(html) {
  const wrap = document.querySelector('.private-space-wrap');
  const notice = document.createElement('div');
  notice.className = 'private-notice';
  notice.innerHTML = `<span class="notice-icon">ℹ️</span><span>${html}</span>`;
  const header = wrap.querySelector('.private-header');
  if (header.nextSibling) {
    wrap.insertBefore(notice, header.nextSibling);
  } else {
    wrap.appendChild(notice);
  }
}

// 检查是否为管理员
async function checkIsAdmin(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

// 初始化个人空间
async function initSpace(isAdmin) {
  const statusEl = document.getElementById('space-status');
  const composeEl = document.getElementById('private-compose');

  if (isAdmin) {
    // 管理员：列出所有个人空间，渲染用户选择器
    statusEl.textContent = '👑 管理员视图';

    const { data: spaces, error: spacesError } = await supabase
      .from('private_spaces')
      .select('id, user_id')
      .order('created_at', { ascending: false });
    if (spacesError) throw spacesError;

    if (!spaces || spaces.length === 0) {
      composeEl.style.display = 'none';
      return;
    }

    // 单独查询用户名（避免 embed 报错）
    const userIds = spaces.map(s => s.user_id);
    const { data: profileList, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);
    if (profilesError) throw profilesError;

    const usernameMap = {};
    (profileList || []).forEach(p => { usernameMap[p.id] = p.username; });

    let optionsHtml = '<option value="">— 选择用户 —</option>';
    spaces.forEach(s => {
      const name = usernameMap[s.user_id] || s.user_id.slice(0, 8);
      optionsHtml += `<option value="${s.id}">${escapeHtml(name)}</option>`;
    });

    composeEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <label style="font-size:0.85rem;color:#666;">回复对象：</label>
        <select id="admin-space-select" style="margin-left:8px;padding:5px 10px;border-radius:6px;border:1px solid #d1d5db;">
          ${optionsHtml}
        </select>
      </div>
      <h3>📝 发送消息</h3>
      <textarea id="compose-content" placeholder="先选择上方用户，再输入消息..." maxlength="2000"></textarea>
      <div class="private-compose-actions">
        <label id="file-attach-label">
          📎 附件
          <input type="file" id="compose-file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" />
        </label>
        <button id="btn-compose-submit" class="btn-compose">发 送</button>
      </div>
      <p class="private-attachment-hint">附件仅对双方可见，单个文件最大 20 MB。</p>
      <div id="compose-file-name" style="font-size:0.8rem;color:#888;margin-top:6px;display:none;"></div>
      <div id="compose-msg" class="message" style="margin-top:8px;"></div>
    `;
    composeEl.style.display = 'block';

    document.getElementById('admin-space-select').addEventListener('change', (e) => {
      currentSpaceId = e.target.value || null;
      const ta = document.getElementById('compose-content');
      ta.placeholder = currentSpaceId
        ? '在这里写下你想对该用户说的话...'
        : '先选择上方用户，再输入消息...';
    });

    return;
  }

  // SVIP会员：查找自己的 space
  const { data: existing, error: existingError } = await supabase
    .from('private_spaces')
    .select('id')
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    currentSpaceId = existing.id;
    statusEl.textContent = '💬 与 iplus2 的对话';
    composeEl.style.display = 'block';
  } else {
    const { data: newSpace, error } = await supabase
      .from('private_spaces')
      .insert({ user_id: currentUserId })
      .select('id')
      .single();

    if (error || !newSpace) {
      statusEl.textContent = '空间创建失败，请联系管理员';
      return;
    }

    currentSpaceId = newSpace.id;
    statusEl.textContent = '💬 与 iplus2 的对话';
    composeEl.style.display = 'block';

    // SVIP 创建时自动发一条欢迎消息（管理员视角）
    await sendAutoWelcomeMessage(newSpace.id);
  }
}

// 发送自动欢迎消息（VIP/SVIP 各一套默认消息）
async function sendAutoWelcomeMessage(spaceId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // 获取用户类型
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, username')
    .eq('id', session.user.id)
    .single();

  const welcomeMsg = profile?.user_type === 'svip'
    ? '欢迎老婆回家！'
    : '欢迎加入根号i神教！';
  await supabase.rpc('send_private_post', {
    p_id: crypto.randomUUID(), p_space_id: spaceId, p_content: welcomeMsg,
    p_storage_path: null, p_file_name: null
  });
}

// 按时间和 ID 倒序分页；游标避免新消息或删除消息导致历史记录跳页。
async function loadPosts(loadMore = false) {
  if (loadMore && (postsLoading || !hasMorePosts)) return;
  const requestId = ++postsRequestId;
  const feed = document.getElementById('private-feed');
  const button = document.getElementById('btn-load-more');
  const status = document.getElementById('posts-status');

  if (!loadMore) {
    postsCursor = null;
    hasMorePosts = false;
    clearAttachmentUrls();
    feed.innerHTML = '<div class="private-loading">加载中...</div>';
    button.hidden = true;
  }
  postsLoading = true;
  button.disabled = true;
  button.textContent = '加载中...';
  status.textContent = '';

  try {
    let query = supabase
      .from('private_posts')
      .select('id, space_id, author_id, author_name, content, file_name, file_type, storage_path, storage_bucket, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(postsPageSize + 1);

    // 站主保留所有对话的汇总视图，会员只查询自己的空间；权限仍由 RLS 校验。
    if (!isAdminUser) {
      if (!currentSpaceId) throw new Error('空间尚未就绪，请刷新页面重试');
      query = query.eq('space_id', currentSpaceId);
    }
    if (postsCursor) {
      query = query.or(`created_at.lt.${postsCursor.created_at},and(created_at.eq.${postsCursor.created_at},id.lt.${postsCursor.id})`);
    }

    const { data: posts, error } = await query;
    if (requestId !== postsRequestId) return;
    if (error) throw error;

    // 多查一条仅用于判断是否还有历史消息，每次最多渲染十条。
    const page = (posts || []).slice(0, postsPageSize);
    if (page.length) {
      const { data: authors, error: authorsError } = await supabase.from('profiles')
        .select('id, is_admin, user_type').in('id', [...new Set(page.map(post => post.author_id))]);
      if (requestId !== postsRequestId) return;
      if (authorsError) throw authorsError;
      (authors || []).forEach(author => postProfiles.set(author.id, author));
    }
    if (!loadMore || !postsCursor) feed.replaceChildren();
    for (const post of page) {
      feed.appendChild(buildPostElement(post));
    }
    if (page.length) postsCursor = page[page.length - 1];
    hasMorePosts = (posts || []).length > postsPageSize;
    if (!feed.children.length) {
      feed.innerHTML = '<div class="private-empty"><div class="private-empty-icon">💭</div><p>还没有消息</p></div>';
    } else if (!hasMorePosts) {
      status.textContent = '已加载全部消息';
    }
    button.textContent = '加载更多';
  } catch (error) {
    if (requestId !== postsRequestId) return;
    if (!postsCursor) feed.replaceChildren();
    status.textContent = `加载失败：${error.message || '请稍后重试'}`;
    hasMorePosts = true;
    button.textContent = '重试加载';
  } finally {
    if (requestId === postsRequestId) {
      postsLoading = false;
      button.disabled = false;
      button.hidden = !hasMorePosts;
    }
  }
}

// 构建单条消息 DOM
function buildPostElement(post) {
  const div = document.createElement('div');
  div.className = 'private-post';
  div.dataset.postId = post.id;

  const time = formatTime(post.created_at);
  const isMine = post.author_id === currentUserId;
  const authorProfile = postProfiles.get(post.author_id);
  const isAdminAuthor = authorProfile?.is_admin === true;

  let badge = '';
  // 只有管理员自己看时才显示「管理员」标签，普通用户看不到
  if (isAdminAuthor && isAdminUser) {
    badge = '<span class="private-post-author-badge badge-admin">管理员</span>';
  } else if (isAdminUser && !isMine && ['vip', 'svip'].includes(authorProfile?.user_type)) {
    badge = `<span class="private-post-author-badge badge-${authorProfile.user_type}">${authorProfile.user_type.toUpperCase()}</span>`;
  }

  div.innerHTML = `
    <div class="private-post-header">
      <div class="private-post-author">
        <div class="private-post-avatar ${isAdminAuthor || isMine ? 'is-admin' : ''}">
          ${escapeHtml(post.author_name.slice(0, 1).toUpperCase())}
        </div>
        <span class="private-post-author-name">${escapeHtml(post.author_name)}</span>
        ${badge}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="private-post-time" title="${formatDate(post.created_at)}（上海时间）">${time}</span>
        ${isMine ? '<button class="btn-delete-post" data-id="' + post.id + '">🗑 删除</button>' : ''}
      </div>
    </div>
    ${post.content ? `<div class="private-post-content">${escapeHtml(post.content)}</div>` : ''}
    ${post.storage_path || post.file_name ? '<div class="private-post-file"></div>' : ''}
  `;

  const attachment = div.querySelector('.private-post-file');
  if (attachment) {
    if (post.storage_bucket === privateAttachmentBucket && post.storage_path) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-download-attachment';
      button.textContent = `📎 下载 ${post.file_name || '附件'}`;
      button.addEventListener('click', () => downloadPrivateAttachment(post, button));
      attachment.appendChild(button);
    } else {
      attachment.textContent = '历史附件正在迁移，请稍后再试。';
    }
  }

  const deleteBtn = div.querySelector('.btn-delete-post');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deletePost(post.id));
  }

  return div;
}

// 绑定发帖事件（一次绑定，initSpace 之后调用）
function bindComposeEvents() {
  const fileInput = document.getElementById('compose-file');
  const fileNameDisplay = document.getElementById('compose-file-name');
  const submitBtn = document.getElementById('btn-compose-submit');

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files[0] || null;
    if (selectedFile) {
      fileNameDisplay.textContent = '📎 ' + selectedFile.name;
      fileNameDisplay.style.display = 'block';
    } else {
      fileNameDisplay.style.display = 'none';
    }
  });

  submitBtn.addEventListener('click', submitPost);
}

// 上传和发送期间锁定目标、正文与附件；请求 ID 用于安全重试。
function setComposeBusy(busy) {
  postSending = busy;
  for (const id of ['compose-content', 'compose-file', 'admin-space-select']) {
    const element = document.getElementById(id);
    if (element) element.disabled = busy || !!pendingPost;
  }
  const button = document.getElementById('btn-compose-submit');
  button.disabled = busy;
  button.textContent = busy ? '发送中...' : pendingPost ? '重试确认发送' : '发 送';
}

function savePendingPost() {
  try {
    const key = `private-post-pending:${currentUserId}`;
    if (pendingPost) sessionStorage.setItem(key, JSON.stringify(pendingPost));
    else sessionStorage.removeItem(key);
  } catch (error) {
    // 浏览器禁用会话存储时，同一页面仍可重试。
  }
}

function restorePendingPost() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`private-post-pending:${currentUserId}`));
    if (!saved || typeof saved.p_id !== 'string' || typeof saved.p_space_id !== 'string'
      || (saved.p_content !== null && typeof saved.p_content !== 'string')
      || (saved.p_storage_path !== null && saved.p_storage_path !== `${saved.p_space_id}/${currentUserId}/${saved.p_id}`)) return;
    pendingPost = saved;
    currentSpaceId = saved.p_space_id;
    document.getElementById('compose-content').value = saved.p_content || '';
    const select = document.getElementById('admin-space-select');
    if (select) select.value = saved.p_space_id;
    showMsg(document.getElementById('compose-msg'), '上次发送尚未确认，请重试；不会重复发送。', 'error');
    setComposeBusy(false);
  } catch (error) {
    // 没有待确认的请求。
  }
}

async function submitPost() {
  if (postSending || !currentUserId) return;
  const content = document.getElementById('compose-content').value.trim();
  const msgEl = document.getElementById('compose-msg');
  const sender = currentUserId;
  const spaceId = currentSpaceId;
  const file = selectedFile;
  if (!pendingPost && (!spaceId || (!content && !file))) {
    showMsg(msgEl, !spaceId ? '请先选择上方「回复对象」' : '请输入内容或添加附件', 'error');
    return;
  }
  if (!pendingPost && file && (!file.size || file.size > 20 * 1024 * 1024)) {
    showMsg(msgEl, '附件须大于 0 且不超过 20 MB', 'error');
    return;
  }
  setComposeBusy(true);
  msgEl.style.display = 'none';
  let success = false;
  try {
    if (!pendingPost) {
      const id = crypto.randomUUID();
      const path = file ? `${spaceId}/${sender}/${id}` : null;
      if (file) {
        const { error } = await supabase.storage.from(privateAttachmentBucket).upload(path, file, {
          contentType: file.type || 'application/octet-stream', upsert: false, cacheControl: '0'
        });
        if (error) throw error;
        if (sender !== currentUserId) return;
      }
      pendingPost = {
        p_id: id, p_space_id: spaceId, p_content: content || null,
        p_storage_path: path, p_file_name: file?.name || null
      };
      savePendingPost();
    }
    const { error } = await supabase.rpc('send_private_post', pendingPost).single();
    if (sender !== currentUserId) return;
    if (error) throw error;
    pendingPost = null;
    savePendingPost();
    document.getElementById('compose-content').value = '';
    document.getElementById('compose-file').value = '';
    selectedFile = null;
    document.getElementById('compose-file-name').style.display = 'none';
    showMsg(msgEl, '发送成功', 'success');
    success = true;
  } catch (error) {
    if (sender === currentUserId) showMsg(msgEl, pendingPost
      ? `发送尚未确认：${error.message}。请重试确认，不会重复发送。`
      : `发送失败：${error.message}`, 'error');
  } finally {
    if (sender === currentUserId) setComposeBusy(false);
  }
  if (success) await loadPosts();
}

function clearAttachmentUrls() {
  attachmentUrls.forEach(url => URL.revokeObjectURL(url));
  attachmentUrls.clear();
}

window.addEventListener('pagehide', clearAttachmentUrls);

async function downloadPrivateAttachment(post, button) {
  if (button.disabled || !currentUserId) return;
  const viewer = currentUserId;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '正在下载...';
  try {
    const { data, error } = await supabase.storage.from(privateAttachmentBucket).download(post.storage_path);
    if (error) throw error;
    if (viewer !== currentUserId || !button.isConnected) return;
    // 强制作为文件下载，避免 HTML/SVG 等附件在本站 origin 执行脚本。
    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    attachmentUrls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = post.file_name || '附件';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      attachmentUrls.delete(url);
    }, 60000);
    button.textContent = label;
  } catch (error) {
    button.textContent = '附件下载失败，点击重试';
  } finally {
    button.disabled = false;
  }
}

// 先删除消息，再清理作者自己的孤立对象。未成功清理的对象不会向对方开放。
async function deletePost(postId) {
  if (deletingPosts.has(postId) || !currentUserId || !confirm('确定要删除这条消息吗？')) return;
  const viewer = currentUserId;
  const card = document.querySelector(`[data-post-id="${postId}"]`);
  const button = card?.querySelector('.btn-delete-post');
  deletingPosts.add(postId);
  if (button) button.disabled = true;
  try {
    const { data: post, error: readError } = await supabase.from('private_posts')
      .select('id, author_id, storage_path, storage_bucket').eq('id', postId).single();
    if (readError) throw readError;
    if (post.author_id !== viewer) throw new Error('只能删除自己发送的消息');
    const { data: deleted, error } = await supabase.from('private_posts').delete().eq('id', postId).select('id');
    if (error) throw error;
    if (!deleted?.length) throw new Error('消息未删除，请刷新后重试');
    let cleanupFailed = false;
    if (post.storage_bucket === privateAttachmentBucket && post.storage_path) {
      try {
        const { data, error: removeError } = await supabase.storage.from(privateAttachmentBucket).remove([post.storage_path]);
        cleanupFailed = !!removeError || !data?.length;
      } catch (error) {
        cleanupFailed = true;
      }
    }
    if (viewer !== currentUserId) return;
    card?.remove();
    showMsg(document.getElementById('compose-msg'), cleanupFailed
      ? '消息已删除，附件清理失败，请联系站主清理。' : '消息已删除', cleanupFailed ? 'error' : 'success');
    const feed = document.getElementById('private-feed');
    if (!feed.children.length && hasMorePosts) await loadPosts(true);
    else if (!feed.children.length) feed.textContent = '还没有消息';
  } catch (error) {
    if (viewer === currentUserId) showMsg(document.getElementById('compose-msg'), `删除失败：${error.message}`, 'error');
  } finally {
    deletingPosts.delete(postId);
    if (button) button.disabled = false;
  }
}

// 显示消息提示
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'message';
  el.style.display = 'block';
  el.style.color = type === 'success' ? '#16a34a' : '#dc2626';
}

// 格式化时间
function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return diffMin + ' 分钟前';
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH + ' 小时前';
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return diffD + ' 天前';
  return d.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
