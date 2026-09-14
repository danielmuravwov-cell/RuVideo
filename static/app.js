/* ═══════════ RuVideo · клиентская логика ═══════════ */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = { user: null, videos: [], current: null, sort: 'new', q: '' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

/* ── утилиты ── */
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;

function plural(n, one, few, many) {
  n = Math.abs(n) % 100;
  if (n >= 10 && n <= 20) return many;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
const viewsWord = n => plural(n, 'просмотр', 'просмотра', 'просмотров');

function timeAgo(iso) {
  const dt = new Date(iso.replace(' ', 'T') + 'Z');
  let s = Math.max(0, (Date.now() - dt.getTime()) / 1000);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} ${plural(w, 'неделю', 'недели', 'недель')} назад`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} ${plural(mo, 'месяц', 'месяца', 'месяцев')} назад`;
  const y = Math.floor(d / 365);
  return `${y} ${plural(y, 'год', 'года', 'лет')} назад`;
}

function avatarHTML(name, url, cls = '') {
  if (url) return `<img class="avatar ${cls}" src="${url}" alt="${esc(name)}">`;
  return `<span class="avatar ${cls}" style="--hue:${hue(name)}">${esc(name[0].toUpperCase())}</span>`;
}

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 350); }, 4000);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

/* ── шапка ── */
function renderAuth() {
  const box = $('#authArea');
  if (state.user) {
    const u = state.user;
    box.innerHTML = `
      <a class="btn btn-accent" href="#/upload">+ Добавить</a>
      <div class="user-menu-wrap">
        <button class="avatar-btn" id="avatarBtn" title="Меню">${avatarHTML(u.username, u.avatar)}</button>
        <div class="user-menu" id="userMenu" hidden>
          <a class="menu-item" href="#/studio">🎛&nbsp; Студия</a>
          <button class="menu-item" type="button" id="changeAvatarBtn">🖼&nbsp; Сменить аватар</button>
          <button class="menu-item danger" type="button" id="logoutBtn">⎋&nbsp; Выйти</button>
        </div>
      </div>
      <input type="file" id="avatarInput" accept="image/*" hidden>`;

    const menu = $('#userMenu');
    $('#avatarBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    menu.onclick = () => { menu.hidden = true; };
    $('#changeAvatarBtn').onclick = () => $('#avatarInput').click();
    $('#logoutBtn').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      state.user = null;
      renderAuth();
      route();
      toast('Вы вышли из аккаунта');
    };
  } else {
    box.innerHTML = `<button class="btn btn-outline" id="openAuthBtn">Войти</button>`;
    $('#openAuthBtn').onclick = () => openAuth();
  }
}

/* ── главная ── */
async function fetchVideos() {
  const data = await api('/api/videos' + (state.q ? `?q=${encodeURIComponent(state.q)}` : ''));
  state.videos = data.videos;
  return state.videos;
}

function sortedVideos() {
  const arr = [...state.videos];
  if (state.sort === 'top') arr.sort((a, b) => b.views - a.views);
  return arr;
}

function renderGrid() {
  const vids = sortedVideos();

  const hint = $('#searchHint');
  if (hint) {
    if (state.q) {
      hint.hidden = false;
      hint.innerHTML = `Показаны результаты по запросу «${esc(state.q)}» — ` +
        `<a href="#" id="clearSearch" style="color:var(--accent);font-weight:600">очистить</a>`;
      $('#clearSearch').onclick = async e => {
        e.preventDefault();
        state.q = '';
        $('#searchInput').value = '';
        await fetchVideos();
        renderGrid();
      };
    } else hint.hidden = true;
  }

  $('#grid').innerHTML = vids.map(v => `
    <a class="card" href="#/watch/${v.id}">
      <div class="thumb">
        <video class="thumb-video" src="${v.src}" muted playsinline preload="metadata"></video>
      </div>
      <div class="card-meta">
        ${avatarHTML(v.author, v.author_avatar, 'sm')}
        <div class="card-text">
          <h3>${esc(v.title)}</h3>
          <p>${esc(v.author)}</p>
          <p>${v.views.toLocaleString('ru-RU')} ${viewsWord(v.views)} · ${timeAgo(v.created)}</p>
        </div>
      </div>
    </a>`).join('');
  $('#emptyHome').hidden = vids.length > 0;
  requestAnimationFrame(() =>
    $$('.card').forEach((c, i) => { c.style.transitionDelay = `${(i % 4) * 45}ms`; c.classList.add('in'); }));
}

