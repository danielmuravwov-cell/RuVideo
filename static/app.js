/* ═══════════ RuVideo · логика (Shorts + лента подписок) ═══════════ */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = { user: null, videos: [], current: null, sort: 'new', q: '' };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

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
const subsWord = n => plural(n, 'подписчик', 'подписчика', 'подписчиков');

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
const fmtDate = iso => `${iso.slice(8,10)}.${iso.slice(5,7)}.${iso.slice(0,4)}`;

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
      <a class="btn-create" href="#/upload">＋ <span>Создать</span></a>
      <button class="icon-btn" id="bellBtn" title="Уведомления">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z"/></svg>
      </button>
      <div class="user-menu-wrap">
        <button class="avatar-btn" id="avatarBtn" title="Меню">${avatarHTML(u.username, u.avatar, 'lg')}</button>
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
    $('#bellBtn').onclick = () => toast('Новых уведомлений нет 🔔');
    $('#logoutBtn').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      state.user = null;
      renderAuth();
      route();
      toast('Вы вышли из аккаунта');
    };
  } else {
    box.innerHTML = `<button class="btn-blue" id="openAuthBtn">Войти</button>`;
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
  let arr = [...state.videos];
  if (state.sort === 'top') arr.sort((a, b) => b.views - a.views);
  if (state.sort === 'me' && state.user) arr = arr.filter(v => v.author === state.user.username);
  return arr;
}

function syncChips() {
  $$('#sortChips .chip').forEach(x => x.classList.toggle('active', x.dataset.sort === state.sort));
}

function cardHTML(v) {
  return `
    <a class="card" href="#/watch/${v.id}">
      <div class="thumb" style="--hue:${hue(v.title)}">
        <div class="thumb-fallback"><span>▶</span></div>
        <video class="thumb-video" src="${v.src}" muted playsinline preload="none"></video>
      </div>
      <div class="card-body">
        ${avatarHTML(v.author, v.author_avatar)}
        <div class="card-text">
          <h3>${esc(v.title)}</h3>
          <p class="ch">${esc(v.author)}${v.kind === 'short' ? ' · 🎞 Shorts' : ''}</p>
          <p>${v.views.toLocaleString('ru-RU')} ${viewsWord(v.views)} · ${timeAgo(v.created)}</p>
        </div>
      </div>
    </a>`;
}

function renderGrid() {
  const vids = sortedVideos();
  const hint = $('#searchHint');
  if (hint) {
    if (state.q) {
      hint.hidden = false;
      hint.innerHTML = `Результаты по запросу «${esc(state.q)}» — <a href="#" id="clearSearch" style="color:var(--blue);font-weight:500">сбросить</a>`;
      $('#clearSearch').onclick = async e => {
        e.preventDefault();
        state.q = ''; $('#searchInput').value = '';
        await fetchVideos(); renderGrid();
      };
    } else hint.hidden = true;
  }
  $('#grid').innerHTML = vids.map(cardHTML).join('');
  $('#emptyHome').hidden = vids.length > 0;
  observeCards();
}

let cardIO = null;
function observeCards() {
  if (!('IntersectionObserver' in window)) { $$('.thumb-video').forEach(v => v.preload = 'metadata'); return; }
  if (!cardIO) {
    cardIO = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.preload = 'metadata'; cardIO.unobserve(en.target); }
    }), { rootMargin: '300px' });
  }
  $$('.thumb-video:not([data-obs])').forEach(v => { v.dataset.obs = '1'; cardIO.observe(v); });
}

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

