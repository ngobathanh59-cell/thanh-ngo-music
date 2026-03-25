/* ================================================================
   MUSICROOM — app.js v5.0

   LOGIC MỚI:
   - PLAYLIST CHUNG (mặc định): Lưu tại Firebase shared-playlist
     → Ai vào website cũng thấy, ai cũng thêm được bài
   - PLAYLIST CÁ NHÂN: Sau khi đăng nhập, tab riêng
   - PHÒNG CHUNG: Tạo/join phòng riêng với mã code

   KỸ THUẬT PLAYER (từ phongnhacchung.fun):
   - autoplay: 0 khi init, cueVideoById() lần đầu
   - loadVideoById() khi chuyển bài → tự phát
   - videoEmbeddable=true khi search → tránh lỗi 101/150
   ================================================================ */

// ─── MODE ────────────────────────────────────────────────────
const MODE = { SHARED: 'shared', PERSONAL: 'personal', ROOM: 'room' };
let currentMode = MODE.SHARED;
let currentRoomId = null;
let currentRoomCode = null;

// ─── PLAYER STATE ────────────────────────────────────────────
let ytPlayer     = null;
let ytReady      = false;
let isFirstLoad  = true;
let playlist     = [];
let currentIndex = -1;
let shuffleMode  = false;
let repeatMode   = 'none';
let isPlaying    = false;
let isManualChange = false;

// ─── USER ─────────────────────────────────────────────────────
let currentUser = null;
let authMode = 'login';

// ─── FIREBASE ─────────────────────────────────────────────────
let db = null;
let authInstance = null;
let sharedListenerAttached = false;

// ─── YOUTUBE IFRAME API ───────────────────────────────────────
function onYouTubeIframeAPIReady() {
  ytReady = true;
  ytPlayer = new YT.Player('player', {
    height: '100%', width: '100%', videoId: '',
    playerVars: {
      autoplay: 0, controls: 1, rel: 0, fs: 1,
      modestbranding: 1, origin: window.location.origin, enablejsapi: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    }
  });
}

function onPlayerReady(event) {
  document.getElementById('player-placeholder').style.display = 'none';
  event.target.setVolume(parseInt(document.getElementById('volume-slider').value));
  initFirebase();
}

function onPlayerStateChange(event) {
  const s = event.data;
  if (s === YT.PlayerState.PLAYING) { isPlaying = true; showPauseIcon(); }
  else if (s === YT.PlayerState.PAUSED) { isPlaying = false; showPlayIcon(); }
  else if (s === YT.PlayerState.ENDED) { isPlaying = false; handleVideoEnd(); }
  updatePlayButton();
}

function onPlayerError(event) {
  const msgs = { 2:'Link không hợp lệ', 5:'Lỗi HTML5', 100:'Video không tồn tại', 101:'Video bị chặn embed', 150:'Video bị chặn embed' };
  showToast('⚠️ ' + (msgs[event.data] || 'Lỗi ' + event.data));
  if (!isManualChange) { isManualChange = true; setTimeout(() => { isManualChange = false; nextTrack(); }, 2000); }
}