/* живые превью при наведении */
function initPreviews() {
  const grid = $('#grid');
  grid.addEventListener('mouseover', e => {
    const card = e.target.closest('.card');
    if (!card || card.dataset.hover) return;
    card.dataset.hover = '1';
    const v = card.querySelector('.thumb-video');
    if (v) v.play().catch(() => {});
  });
  grid.addEventListener('mouseout', e => {
    const card = e.target.closest('.card');
    if (!card || card.contains(e.relatedTarget)) return;
    delete card.dataset.hover;
    const v = card.querySelector('.thumb-video');
    if (v) { v.pause(); v.currentTime = 0; }
  });
}

/* ── скорость воспроизведения ── */
function initSpeed() {
  const menu = $('#speedMenu');
  menu.innerHTML = SPEEDS.map(s =>
    `<button type="button" data-speed="${s}" class="${s === 1 ? 'active' : ''}">${s}×</button>`).join('');
  $('#speedBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  menu.onclick = e => {
    const b = e.target.closest('button[data-speed]');
    if (!b) return;
    const s = parseFloat(b.dataset.speed);
    $('#player').playbackRate = s;
    $('#speedLabel').textContent = s + '×';
    $$('#speedMenu button').forEach(x => x.classList.toggle('active', x === b));
    menu.hidden = true;
  };
}

/* ── просмотр ── */
async function openWatch(id) {
  const { video } = await api(`/api/videos/${id}`);
  state.current = video;
  if (!state.videos.length) await fetchVideos();

  const player = $('#player');
  player.src = video.src;
  player.load();
  player.play().catch(() => {});

  $('#wTitle').textContent = video.title;
  $('#wAuthor').textContent = video.author;
  $('#wDate').textContent = timeAgo(video.created);
  $('#wViews').textContent = `${video.views.toLocaleString('ru-RU')} ${viewsWord(video.views)}`;
  $('#wDesc').textContent = video.description || 'Описания нет.';
  $('#wAva').innerHTML = avatarHTML(video.author, video.author_avatar);

  $('#likeCount').textContent = video.likes;
  $('#likeBtn').classList.toggle('active', video.my === 1);
  $('#dislikeBtn').classList.toggle('active', video.my === -1);
  $('#deleteBtn').hidden = !video.mine;

  setupSubscribe(video);
  api(`/api/videos/${id}/view`, { method: 'POST' }).catch(() => {});
  loadComments(id);
  renderNext();
}

/* подписка */
function setSubLabel(btn, subscribed, subs) {
  btn.classList.toggle('subscribed', subscribed);
  btn.textContent = subscribed ? `✓ Вы подписаны · ${subs}` : `Подписаться · ${subs}`;
}

async function setupSubscribe(video) {
  const btn = $('#subBtn');
  const isMe = state.user && state.user.username === video.author;
  btn.hidden = !!isMe;
  if (isMe) return;
  const ch = await api(`/api/channel/${encodeURIComponent(video.author)}`);
  setSubLabel(btn, ch.subscribed, ch.subscribers);
  btn.onclick = async () => {
    if (!state.user) { openAuth(); return; }
    try {
      const d = await api(`/api/channel/${encodeURIComponent(video.author)}/subscribe`, { method: 'POST' });
      setSubLabel(btn, d.subscribed, d.subscribers);
      toast(d.subscribed ? 'Подписка оформлена 🔔' : 'Подписка отменена');
    } catch (e) { toast(e.message, 'error'); }
  };
}