/* ── скорость ── */
function initSpeed() {
  const menu = $('#speedMenu');
  menu.innerHTML = SPEEDS.map(s => `<button type="button" data-speed="${s}" class="${s === 1 ? 'active' : ''}">${s}×</button>`).join('');
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

/* ── подписки ── */
async function toggleSub(author, btn) {
  if (!state.user) { openAuth(); return null; }
  const d = await api(`/api/channel/${encodeURIComponent(author)}/subscribe`, { method: 'POST' });
  btn.classList.toggle('subscribed', d.subscribed);
  btn.textContent = d.subscribed ? 'Вы подписаны' : 'Подписаться';
  return d;
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
  $('#wViews').textContent = `${video.views.toLocaleString('ru-RU')} ${viewsWord(video.views)} · ${fmtDate(video.created)}`;
  $('#wDesc').textContent = video.description || 'Описания нет.';
  $('#descBox').classList.remove('open');
  $('#descToggle').textContent = 'Ещё';
  $('#wAva').innerHTML = avatarHTML(video.author, video.author_avatar, 'lg');

  $('#likeCount').textContent = video.likes;
  $('#likeBtn').classList.toggle('active', video.my === 1);
  $('#dislikeBtn').classList.toggle('active', video.my === -1);
  $('#deleteBtn').hidden = !video.mine;

  setupSubscribe(video);
  api(`/api/videos/${id}/view`, { method: 'POST' }).catch(() => {});
  loadComments(id);
  renderNext();
}

function setSubLabel(btn, subscribed) {
  btn.classList.toggle('subscribed', subscribed);
  btn.textContent = subscribed ? 'Вы подписаны' : 'Подписаться';
}

async function setupSubscribe(video) {
  const btn = $('#subBtn');
  const isMe = state.user && state.user.username === video.author;
  btn.hidden = !!isMe;
  const ch = await api(`/api/channel/${encodeURIComponent(video.author)}`);
  $('#wSubs').textContent = `${ch.subscribers} ${subsWord(ch.subscribers)}`;
  setSubLabel(btn, ch.subscribed);
  btn.onclick = async () => {
    const d = await toggleSub(video.author, btn);
    if (d) {
      $('#wSubs').textContent = `${d.subscribers} ${subsWord(d.subscribers)}`;
      toast(d.subscribed ? 'Подписка оформлена 🔔' : 'Подписка отменена');
    }
  };
}

function renderNext() {
  const others = state.videos.filter(v => v.id !== state.current.id).slice(0, 10);
  $('#nextList').innerHTML = others.length ? others.map(v => `
    <a class="row-card" href="#/watch/${v.id}">
      <div class="thumb" style="--hue:${hue(v.title)}">
        <div class="thumb-fallback"><span>▶</span></div>
        <video class="thumb-video" src="${v.src}" muted playsinline preload="none"></video>
      </div>
      <div class="row-text">
        <h3>${esc(v.title)}</h3>
        <p>${esc(v.author)}</p>
        <p>${v.views.toLocaleString('ru-RU')} ${viewsWord(v.views)} · ${timeAgo(v.created)}</p>
      </div>
    </a>`).join('') : '<p class="muted">Пока нет других видео.</p>';
  observeCards();
}

/* ── лайки ── */
async function rateVideo(action, vid) {
  if (!state.user) { openAuth(); return null; }
  return api(`/api/videos/${vid}/rate`, { method: 'POST', body: { action } });
}

async function rate(action, btn) {
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  try {
    const d = await rateVideo(action, state.current.id);
    if (!d) return;
    $('#likeCount').textContent = d.likes;
    $('#likeBtn').classList.toggle('active', d.my === 1);
    $('#dislikeBtn').classList.toggle('active', d.my === -1);
  } catch (e) { toast(e.message, 'error'); }
}
$('#likeBtn').onclick = e => rate('like', e.currentTarget);
$('#dislikeBtn').onclick = e => rate('dislike', e.currentTarget);

$('#shareBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); toast('Ссылка скопирована 🔗', 'success'); }
  catch { toast('Не удалось скопировать', 'error'); }
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

/* описание */
$('#descToggle').onclick = e => {
  e.stopPropagation();
  const open = $('#descBox').classList.toggle('open');
  $('#descToggle').textContent = open ? 'Свернуть' : 'Ещё';
};
$('#descBox').onclick = () => {
  if (!$('#descBox').classList.contains('open')) $('#descToggle').click();
};

/* ── комментарии ── */
async function loadComments(id) {
  const { comments } = await api(`/api/videos/${id}/comments`);
  $('#commentsCount').textContent = comments.length;
  $('#commentsList').innerHTML = comments.map(c => `
    <div class="comment">
      ${avatarHTML(c.username, c.avatar)}
      <div class="comment-body">
        <p class="comment-head"><b>${esc(c.username)}</b> <span class="muted">${timeAgo(c.created)}</span></p>
        <p class="comment-text">${esc(c.text)}</p>
      </div>
    </div>`).join('');
  $('#commentForm').hidden = !state.user;
  $('#commentHint').hidden = !!state.user;
  if (state.user) $('#commentAva').innerHTML = avatarHTML(state.user.username, state.user.avatar);
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
  fd.append('kind', $('#upShort').checked ? 'short' : 'video');

  const xhr = new XMLHttpRequest();
  const bar = $('#progressBar'), wrap = $('#progressWrap'), btn = $('#publishBtn');
  wrap.hidden = false; btn.disabled = true; btn.textContent = 'Загружаем…';
  xhr.upload.onprogress = ev => {
    if (ev.lengthComputable) bar.style.width = Math.round(ev.loaded / ev.total * 100) + '%';
  };
  xhr.onload = () => {
    btn.disabled = false; btn.textContent = 'Опубликовать';
    wrap.hidden = true; bar.style.width = '0%';
    if (xhr.status === 201) {
      toast('Видео опубликовано! 🚀', 'success');
      $('#upShort').checked = false;
      state.videos = [];
      location.hash = `#/watch/${JSON.parse(xhr.responseText).id}`;
    } else {
      let msg = 'Ошибка загрузки';
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
      toast(msg, 'error');
    }
  };
  xhr.onerror = () => { btn.disabled = false; btn.textContent = 'Опубликовать'; wrap.hidden = true; toast('Сбой сети', 'error'); };
  xhr.open('POST', '/api/videos');
  xhr.send(fd);
};

const dz = $('#dropzone'), fi = $('#videoFile');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) { fi.files = e.dataTransfer.files; showFile(); } });
fi.addEventListener('change', showFile);
function showFile() {
  const f = fi.files[0];
  if (!f) return;
  $('#fileMeta').textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} МБ`;
  dz.classList.add('picked');
}

/* ── SHORTS ── */
function shortHTML(v) {
  return `
  <div class="short-card" data-id="${v.id}">
    <video class="short-video" src="${v.src}" loop playsinline preload="metadata" muted></video>
    <div class="short-overlay">
      <div class="short-info">
        <b>${esc(v.title)}</b>
        <p class="muted">${v.views.toLocaleString('ru-RU')} ${viewsWord(v.views)} · ${timeAgo(v.created)}</p>
        <div class="short-author">
          ${avatarHTML(v.author, v.author_avatar, 'sm')}
          <span>${esc(v.author)}</span>
          ${v.mine ? '' : `<button class="btn-sub sm ${v.subscribed ? 'subscribed' : ''}" data-sub="${esc(v.author)}">${v.subscribed ? 'Вы подписаны' : 'Подписаться'}</button>`}
        </div>
      </div>
      <div class="short-actions">
        <button class="short-btn ${v.my === 1 ? 'active' : ''}" data-like="${v.id}" title="Нравится">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.77 11h-4.23l1.52-4.94C16.38 5.03 15.54 4 14.38 4c-.58 0-1.14.24-1.52.65L7 11H3v10h4h1h9.43c1.06 0 1.98-.67 2.19-1.61l1.34-6C21.23 12.15 20.18 11 18.77 11z"/></svg>
          <span>${v.likes}</span>
        </button>
        <button class="short-btn" data-open="${v.id}" title="Комментарии">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
          <span>${v.comments}</span>
        </button>
        <button class="short-btn" data-sound title="Звук">🔇</button>
      </div>
    </div>
  </div>`;
}

let shortsIO = null;
async function openShorts() {
  const data = await api('/api/videos?kind=short');
  $('#emptyShorts').hidden = data.videos.length > 0;
  $('#shortsFeed').innerHTML = data.videos.map(shortHTML).join('');
  setupShorts();
}

function setupShorts() {
  if (shortsIO) shortsIO.disconnect();
  if (!('IntersectionObserver' in window)) return;
  shortsIO = new IntersectionObserver(es => {
    es.forEach(en => {
      const v = en.target.querySelector('.short-video');
      if (!v) return;
      if (en.isIntersecting && en.intersectionRatio >= 0.6) v.play().catch(() => {});
      else v.pause();
    });
  }, { threshold: [0.6] });
  $$('.short-card').forEach(c => shortsIO.observe(c));
}

$('#shortsFeed').onclick = async e => {
  const card = e.target.closest('.short-card');
  if (!card) return;
  const vid = +card.dataset.id;
  const video = card.querySelector('.short-video');
  const likeB = e.target.closest('[data-like]');
  const openB = e.target.closest('[data-open]');
  const soundB = e.target.closest('[data-sound]');
  const subB = e.target.closest('[data-sub]');

  if (likeB) {
    try {
      const d = await rateVideo('like', vid);
      if (d) { likeB.querySelector('span').textContent = d.likes; likeB.classList.toggle('active', d.my === 1); }
    } catch (err) { toast(err.message, 'error'); }
    return;
  }
  if (openB) { location.hash = '#/watch/' + vid; return; }
  if (soundB) { video.muted = !video.muted; soundB.textContent = video.muted ? '🔇' : '🔊'; return; }
  if (subB) {
    try { await toggleSub(subB.dataset.sub, subB); } catch (err) { toast(err.message, 'error'); }
    return;
  }
  if (e.target.closest('.short-video')) { if (video.paused) video.play(); else video.pause(); }
};

/* ── лента подписок ── */
async function openFeed() {
  const data = await api('/api/feed');
  $('#feedGrid').innerHTML = data.videos.map(cardHTML).join('');
  $('#emptyFeed').hidden = data.videos.length > 0;
  observeCards();
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
    : '<p class="muted">Загрузите видео — появится график.</p>';
  requestAnimationFrame(() => $$('#viewsChart .bar').forEach(b => b.style.height = b.dataset.h + '%'));

  $('#studioTable').innerHTML = d.items.length ? `
    <table class="stats-table">
      <thead><tr><th>Видео</th><th>Просмотры</th><th>Лайки</th><th>Коммент.</th><th>Дата</th></tr></thead>
      <tbody>${d.items.map(i => `
        <tr>
          <td><a href="#/watch/${i.id}" title="${esc(i.title)}">${esc(i.title)}</a></td>
          <td>${i.views.toLocaleString('ru-RU')}</td>
          <td>${i.likes}</td>
          <td>${i.comments}</td>
          <td class="muted">${fmtDate(i.created)}</td>
        </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">Видео пока нет.</p>';

  $('#studioComments').innerHTML = d.comments_list.length ? d.comments_list.map(c => `
    <div class="studio-comment">
      ${avatarHTML(c.author, c.author_avatar)}
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

/* ── поиск и чипсы ── */
let searchTimer;
$('#searchForm').onsubmit = e => e.preventDefault();
$('#searchInput').oninput = e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.q = e.target.value.trim();
    if (!location.hash.startsWith('#/') || location.hash === '') location.hash = '#/';
    await fetchVideos(); renderGrid();
  }, 300);
};
$$('#sortChips .chip').forEach(c => c.onclick = () => {
  if (c.dataset.sort === 'me' && !state.user) { openAuth(); return; }
  state.sort = c.dataset.sort;
  syncChips();
  renderGrid();
});