function handleVideoEnd() {
  if (repeatMode === 'one') { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
  else nextTrack();
}

// ─── VIDEO LOAD ───────────────────────────────────────────────
function cueFirstVideo(videoId) {
  if (!ytPlayer || !videoId) return;
  try { ytPlayer.cueVideoById(videoId); } catch(e) {}
}

function loadAndPlayVideo(videoId) {
  if (!ytPlayer || !videoId) return;
  isManualChange = true;
  try { ytPlayer.loadVideoById(videoId); } catch(e) { isManualChange = false; }
  setTimeout(() => { isManualChange = false; }, 2000);
}

// ─── PLAYER CONTROLS ─────────────────────────────────────────
function playTrack(index) {
  if (index < 0 || index >= playlist.length) return;
  currentIndex = index;
  const track = playlist[index];
  document.getElementById('track-title').textContent = track.title;
  document.getElementById('track-index').textContent = (index + 1) + ' / ' + playlist.length;

  if (isFirstLoad) { cueFirstVideo(track.videoId); isFirstLoad = false; }
  else loadAndPlayVideo(track.videoId);

  // Sync vị trí phát trong room
  if (currentMode === MODE.ROOM && db && currentRoomId) {
    db.ref('rooms/' + currentRoomId + '/settings').update({
      currentVideoId: track.videoId, currentIndex: index,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }
  renderPlaylist();
}

function togglePlay() {
  if (!ytPlayer) return;
  try {
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    else if (state === YT.PlayerState.PAUSED) ytPlayer.playVideo();
    else if (state === YT.PlayerState.CUED || state === YT.PlayerState.UNSTARTED) ytPlayer.playVideo();
    else if (currentIndex >= 0) loadAndPlayVideo(playlist[currentIndex].videoId);
    else if (playlist.length > 0) playTrack(0);
  } catch(e) {}
}

function nextTrack() {
  if (!playlist.length) return;
  let next;
  if (shuffleMode) {
    do { next = Math.floor(Math.random() * playlist.length); }
    while (next === currentIndex && playlist.length > 1);
  } else {
    next = (currentIndex + 1) % playlist.length;
    if (next === 0 && repeatMode !== 'all' && currentIndex === playlist.length - 1) {
      try { ytPlayer.stopVideo(); } catch(e) {}
      isPlaying = false; showPlayIcon(); return;
    }
  }
  playTrack(next);
}

function prevTrack() {
  if (!playlist.length) return;
  try { if (ytPlayer.getCurrentTime() > 3) { ytPlayer.seekTo(0); return; } } catch(e) {}
  playTrack((currentIndex - 1 + playlist.length) % playlist.length);
}

function setVolume(val) {
  document.getElementById('volume-label').textContent = val;
  if (ytPlayer) try { ytPlayer.setVolume(parseInt(val)); } catch(e) {}
  localStorage.setItem('vol', val);
}

function showPlayIcon() { document.getElementById('icon-play').classList.remove('hidden'); document.getElementById('icon-pause').classList.add('hidden'); }
function showPauseIcon() { document.getElementById('icon-play').classList.add('hidden'); document.getElementById('icon-pause').classList.remove('hidden'); }
function updatePlayButton() {
  if (!ytPlayer) return;
  try { if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) showPauseIcon(); else showPlayIcon(); } catch(e) {}
}

// ─── SHUFFLE & REPEAT ─────────────────────────────────────────
function toggleShuffle() {
  shuffleMode = !shuffleMode;
  document.getElementById('btn-shuffle').classList.toggle('active', shuffleMode);
  showToast(shuffleMode ? '🔀 Shuffle bật' : 'Shuffle tắt');
}

function toggleRepeat() {
  const modes = ['none','one','all'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % 3];
  ['icon-loop-none','icon-loop-one','icon-loop-all'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('icon-loop-' + repeatMode).classList.remove('hidden');
  document.getElementById('btn-loop').classList.toggle('active', repeatMode !== 'none');
  showToast({ none:'Tắt lặp', one:'🔂 Lặp 1 bài', all:'🔁 Lặp tất cả' }[repeatMode]);
}

// ─── FIREBASE INIT ────────────────────────────────────────────
function initFirebase() {
  if (typeof firebase === 'undefined') return;
  try {
    db = firebase.database();
    authInstance = firebase.auth();

    // Khôi phục âm lượng
    const vol = localStorage.getItem('vol') || '80';
    document.getElementById('volume-slider').value = vol;
    document.getElementById('volume-label').textContent = vol;
    if (ytPlayer) ytPlayer.setVolume(parseInt(vol));

    // Lắng nghe shared playlist ngay lập tức — không cần đăng nhập
    listenSharedPlaylist();

    authInstance.onAuthStateChanged(user => {
      currentUser = user;
      updateAuthUI(user);
      if (user && currentMode === MODE.PERSONAL) loadPersonalPlaylist();
    });
  } catch(e) { console.error('Firebase init error:', e); }
}

function updateAuthUI(user) {
  if (user) {
    document.getElementById('auth-btn').classList.add('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('user-label').textContent = user.displayName || user.email.split('@')[0];
    document.getElementById('user-label').classList.remove('hidden');
    document.getElementById('tab-personal').classList.remove('hidden');
  } else {
    document.getElementById('auth-btn').classList.remove('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
    document.getElementById('user-label').classList.add('hidden');
    document.getElementById('tab-personal').classList.add('hidden');
    if (currentMode === MODE.PERSONAL) switchPlaylistMode('shared');
  }
}

// ─── SHARED PLAYLIST (mặc định, ai cũng thấy) ────────────────
function listenSharedPlaylist() {
  if (!db || sharedListenerAttached) return;
  sharedListenerAttached = true;

  db.ref('shared-playlist').on('value', snap => {
    if (currentMode !== MODE.SHARED) return;
    const data = snap.val();
    if (data && typeof data === 'object') {
      playlist = Object.values(data).filter(s => s && s.videoId).sort((a,b) => (a.addedAt||0)-(b.addedAt||0));
    } else {
      playlist = [];
    }
    renderPlaylist();
    // Cue bài đầu nếu chưa phát
    if (playlist.length > 0 && currentIndex < 0 && ytPlayer) {
      currentIndex = 0;
      isFirstLoad = true;
      document.getElementById('track-title').textContent = playlist[0].title;
      document.getElementById('track-index').textContent = '1 / ' + playlist.length;
      cueFirstVideo(playlist[0].videoId);
    }
  });

  // Đếm người online
  const presenceRef = db.ref('presence/' + (Math.random().toString(36).substr(2,9)));
  presenceRef.set(true);
  presenceRef.onDisconnect().remove();
  db.ref('presence').on('value', snap => {
    const count = snap.numChildren();
    document.getElementById('online-count').textContent = count + ' người đang online';
  });
}

// ─── PERSONAL PLAYLIST ────────────────────────────────────────
function loadPersonalPlaylist() {
  if (!db || !currentUser) return;
  db.ref('users/' + currentUser.uid + '/playlist').once('value').then(snap => {
    if (currentMode !== MODE.PERSONAL) return;
    const data = snap.val();
    playlist = Array.isArray(data) ? data.filter(s => s && s.videoId) : [];
    renderPlaylist();
    if (playlist.length > 0 && ytPlayer) {
      currentIndex = 0; isFirstLoad = true;
      document.getElementById('track-title').textContent = playlist[0].title;
      document.getElementById('track-index').textContent = '1 / ' + playlist.length;
      playTrack(0);
    }
  });
}

function savePersonalPlaylist() {
  if (!db || !currentUser) return;
  db.ref('users/' + currentUser.uid + '/playlist').set(playlist)
    .then(() => { document.getElementById('sync-note').classList.remove('hidden'); setTimeout(() => document.getElementById('sync-note').classList.add('hidden'), 3000); });
}

// ─── SWITCH PLAYLIST MODE ──────────────────────────────────────
function switchPlaylistMode(mode) {
  currentMode = mode;
  playlist = []; currentIndex = -1; isFirstLoad = true;
  isPlaying = false; showPlayIcon();
  document.getElementById('track-title').textContent = '—';
  document.getElementById('track-index').textContent = '0 / 0';
  try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
  document.getElementById('player-placeholder').style.display = 'flex';

  document.getElementById('tab-shared').classList.toggle('active', mode === MODE.SHARED);
  document.getElementById('tab-personal').classList.toggle('active', mode === MODE.PERSONAL);
  document.getElementById('online-count').classList.toggle('hidden', mode !== MODE.SHARED);

  if (mode === MODE.SHARED) {
    sharedListenerAttached = false;
    listenSharedPlaylist();
    document.getElementById('mode-badge').className = 'mode-badge mode-shared';
    document.getElementById('mode-label').textContent = 'Playlist chung';
  } else if (mode === MODE.PERSONAL) {
    if (!currentUser) { showToast('Hãy đăng nhập để dùng playlist cá nhân!'); openAuthModal(); switchPlaylistMode('shared'); return; }
    db && db.ref('shared-playlist').off();
    sharedListenerAttached = false;
    loadPersonalPlaylist();
    document.getElementById('mode-badge').className = 'mode-badge mode-personal';
    document.getElementById('mode-label').textContent = 'Cá nhân';
  }
  renderPlaylist();
}

// ─── ROOM MODE ────────────────────────────────────────────────
function createRoom() {
  if (!currentUser) { showToast('Hãy đăng nhập trước!'); openAuthModal(); return; }
  const name = document.getElementById('room-name-input').value.trim();
  if (!name) { showToast('Nhập tên phòng!'); return; }
  if (!db) { showToast('⚠️ Firebase chưa kết nối'); return; }

  const code = Math.random().toString(36).substring(2,8).toUpperCase();
  db.ref('rooms/' + code).set({
    name, code,
    creatorName: currentUser.displayName || currentUser.email.split('@')[0],
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    settings: { currentIndex: -1, currentVideoId: '' }
  }).then(() => { enterRoom(code, name); closeModal('modal-room'); showToast('✅ Phòng: ' + code); });
}

function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length < 4) { showToast('Nhập mã phòng!'); return; }
  if (!db) { showToast('⚠️ Firebase chưa kết nối'); return; }
  db.ref('rooms/' + code).once('value').then(snap => {
    if (!snap.exists()) { showToast('❌ Không tìm thấy phòng: ' + code); return; }
    enterRoom(code, snap.val().name);
    closeModal('modal-room');
  });
}

function enterRoom(code, name) {
  if (currentRoomId) leaveRoomCleanup();
  currentMode = MODE.ROOM; currentRoomId = code; currentRoomCode = code;
  playlist = []; currentIndex = -1; renderPlaylist();
  document.getElementById('mode-badge').className = 'mode-badge mode-room';
  document.getElementById('mode-label').textContent = '🏠 ' + name;
  document.getElementById('room-viewers').classList.remove('hidden');
  document.getElementById('current-room-name').textContent = name;
  document.getElementById('current-room-code').textContent = code;
  document.getElementById('current-room-section').classList.remove('hidden');

  const roomRef = db.ref('rooms/' + code);
  roomRef.child('playlist').on('value', snap => {
    if (currentMode !== MODE.ROOM) return;
    const data = snap.val();
    playlist = data ? Object.values(data).filter(s => s && s.videoId).sort((a,b) => (a.addedAt||0)-(b.addedAt||0)) : [];
    renderPlaylist();
  });
  roomRef.child('settings').on('value', snap => {
    if (!snap.exists() || isManualChange || currentMode !== MODE.ROOM) return;
    const s = snap.val();
    if (s.currentVideoId && s.currentVideoId !== (playlist[currentIndex]?.videoId)) {
      const idx = playlist.findIndex(t => t.videoId === s.currentVideoId);
      if (idx !== -1 && idx !== currentIndex) { currentIndex = idx; loadAndPlayVideo(playlist[idx].videoId); renderPlaylist(); }
    }
  });
  const presRef = db.ref('rooms/' + code + '/presence/' + (currentUser?.uid || 'guest'));
  presRef.set(true); presRef.onDisconnect().remove();
  db.ref('rooms/' + code + '/presence').on('value', snap => { document.getElementById('viewer-count').textContent = snap.numChildren(); });
}

function leaveRoom() { leaveRoomCleanup(); closeModal('modal-room'); switchPlaylistMode('shared'); showToast('Đã rời phòng'); }
function leaveRoomCleanup() {
  if (!currentRoomId || !db) return;
  ['playlist','settings','presence'].forEach(c => db.ref('rooms/' + currentRoomId + '/' + c).off());
  if (currentUser) db.ref('rooms/' + currentRoomId + '/presence/' + currentUser.uid).remove();
  currentRoomId = null; currentRoomCode = null;
  document.getElementById('room-viewers').classList.add('hidden');
  document.getElementById('current-room-section').classList.add('hidden');
}

function loadActiveRooms() {
  if (!db) { document.getElementById('active-rooms').innerHTML = '<p class="empty-hint" style="padding:12px 0">Firebase chưa kết nối.</p>'; return; }
  const el = document.getElementById('active-rooms');
  el.innerHTML = '<p class="empty-hint" style="padding:12px 0">Đang tải...</p>';
  db.ref('rooms').orderByChild('createdAt').limitToLast(10).once('value').then(snap => {
    el.innerHTML = '';
    if (!snap.exists()) { el.innerHTML = '<p class="empty-hint" style="padding:12px 0">Chưa có phòng nào.</p>'; return; }
    const rooms = [];
    snap.forEach(child => rooms.unshift({ code: child.key, ...child.val() }));
    rooms.forEach(room => {
      const div = document.createElement('div');
      div.className = 'room-item' + (room.code === currentRoomCode ? ' active-room' : '');
      div.innerHTML = '<div class="room-item-info"><span class="room-item-name">' + room.name + '</span><span class="room-item-code">Mã: ' + room.code + '</span><span class="room-item-creator">Tạo bởi: ' + (room.creatorName||'Ẩn danh') + '</span></div>' +
        '<button class="btn-accent" onclick="document.getElementById(\'room-code-input\').value=\'' + room.code + '\';joinRoom()">Vào</button>';
      el.appendChild(div);
    });
  }).catch(() => { el.innerHTML = '<p class="empty-hint">Lỗi tải phòng.</p>'; });
}

// ─── ADD SONG BY URL ──────────────────────────────────────────
async function addByUrl() {
  const input = document.getElementById('url-input');
  const url = input.value.trim();
  if (!url) return;
  const videoId = extractVideoId(url);
  if (!videoId) { showToast('❌ Link không hợp lệ!'); return; }
  showToast('⏳ Đang lấy thông tin...');
  const info = await fetchVideoInfo(videoId);
  input.value = '';
  addToPlaylist(info.videoId, info.title, info.thumbnail, info.channel);
}

function extractVideoId(url) {
  const patterns = [/(?:youtube\.com\/watch\?.*v=)([^&\s]{11})/,/(?:youtu\.be\/)([^?\s]{11})/,/(?:youtube\.com\/embed\/)([^?\s]{11})/,/(?:youtube\.com\/shorts\/)([^?\s]{11})/];
  for (const r of patterns) { const m = url.match(r); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

async function fetchVideoInfo(videoId) {
  try {
    const res = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json');
    if (res.ok) {
      const d = await res.json();
      return { videoId, title: d.title, thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg', channel: d.author_name || '' };
    }
  } catch(e) {}
  return { videoId, title: 'Video ' + videoId, thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg', channel: '' };
}

// ─── SEARCH (giống phongnhacchung.fun: có thời lượng) ─────────
async function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  const apiKey = localStorage.getItem('yt_api_key');
  if (!apiKey) { showToast('⚠️ Cần YouTube API Key trong ⚙️ Cài đặt'); openSettings(); return; }
  const el = document.getElementById('search-results');
  el.innerHTML = '<p class="search-status">Đang tìm kiếm...</p>';
  try {
    // videoEmbeddable=true + lấy thêm contentDetails để có thời lượng
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
      '&videoEmbeddable=true&q=' + encodeURIComponent(query) +
      '&maxResults=8&key=' + apiKey
    );
    const data = await res.json();
    if (data.error) { el.innerHTML = '<p class="search-status error">Lỗi: ' + data.error.message + '</p>'; return; }
    if (!data.items || !data.items.length) { el.innerHTML = '<p class="search-status">Không tìm thấy kết quả.</p>'; return; }

    // Lấy thêm duration cho từng video
    const ids = data.items.map(i => i.id.videoId).join(',');
    const detailRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + ids + '&key=' + apiKey);
    const detailData = await detailRes.json();
    const durations = {};
    (detailData.items || []).forEach(v => { durations[v.id] = parseDuration(v.contentDetails.duration); });

    renderSearchResults(data.items, durations);
  } catch(e) { el.innerHTML = '<p class="search-status error">Lỗi kết nối!</p>'; }
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1]||0), min = parseInt(m[2]||0), s = parseInt(m[3]||0);
  if (h > 0) return h + ':' + String(min).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  return min + ':' + String(s).padStart(2,'0');
}

function renderSearchResults(items, durations) {
  const el = document.getElementById('search-results');
  el.innerHTML = items.map(item => {
    const vid = item.id.videoId;
    const title = item.snippet.title;
    const thumb = item.snippet.thumbnails.default.url;
    const channel = item.snippet.channelTitle;
    const dur = durations[vid] || '';
    const exists = playlist.find(t => t.videoId === vid);
    const safeVid = JSON.stringify(vid);
    const safeTitle = JSON.stringify(title.replace(/"/g,''));
    const safeThumb = JSON.stringify(thumb);
    const safeCh = JSON.stringify(channel);
    const handler = exists ? '' : ('addFromSearch(' + safeVid + ',' + safeTitle + ',' + safeThumb + ',' + safeCh + ')');
    return '<div class="search-item' + (exists?' search-item-exists':'') + '" onclick="' + handler + '">' +
      '<div class="search-result-left">' +
        '<img class="search-thumb" src="' + thumb + '" alt="" loading="lazy"/>' +
        (dur ? '<span class="search-duration">' + dur + '</span>' : '') +
      '</div>' +
      '<div class="search-item-info">' +
        '<span class="search-item-title">' + title.replace(/</g,'&lt;') + '</span>' +
        '<span class="search-item-channel">' + channel + '</span>' +
        (exists ? '<span class="search-exists-badge">Đã có</span>' : '') +
      '</div>' +
      '<span class="search-item-add">' + (exists?'✓':'+') + '</span>' +
    '</div>';
  }).join('');
}

function addFromSearch(videoId, title, thumbnail, channel) {
  addToPlaylist(videoId, title, thumbnail, channel);
}

// ─── PLAYLIST MANAGEMENT ──────────────────────────────────────
function addToPlaylist(videoId, title, thumbnail, channel) {
  if (playlist.find(t => t.videoId === videoId)) { showToast('Bài này đã có rồi!'); return; }
  const track = {
    videoId, title,
    thumbnail: thumbnail || 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg',
    channel: channel || '',
    addedBy: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Ẩn danh',
    addedAt: Date.now(),
  };

  if (currentMode === MODE.SHARED && db) {
    db.ref('shared-playlist/' + videoId).set(track)
      .then(() => showToast('✅ Đã thêm vào playlist chung: ' + title.slice(0,40)))
      .catch(() => showToast('Lỗi thêm bài!'));
    return;
  }
  if (currentMode === MODE.ROOM && db && currentRoomId) {
    db.ref('rooms/' + currentRoomId + '/playlist/' + videoId).set(track)
      .then(() => showToast('✅ Đã thêm vào phòng'))
      .catch(() => showToast('Lỗi thêm bài!'));
    return;
  }

  // Personal
  playlist.push(track);
  renderPlaylist(); savePersonalPlaylist();
  showToast('✅ Đã thêm: ' + title.slice(0,40));
  if (playlist.length === 1) { currentIndex = 0; isFirstLoad = true; playTrack(0); }
}

function removeFromPlaylist(idx, event) {
  event.stopPropagation();
  const track = playlist[idx];
  if (!track) return;
  if (currentMode === MODE.SHARED && db) { db.ref('shared-playlist/' + track.videoId).remove(); return; }
  if (currentMode === MODE.ROOM && db && currentRoomId) { db.ref('rooms/' + currentRoomId + '/playlist/' + track.videoId).remove(); return; }
  playlist.splice(idx, 1);
  if (currentIndex === idx) {
    try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
    isPlaying = false; showPlayIcon(); currentIndex = -1;
    document.getElementById('track-title').textContent = '—';
    document.getElementById('track-index').textContent = '0 / 0';
    if (playlist.length > 0) playTrack(0);
    else document.getElementById('player-placeholder').style.display = 'flex';
  } else if (currentIndex > idx) currentIndex--;
  renderPlaylist(); savePersonalPlaylist();
}

function clearPlaylist() {
  if (!playlist.length) return;
  if (!confirm('Xoá toàn bộ playlist?')) return;
  if (currentMode === MODE.SHARED && db) { db.ref('shared-playlist').remove(); return; }
  if (currentMode === MODE.ROOM && db && currentRoomId) { db.ref('rooms/' + currentRoomId + '/playlist').remove(); return; }
  try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
  playlist = []; currentIndex = -1; isPlaying = false; showPlayIcon();
  document.getElementById('track-title').textContent = '—';
  document.getElementById('track-index').textContent = '0 / 0';
  document.getElementById('player-placeholder').style.display = 'flex';
  renderPlaylist(); savePersonalPlaylist();
}

function renderPlaylist() {
  const ul = document.getElementById('playlist');
  const empty = document.getElementById('playlist-empty');
  document.getElementById('playlist-count').textContent = playlist.length;
  if (!playlist.length) { ul.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  ul.innerHTML = playlist.map((t, i) =>
    '<li class="playlist-item ' + (i===currentIndex?'active':'') + '" onclick="clickPlaylistItem(' + i + ')">' +
    '<span class="item-num">' + (i+1) + '</span>' +
    '<img class="item-thumb" src="' + t.thumbnail + '" alt="" loading="lazy"/>' +
    '<div class="item-info"><span class="item-title">' + t.title.replace(/</g,'&lt;') + '</span>' +
    (t.addedBy ? '<span class="item-by">' + t.addedBy + '</span>' : '') + '</div>' +
    '<button class="item-del" onclick="removeFromPlaylist(' + i + ',event)" title="Xoá">✕</button></li>'
  ).join('');
  const active = ul.querySelector('.active');
  if (active) active.scrollIntoView({ block:'nearest', behavior:'smooth' });
}

function clickPlaylistItem(idx) {
  if (idx === currentIndex) togglePlay();
  else { isFirstLoad = false; playTrack(idx); }
}

// ─── TABS (add song) ──────────────────────────────────────────
function switchTab(tab) {
  const isUrl = tab === 'url';
  document.getElementById('tab-url').classList.toggle('active', isUrl);
  document.getElementById('tab-search').classList.toggle('active', !isUrl);
  document.getElementById('panel-url').classList.toggle('hidden', !isUrl);
  document.getElementById('panel-search').classList.toggle('hidden', isUrl);
}

// ─── MODALS ───────────────────────────────────────────────────
function openRoomModal() {
  document.getElementById('modal-room').classList.remove('hidden');
  if (currentRoomCode) document.getElementById('current-room-section').classList.remove('hidden');
  loadActiveRooms();
}
function openAuthModal() { document.getElementById('modal-auth').classList.remove('hidden'); }
function openSettings() {
  document.getElementById('modal-settings').classList.remove('hidden');
  document.getElementById('api-key-input').value = localStorage.getItem('yt_api_key') || '';
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function saveApiKey() { localStorage.setItem('yt_api_key', document.getElementById('api-key-input').value.trim()); closeModal('modal-settings'); showToast('✅ Đã lưu API Key!'); }

// ─── AUTH ─────────────────────────────────────────────────────
function switchAuthTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('atab-login').classList.toggle('active', isLogin);
  document.getElementById('atab-register').classList.toggle('active', !isLogin);
  document.getElementById('auth-title').textContent = isLogin ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN';
  document.getElementById('auth-submit').textContent = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
  document.getElementById('auth-name').classList.toggle('hidden', isLogin);
  document.getElementById('auth-error').classList.add('hidden');
}

function submitAuth() {
  if (typeof firebase === 'undefined') { showToast('⚠️ Firebase chưa kết nối! Xem hướng dẫn README.md'); closeModal('modal-auth'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const errEl = document.getElementById('auth-error');
  if (!email || !pass) { errEl.textContent = 'Nhập đầy đủ email và mật khẩu'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  if (authMode === 'login') {
    firebase.auth().signInWithEmailAndPassword(email, pass)
      .then(() => { closeModal('modal-auth'); showToast('✅ Đăng nhập thành công!'); })
      .catch(e => { errEl.textContent = translateAuthError(e.code); errEl.classList.remove('hidden'); });
  } else {
    firebase.auth().createUserWithEmailAndPassword(email, pass)
      .then(cred => {
        const displayName = name || email.split('@')[0];
        return cred.user.updateProfile({ displayName }).then(() => {
          if (db) db.ref('users/' + cred.user.uid).set({ email, displayName, createdAt: firebase.database.ServerValue.TIMESTAMP });
          closeModal('modal-auth'); showToast('✅ Tạo tài khoản thành công!');
        });
      })
      .catch(e => { errEl.textContent = translateAuthError(e.code); errEl.classList.remove('hidden'); });
  }
}

function doLogout() {
  if (currentRoomId) leaveRoomCleanup();
  if (typeof firebase !== 'undefined') firebase.auth().signOut();
  switchPlaylistMode('shared');
}

function translateAuthError(code) {
  const map = { 'auth/user-not-found':'Email không tồn tại','auth/wrong-password':'Mật khẩu không đúng','auth/invalid-credential':'Email hoặc mật khẩu không đúng','auth/email-already-in-use':'Email đã được dùng','auth/weak-password':'Mật khẩu tối thiểu 6 ký tự','auth/invalid-email':'Email không hợp lệ','auth/too-many-requests':'Thử lại sau' };
  return map[code] || 'Lỗi: ' + code;
}

// ─── TOAST ────────────────────────────────────────────────────
let _tt = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── KEYBOARD ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  switch(e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': nextTrack(); break;
    case 'ArrowLeft': prevTrack(); break;
    case 'KeyS': toggleShuffle(); break;
    case 'KeyR': toggleRepeat(); break;
  }
});

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const vol = localStorage.getItem('vol') || '80';
  document.getElementById('volume-slider').value = vol;
  document.getElementById('volume-label').textContent = vol;
  if (ytReady) initFirebase();
});
