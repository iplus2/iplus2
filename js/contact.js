// ============================================
// 个人空间 JS 逻辑
// ============================================

let currentSpaceId = null;
let currentUserId = null;
let selectedFile = null;
let isAdminUser = false;

// ⚠️ 管理员 ID（你在这里填入你在 auth.users 中的 UUID）
// 通过 SQL 查询：SELECT id FROM auth.users WHERE email = '你的邮箱';
const ADMIN_ID = '2b6a77d2-c75d-45fc-a2a4-02251e01b704';

document.addEventListener('DOMContentLoaded', async () => {
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
  const canAccess = isAdmin || memberInfo.userType === 'vip' || memberInfo.userType === 'svip';

  if (!canAccess) {
    showNotice('⚠️ 此页面仅对 VIP/SVIP 会员和网站管理员开放。');
    document.getElementById('space-status').textContent = '无权访问';
    document.getElementById('private-compose').style.display = 'none';
    return;
  }

  // 初始化空间 & 加载对话
  await initSpace(isAdmin);
  await loadPosts();
  bindComposeEvents();
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

    const { data: spaces } = await supabase
      .from('private_spaces')
      .select('id, user_id')
      .order('created_at', { ascending: false });

    if (!spaces || spaces.length === 0) {
      composeEl.style.display = 'none';
      return;
    }

    // 单独查询用户名（避免 embed 报错）
    const userIds = spaces.map(s => s.user_id);
    const { data: profileList } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

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
  const { data: existing } = await supabase
    .from('private_spaces')
    .select('id')
    .eq('user_id', currentUserId)
    .maybeSingle();

  if (existing) {
    currentSpaceId = existing.id;
    statusEl.textContent = '💬 与 iplus2 的与管理员的对话';
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
    statusEl.textContent = '💬 与 iplus2 的与管理员的对话';
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

  const username = profile?.username
    || session.user.user_metadata?.username
    || session.user.email.split('@')[0];

  // VIP/SVIP 各一套默认消息
  const welcomeMsg = profile?.user_type === 'svip'
    ? '欢迎加入 SVIP 专属空间！我是 iplus2，有任何问题随时找我。'
    : '欢迎加入 VIP 空间！我是 iplus2，期待与你交流。';

  await supabase.from('private_posts').insert({
    space_id: spaceId,
    author_id: session.user.id,
    author_name: username,
    content: welcomeMsg,
    file_name: null,
    file_url: null,
    file_type: null,
    storage_path: null
  });
}

// 加载对话记录
async function loadPosts() {
  const feed = document.getElementById('private-feed');
  feed.innerHTML = '<div class="private-loading">加载中...</div>';

  isAdminUser = await checkIsAdmin(currentUserId);

  const { data: posts, error } = await supabase
    .from('private_posts')
    .select('id, space_id, author_id, author_name, content, file_name, file_url, file_type, storage_path, created_at')
    .order('created_at', { ascending: true });

  feed.innerHTML = '';

  if (error || !posts || posts.length === 0) {
    feed.innerHTML = `
      <div class="private-empty">
        <div class="private-empty-icon">💭</div>
        <p>还没有消息</p>
        <p style="font-size:0.85rem;margin-top:6px;color:#ccc">${isAdminUser ? '等待用户发起对话' : '发送第一条消息，开启与管理员的对话'}</p>
      </div>`;
    return;
  }

  for (const post of posts) {
    feed.appendChild(buildPostElement(post));
  }
}

// 构建单条消息 DOM
function buildPostElement(post) {
  const div = document.createElement('div');
  div.className = 'private-post';
  div.dataset.postId = post.id;

  const time = formatTime(post.created_at);
  const isMine = post.author_id === currentUserId;
  const isAdminAuthor = post.author_id === ADMIN_ID;

  let badge = '';
  // 只有管理员自己看时才显示「管理员」标签，普通用户看不到
  if (isAdminAuthor && isAdminUser) {
    badge = '<span class="private-post-author-badge badge-admin">管理员</span>';
  } else if (isAdminUser && !isMine) {
    badge = '<span class="private-post-author-badge badge-svip">SVIP</span>';
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
        <span class="private-post-time">${time}</span>
        ${isMine ? '<button class="btn-delete-post" data-id="' + post.id + '">🗑 删除</button>' : ''}
      </div>
    </div>
    ${post.content ? `<div class="private-post-content">${escapeHtml(post.content)}</div>` : ''}
    ${post.file_url ? `
      <div class="private-post-file">
        <a href="${escapeHtml(post.file_url)}" target="_blank" rel="noopener">
          📎 <span class="file-name-display">${escapeHtml(post.file_name || '附件')}</span>
        </a>
      </div>` : ''}
  `;

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

// 提交消息
async function submitPost() {
  const content = document.getElementById('compose-content').value.trim();
  const msgEl = document.getElementById('compose-msg');
  const submitBtn = document.getElementById('btn-compose-submit');
  const { data: { session } } = await supabase.auth.getSession();

  // 管理员必须先选用户
  if (isAdminUser && !currentSpaceId) {
    showMsg(msgEl, '请先选择上方「回复对象」', 'error');
    return;
  }

  if (!content && !selectedFile) {
    showMsg(msgEl, '请输入内容或添加附件', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '发送中...';
  msgEl.style.display = 'none';

  let fileName = null, fileUrl = null, fileType = null, storagePath = null;

  try {
    if (selectedFile) {
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      storagePath = `private/${currentSpaceId}/${randomSuffix}_${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(storagePath);

      fileName = selectedFile.name;
      fileUrl = urlData.publicUrl;
      fileType = selectedFile.type;
    }

    const username = session.user.user_metadata?.username
      || (await supabase.from('profiles').select('username').eq('id', session.user.id).single())?.data?.username
      || session.user.email.split('@')[0];

    const { error: insertError } = await supabase
      .from('private_posts')
      .insert({
        space_id: currentSpaceId,
        author_id: session.user.id,
        author_name: username,
        content: content || null,
        file_name: fileName,
        file_url: fileUrl,
        file_type: fileType,
        storage_path: storagePath
      });

    if (insertError) throw insertError;

    // 清空表单
    document.getElementById('compose-content').value = '';
    document.getElementById('compose-file').value = '';
    selectedFile = null;
    const fileNameDisplay = document.getElementById('compose-file-name');
    if (fileNameDisplay) fileNameDisplay.style.display = 'none';

    showMsg(msgEl, '发送成功', 'success');
    submitBtn.disabled = false;
    submitBtn.textContent = '发 送';

    await loadPosts();

  } catch (err) {
    showMsg(msgEl, `发送失败: ${err.message}`, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '发 送';
  }
}

// 删除消息
async function deletePost(postId) {
  if (!confirm('确定要删除这条消息吗？')) return;

  const { data: post } = await supabase
    .from('private_posts')
    .select('storage_path')
    .eq('id', postId)
    .single();

  await supabase.from('private_posts').delete().eq('id', postId);

  if (post?.storage_path) {
    try {
      await supabase.storage.from('attachments').remove([post.storage_path]);
    } catch (e) {
      console.warn('附件删除失败:', e.message);
    }
  }

  const el = document.querySelector(`[data-post-id="${postId}"]`);
  if (el) el.remove();

  const feed = document.getElementById('private-feed');
  if (!feed.children.length) {
    feed.innerHTML = `
      <div class="private-empty">
        <div class="private-empty-icon">💭</div>
        <p>还没有消息</p>
      </div>`;
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
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
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
