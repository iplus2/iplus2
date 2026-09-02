// ============================================
// 管理员邀请码页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (!profile?.is_admin) {
    renderAccessDenied();
    return;
  }

  await loadCodes();
  document.getElementById('btn-gen-code').addEventListener('click', generateCode);
});

function renderAccessDenied() {
  const wrapper = document.querySelector('.admin-wrap');
  const notice = document.createElement('div');
  const link = document.createElement('a');

  notice.className = 'notice admin-access-denied';
  notice.append('⚠️ 你没有管理员权限，');
  link.href = 'index.html';
  link.textContent = '返回首页';
  notice.appendChild(link);
  wrapper.replaceChildren(notice);
}

async function generateCode() {
  const type = document.getElementById('code-type-select').value;
  const customCode = document.getElementById('custom-code-input').value;
  const button = document.getElementById('btn-gen-code');
  const result = document.getElementById('gen-result');

  button.disabled = true;
  button.textContent = '生成中...';
  result.style.display = 'none';

  try {
    const { data, error } = await supabase.rpc('create_invite_code', {
      p_type: type,
      p_custom_code: customCode || null
    });
    if (error) throw error;

    renderGeneratedCode(result, data, type);
    document.getElementById('custom-code-input').value = '';
    await loadCodes();
  } catch (error) {
    result.className = 'result-box result-error';
    result.textContent = `❌ 生成失败：${error.message}`;
    result.style.display = 'block';
  } finally {
    button.disabled = false;
    button.textContent = '生成';
  }
}

function renderGeneratedCode(container, code, type) {
  const codeElement = document.createElement('strong');
  const copyButton = createCopyButton(code);

  codeElement.textContent = code;
  container.className = 'result-box result-success';
  container.replaceChildren(
    document.createTextNode('✅ 邀请码生成成功：'),
    codeElement,
    document.createTextNode(`（${type.toUpperCase()}） `),
    copyButton
  );
  container.style.display = 'block';
}

async function loadCodes() {
  const list = document.getElementById('codes-list');
  const loading = document.getElementById('codes-loading');
  loading.style.display = 'block';
  list.replaceChildren();

  const { data: codes, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  loading.style.display = 'none';

  if (error) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'admin-list-message admin-list-error';
    errorMessage.textContent = `加载失败：${error.message}`;
    list.replaceChildren(errorMessage);
    return;
  }

  if (!codes?.length) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'admin-list-message';
    emptyMessage.textContent = '暂无邀请码';
    list.replaceChildren(emptyMessage);
    return;
  }

  list.replaceChildren(...codes.map(createCodeRow));
}

function createCodeRow(codeInfo) {
  const row = document.createElement('div');
  const code = document.createElement('span');
  const type = document.createElement('span');
  const status = document.createElement('span');

  row.className = 'code-row';
  code.className = 'code-str';
  code.textContent = codeInfo.code;
  type.className = `code-type code-type-${codeInfo.type}`;
  type.textContent = codeInfo.type.toUpperCase();
  status.className = 'code-status';
  status.textContent = codeInfo.used ? '✅ 已使用' : '⏳ 未使用';
  row.append(code, type, status);

  if (!codeInfo.used) {
    row.appendChild(createCopyButton(codeInfo.code));
  }
  return row;
}

function createCopyButton(code) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-copy';
  button.textContent = '复制';
  button.addEventListener('click', () => copyCode(button, code));
  return button;
}

async function copyCode(button, code) {
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = '已复制!';
    button.classList.add('copied');
  } catch (error) {
    button.textContent = '复制失败';
    console.warn('Clipboard write failed:', error);
  }

  setTimeout(() => {
    button.textContent = '复制';
    button.classList.remove('copied');
  }, 1500);
}