function renderNext() {
  const others = state.videos.filter(v => v.id !== state.current.id).slice(0, 8);
  $('#nextList').innerHTML = others.length ? others.map(v => `
    <a class="row-card" href="#/watch/${v.id}">
      <div class="thumb"><div class="thumb-fallback" style="--hue:${hue(v.title)}"><span>▶</span></div></div>
      <div class="row-text">
        <h3>${esc(v.title)}</h3>
        <p class="muted">${esc(v.author)}</p>
        <p class="muted">${v.views.toLocaleString('ru-RU')} ${viewsWord(v.views)}</p>
      </div>
    </a>`).join('') : '<p class="muted">Пока нет других видео.</p>';
}

/* лайк / дизлайк */
async function rate(action, btn) {
  if (!state.user) { openAuth(); return; }
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  try {
    const d = await api(`/api/videos/${state.current.id}/rate`, { method: 'POST', body: { action } });
    $('#likeCount').textContent = d.likes;
    $('#likeBtn').classList.toggle('active', d.my === 1);
    $('#dislikeBtn').classList.toggle('active', d.my === -1);
  } catch (e) { toast(e.message, 'error'); }
}
$('#likeBtn').onclick = e => rate('like', e.currentTarget);
$('#dislikeBtn').onclick = e => rate('dislike', e.currentTarget);

$('#shareBtn').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Ссылка скопирована 🔗', 'success');
  } catch { toast('Не удалось скопировать', 'error'); }
};

$('#deleteBtn').onclick = async () => {
  if (!confirm('Удалить видео безвозвратно?')) return;
  try {
    await api(`/api/videos/${state.current.id}`, { method: 'DELETE' });
    toast('Видео удалено', 'success');
    state.videos = [];
    location.hash = '#/';
  } catch (e) { toast(e.message, 'error'); }
};

/* ── комментарии ── */
async function loadComments(id) {
  const { comments } = await api(`/api/videos/${id}/comments`);
  $('#commentsCount').textContent = comments.length;
  $('#commentsList').innerHTML = comments.map(c => `
    <div class="comment">
      ${avatarHTML(c.username, c.avatar, 'sm')}
      <div class="comment-body">
        <p class="comment-head"><b>${esc(c.username)}</b> <span class="muted">${timeAgo(c.created)}</span></p>
        <p class="comment-text">${esc(c.text)}</p>
      </div>
    </div>`).join('');
  $('#commentForm').hidden = !state.user;
  $('#commentHint').hidden = !!state.user;
}

$('#commentForm').onsubmit = async e => {
  e.preventDefault();
  const input = $('#commentInput');
  const text = input.value.trim();
  if (!text) return;
  try {
    await api(`/api/videos/${state.current.id}/comments`, { method: 'POST', body: { text } });
    input.value = '';
    await loadComments(state.current.id);
    toast('Комментарий добавлен', 'success');
  } catch (err) { toast(err.message, 'error'); }
};
$('#loginLink').onclick = e => { e.preventDefault(); openAuth(); };

/* ── загрузка файла ── */
$('#uploadForm').onsubmit = e => {
  e.preventDefault();
  const f = $('#videoFile').files[0];
  if (!f) { toast('Сначала выберите видеофайл', 'error'); return; }

  const fd = new FormData();
  fd.append('video', f);
  fd.append('title', $('#upTitle').value.trim());
  fd.append('description', $('#upDesc').value.trim());

  const xhr = new XMLHttpRequest();
  const bar = $('#progressBar'), wrap = $('#progressWrap'), btn = $('#publishBtn');
  wrap.hidden = false;
  btn.disabled = true;
  btn.textContent = 'Загружаем…';

  xhr.upload.onprogress = ev => {
    if (ev.lengthComputable) bar.style.width = Math.round(ev.loaded / ev.total * 100) + '%';
  };
  xhr.onload = () => {
    btn.disabled = false;
    btn.textContent = 'Опубликовать';
    wrap.hidden = true;
    bar.style.width = '0%';
    if (xhr.status === 201) {
      toast('Видео опубликовано! 🚀', 'success');
      state.videos = [];
      location.hash = `#/watch/${JSON.parse(xhr.responseText).id}`;
    } else {
      let msg = 'Ошибка загрузки';
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
      toast(msg, 'error');
    }
  };
  xhr.onerror = () => {
    btn.disabled = false; btn.textContent = 'Опубликовать'; wrap.hidden = true;
    toast('Сбой сети — сервер не отвечает', 'error');
  };
  xhr.open('POST', '/api/videos');
  xhr.send(fd);
};