/* ── вход/регистрация ── */
let authMode = 'login';
function openAuth(tab = 'login') {
  authMode = tab; syncTabs();
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
    closeAuth(); renderAuth(); route();
    toast(`Привет, ${d.user.username}! 👋`, 'success');
  } catch (err) { $('#authError').textContent = err.message; }
};

/* ── сайдбар ── */
function setActiveNav(name) {
  $$('.side-item[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
}
$('#burger').onclick = () => {
  if (window.innerWidth <= 792) document.body.classList.toggle('side-open');
  else document.body.classList.toggle('side-mini');
};
$('#navTheme').onclick = e => { e.preventDefault(); toggleTheme(); };
$('#navChannel').onclick = e => {
  e.preventDefault();
  if (!state.user) { openAuth(); return; }
  state.sort = 'me'; syncChips();
  show('home'); setActiveNav('home');
  fetchVideos().then(renderGrid);
};
$('#micBtn').onclick = () => toast('Голосовой поиск скоро 🎙');

/* ── роутер ── */
function show(name) {
  if (name !== 'watch') $('#player').pause();
  if (name !== 'shorts') $$('.short-video').forEach(v => v.pause());
  ['home', 'watch', 'upload', 'studio', 'shorts', 'feed'].forEach(v => $('#view-' + v).hidden = v !== name);
  window.scrollTo(0, 0);
}

async function route() {
  const h = location.hash || '#/';
  const watchM = h.match(/^#\/watch\/(\d+)/);
  document.body.classList.remove('side-open');
  try {
    if (watchM) {
      show('watch'); setActiveNav('home');
      await openWatch(+watchM[1]);
    } else if (h === '#/upload') {
      if (!state.user) { show('home'); setActiveNav('home'); await fetchVideos(); renderGrid(); openAuth(); }
      else { show('upload'); setActiveNav('upload'); }
    } else if (h === '#/studio') {
      if (!state.user) { show('home'); setActiveNav('home'); await fetchVideos(); renderGrid(); openAuth(); }
      else { show('studio'); setActiveNav('studio'); await openStudio(); }
    } else if (h === '#/shorts') {
      show('shorts'); setActiveNav('shorts');
      await openShorts();
    } else if (h === '#/feed') {
      if (!state.user) { show('home'); setActiveNav('home'); await fetchVideos(); renderGrid(); openAuth(); }
      else { show('feed'); setActiveNav('feed'); await openFeed(); }
    } else {
      show('home'); setActiveNav('home');
      await fetchVideos(); renderGrid();
    }
  } catch (e) { toast(e.message, 'error'); }
}
window.addEventListener('hashchange', route);

/* ── глобальные события ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAuth(); closeMenu(); closeSpeed(); }
  const tag = document.activeElement?.tagName || '';
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(tag)) { e.preventDefault(); $('#searchInput').focus(); }
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
  toast('Не удалось воспроизвести видео (повреждённый файл или кодек)', 'error'));

/* ── тема ── */
function toggleTheme() {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ruvideo-theme', r.dataset.theme);
}

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