/* дроп-зона */
const dz = $('#dropzone'), fi = $('#videoFile');
['dragenter', 'dragover'].forEach(ev =>
  dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev =>
  dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) { fi.files = e.dataTransfer.files; showFile(); }
});
fi.addEventListener('change', showFile);
function showFile() {
  const f = fi.files[0];
  if (!f) return;
  $('#fileMeta').textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} МБ`;
  dz.classList.add('picked');
}

/* ── студия ── */
async function openStudio() {
  const d = await api('/api/studio');

  const cards = [
    ['👥', 'Подписчики', d.subscribers],
    ['👁️', 'Просмотры', d.views],
    ['👍', 'Лайки', d.likes],
    ['💬', 'Комментарии', d.comments],
    ['🎬', 'Видео', d.videos],
  ];
  $('#statCards').innerHTML = cards.map(([icon, label, val]) => `
    <div class="stat-card">
      <span class="stat-icon">${icon}</span>
      <b class="stat-value">${val.toLocaleString('ru-RU')}</b>
      <span class="muted">${label}</span>
    </div>`).join('');

  const items = d.items.slice(0, 10);
  const max = Math.max(1, ...items.map(i => i.views));
  $('#viewsChart').innerHTML = items.length
    ? items.map(i => `
      <div class="bar-wrap" title="${esc(i.title)} — ${i.views} ${viewsWord(i.views)}">
        <div class="bar" data-h="${Math.max(4, Math.round(i.views / max * 100))}"></div>
        <span class="bar-num">${i.views}</span>
      </div>`).join('')
    : '<p class="muted">Загрузите видео — и здесь появится график.</p>';
  requestAnimationFrame(() =>
    $$('#viewsChart .bar').forEach(b => b.style.height = b.dataset.h + '%'));

  $('#studioTable').innerHTML = d.items.length ? `
    <table class="stats-table">
      <thead><tr><th>Видео</th><th>Просмотры</th><th>Лайки</th><th>Коммент.</th><th>Дата</th></tr></thead>
      <tbody>${d.items.map(i => `
        <tr>
          <td><a href="#/watch/${i.id}" title="${esc(i.title)}">${esc(i.title)}</a></td>
          <td>${i.views.toLocaleString('ru-RU')}</td>
          <td>${i.likes}</td>
          <td>${i.comments}</td>
          <td class="muted">${timeAgo(i.created)}</td>
        </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">Видео пока нет.</p>';

  /* комментарии к моим видео */
  $('#studioComments').innerHTML = d.comments_list.length ? d.comments_list.map(c => `
    <div class="studio-comment">
      ${avatarHTML(c.author, c.author_avatar, 'sm')}
      <div class="studio-comment-body">
        <p class="comment-head">
          <b>${esc(c.author)}</b> <span class="muted">${timeAgo(c.created)}</span>
          <a class="muted" href="#/watch/${c.video_id}" title="${esc(c.video_title)}">🎬 ${esc(c.video_title)}</a>
        </p>
        <p class="comment-text">${esc(c.text)}</p>
      </div>
    </div>`).join('')
    : '<p class="muted">Комментариев пока нет.</p>';
}

/* ── поиск и сортировка ── */
let searchTimer;
$('#searchForm').onsubmit = e => e.preventDefault();
$('#searchInput').oninput = e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.q = e.target.value.trim();
    if (!location.hash.startsWith('#/') || location.hash === '') location.hash = '#/';
    await fetchVideos();
    renderGrid();
  }, 300);
};
$$('#sortChips .chip').forEach(c => c.onclick = () => {
  state.sort = c.dataset.sort;
  $$('#sortChips .chip').forEach(x => x.classList.toggle('active', x === c));
  renderGrid();
});

/* ── вход/регистрация ── */
let authMode = 'login';
function openAuth(tab = 'login') {
  authMode = tab;
  syncTabs();
  $('#authError').textContent = '';
  $('#authModal').hidden = false;
  $('#authUser').focus();
}
function closeAuth() { $('#authModal').hidden = true; }
function closeMenu() { const m = $('#userMenu'); if (m) m.hidden = true; }
function closeSpeed() { const m = $('#speedMenu'); if (m) m.hidden = true; }
function syncTabs() {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === authMode));
  $('#authSubmit').textContent = authMode === 'login' ? 'Войти' : 'Создать аккаунт';
}
$$('.tab').forEach(t => t.onclick = () => { authMode = t.dataset.tab; syncTabs(); $('#authError').textContent = ''; });
$('#authClose').onclick = closeAuth;
$('#authModal').addEventListener('click', e => { if (e.target.id === 'authModal') closeAuth(); });

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await api('/api/' + authMode, {
      method: 'POST',
      body: { username: $('#authUser').value.trim(), password: $('#authPass').value },
    });
    state.user = d.user;
    closeAuth();
    renderAuth();
    route();
    toast(`Привет, ${d.user.username}! 👋`, 'success');
  } catch (err) {
    $('#authError').textContent = err.message;
  }
};

/* ── роутер ── */
function show(name) {
  if (name !== 'watch') $('#player').pause();
  ['home', 'watch', 'upload', 'studio'].forEach(v => $('#view-' + v).hidden = v !== name);
  window.scrollTo(0, 0);
}

async function route() {
  const h = location.hash || '#/';
  const watchM = h.match(/^#\/watch\/(\d+)/);
  try {
    if (watchM) {
      show('watch');
      await openWatch(+watchM[1]);
    } else if (h === '#/upload') {
      if (!state.user) { show('home'); await fetchVideos(); renderGrid(); openAuth(); }
      else show('upload');
    } else if (h === '#/studio') {
      if (!state.user) { show('home'); await fetchVideos(); renderGrid(); openAuth(); }
      else { show('studio'); await openStudio(); }
    } else {
      show('home');
      await fetchVideos();
      renderGrid();
    }
  } catch (e) { toast(e.message, 'error'); }
}
window.addEventListener('hashchange', route);

/* ── глобальные события ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAuth(); closeMenu(); closeSpeed(); }
  const tag = document.activeElement?.tagName || '';
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(tag)) {
    e.preventDefault();
    $('#searchInput').focus();
  }
});

document.addEventListener('click', e => {
  const menu = $('#userMenu');
  if (menu && !menu.hidden && !e.target.closest('.user-menu-wrap')) menu.hidden = true;
  const speed = $('#speedMenu');
  if (speed && !speed.hidden && !e.target.closest('.speed-wrap')) speed.hidden = true;
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'avatarInput') return;
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const fd = new FormData();
  fd.append('avatar', f);
  try {
    const res = await fetch('/api/avatar', { method: 'POST', body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Ошибка загрузки');
    state.user.avatar = d.avatar;
    renderAuth();
    toast('Аватар обновлён 🖼', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

$('#player').addEventListener('error', () =>
  toast('Не удалось воспроизвести видео (файл повреждён или неподдерживаемый кодек)', 'error'));

/* ── тема ── */
$('#themeToggle').onclick = () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ruvideo-theme', r.dataset.theme);
};

/* ── старт ── */
(async function init() {
  const saved = localStorage.getItem('ruvideo-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  initPreviews();
  initSpeed();
  const d = await api('/api/me');
  state.user = d.user;
  renderAuth();
  route();
})();