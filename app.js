/* ================================================================
   MUSICROOM — app.js v4.0 (Final)

   HAI CHẾ ĐỘ:
   1. CÁ NHÂN — playlist lưu vào Firebase theo uid, chỉ mình thấy
   2. PHÒNG CHUNG — playlist chia sẻ realtime, mọi người cùng nghe

   KỸ THUẬT PLAYER (học từ phongnhacchung.fun):
   - autoplay: 0 khi khởi tạo (tránh browser block)
   - cueVideoById() — load bài đầu tiên, chờ người dùng click play
   - loadVideoById() — chuyển bài mới → tự phát luôn
   - videoEmbeddable=true khi tìm kiếm → tránh lỗi 101/150

   LÝ DO VIDEO BẢN QUYỀN PHÁT ĐƯỢC: Deploy HTTPS domain (Vercel)
   Không cần Invidious hay proxy. YouTube IFrame API thuần là đủ.
   ================================================================ */

// ─── MODE ────────────────────────────────────────────────────
const MODE = { PERSONAL: 'personal', ROOM: 'room' };
let currentMode = MODE.PERSONAL;
let currentRoomId = null;
let currentRoomCode = null;

// ─── TRẠNG THÁI PLAYER ───────────────────────────────────────
let ytPlayer      = null;
let ytReady       = false;
let isFirstLoad   = true;    // Flag xử lý load lần đầu
let playlist      = [];
let currentIndex  = -1;
let shuffleMode   = false;
let repeatMode    = 'none';  // 'none' | 'one' | 'all'
let isPlaying     = false;
let isManualChange = false;

// ─── USER ─────────────────────────────────────────────────────
let currentUser = null;
let authMode = 'login';

// ─── FIREBASE REFS ────────────────────────────────────────────
// Được khởi tạo sau khi Firebase load xong
let db = null;
let authInstance = null;
let personalPlaylistRef = null;
let roomRef = null;
let presenceRef = null;

// ─── YOUTUBE IFRAME API ───────────────────────────────────────
// Hàm này được YouTube gọi tự động khi script load xong
// COPY Y HỆT cách web gốc phongnhacchung.fun làm
function onYouTubeIframeAPIReady() {
  ytReady = true;
  ytPlayer = new YT.Player('player', {
    height: '100%',
    width:  '100%',
    videoId: '',
    playerVars: {
      autoplay:       0,    // QUAN TRỌNG: 0 khi init — giống web gốc
      controls:       1,
      rel:            0,
      fs:             1,
      modestbranding: 1,
      origin:         window.location.origin,
      enablejsapi:    1,
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    }
  });
}

function onPlayerReady(event) {
  document.getElementById('player-placeholder').style.display = 'none';
  const vol = parseInt(document.getElementById('volume-slider').value);
  event.target.setVolume(vol);

  // Khởi Firebase nếu đã load
  initFirebase();
}

function onPlayerStateChange(event) {
  const s = event.data;
  if (s === YT.PlayerState.PLAYING) {
    isPlaying = true;
    showPauseIcon();
  } else if (s === YT.PlayerState.PAUSED) {
    isPlaying = false;
    showPlayIcon();
  } else if (s === YT.PlayerState.ENDED) {
    isPlaying = false;
    handleVideoEnd();
  }
  updatePlayButton();
}

function onPlayerError(event) {
  const code = event.data;
  const msgs = {
    2:   'Link video không hợp lệ',
    5:   'Lỗi HTML5 player',
    100: 'Video không tồn tại hoặc đã bị xoá',
    101: 'Video không cho phép nhúng (deploy HTTPS để fix)',
    150: 'Video không cho phép nhúng (deploy HTTPS để fix)',
  };
  showToast('⚠️ ' + (msgs[code] || 'Lỗi player ' + code) + '. Thử bài tiếp...');
  if (!isManualChange) {
    isManualChange = true;
    setTimeout(() => { isManualChange = false; nextTrack(); }, 2000);
  }
}

function handleVideoEnd() {
  if (repeatMode === 'one') {
    ytPlayer.seekTo(0); ytPlayer.playVideo();
  } else {
    nextTrack();
  }
}

// ─── LOAD VIDEO — ĐÚNG KỸ THUẬT TỪ WEB GỐC ──────────────────
// Lần đầu dùng cueVideoById (không tự phát)
// Chuyển bài dùng loadVideoById (tự phát)
function cueFirstVideo(videoId) {
  if (!ytPlayer || !videoId) return;
  try {
    ytPlayer.cueVideoById(videoId);
  } catch(e) { console.warn('cue error', e); }
}

function loadAndPlayVideo(videoId) {
  if (!ytPlayer || !videoId) return;
  isManualChange = true;
  try {
    ytPlayer.loadVideoById(videoId);
  } catch(e) {
    console.warn('load error', e);
    isManualChange = false;
  }
  setTimeout(() => { isManualChange = false; }, 2000);
}

// ─── ĐIỀU KHIỂN PLAYER ───────────────────────────────────────
function playTrack(index) {
  if (index < 0 || index >= playlist.length) return;
  currentIndex = index;
  const track = playlist[index];

  document.getElementById('track-title').textContent = track.title;
  document.getElementById('track-index').textContent = (index+1) + ' / ' + playlist.length;

  if (isFirstLoad) {
    // Lần đầu: chỉ cue, không phát
    cueFirstVideo(track.videoId);
    isFirstLoad = false;
  } else {
    // Chuyển bài: load và phát
    loadAndPlayVideo(track.videoId);
  }

  // Nếu ở room mode, sync index lên Firebase
  if (currentMode === MODE.ROOM && roomRef && currentUser) {
    roomRef.child('settings').update({
      currentIndex: index,
      currentVideoId: track.videoId,
      lastUpdated: firebase.database.ServerValue.TIMESTAMP
    });
  }

  renderPlaylist();
}

function togglePlay() {
  if (!ytPlayer) return;
  try {
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else if (state === YT.PlayerState.PAUSED) {
      ytPlayer.playVideo();
    } else if (state === YT.PlayerState.CUED || state === YT.PlayerState.UNSTARTED) {
      // Video đã được cue sẵn → play luôn
      ytPlayer.playVideo();
    } else if (currentIndex >= 0) {
      loadAndPlayVideo(playlist[currentIndex].videoId);
    } else if (playlist.length > 0) {
      playTrack(0);
    }
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
      ytPlayer.stopVideo(); isPlaying = false; showPlayIcon(); return;
    }
  }
  playTrack(next);
}

function prevTrack() {
  if (!playlist.length) return;
  try {
    if (ytPlayer.getCurrentTime() > 3) { ytPlayer.seekTo(0); return; }
  } catch(e) {}
  const prev = (currentIndex - 1 + playlist.length) % playlist.length;
  playTrack(prev);
}

function setVolume(val) {
  document.getElementById('volume-label').textContent = val;
  if (ytPlayer) { try { ytPlayer.setVolume(parseInt(val)); } catch(e) {} }
  localStorage.setItem('vol', val);
}

function showPlayIcon()  { document.getElementById('icon-play').classList.remove('hidden'); document.getElementById('icon-pause').classList.add('hidden'); }
function showPauseIcon() { document.getElementById('icon-play').classList.add('hidden');    document.getElementById('icon-pause').classList.remove('hidden'); }
function updatePlayButton() {
  if (!ytPlayer) return;
  try {
    const playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    if (playing) showPauseIcon(); else showPlayIcon();
  } catch(e) {}
}

// ─── SHUFFLE & REPEAT ────────────────────────────────────────
function toggleShuffle() {
  shuffleMode = !shuffleMode;
  document.getElementById('btn-shuffle').classList.toggle('active', shuffleMode);
  showToast(shuffleMode ? '🔀 Shuffle bật' : 'Shuffle tắt');
}

function toggleRepeat() {
  const modes = ['none','one','all'];
  repeatMode = modes[(modes.indexOf(repeatMode)+1) % 3];
  const icons = { none: 'icon-loop-none', one: 'icon-loop-one', all: 'icon-loop-all' };
  Object.values(icons).forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(icons[repeatMode]).classList.remove('hidden');
  document.getElementById('btn-loop').classList.toggle('active', repeatMode !== 'none');
  const labels = { none:'Tắt lặp', one:'🔂 Lặp 1 bài', all:'🔁 Lặp tất cả' };
  showToast(labels[repeatMode]);
}

// ─── FIREBASE INIT ────────────────────────────────────────────
function initFirebase() {
  if (typeof firebase === 'undefined') return;
  try {
    db = firebase.database();
    authInstance = firebase.auth();

    authInstance.onAuthStateChanged(user => {
      currentUser = user;
      if (user) {
        document.getElementById('auth-btn').classList.add('hidden');
        document.getElementById('logout-btn').classList.remove('hidden');
        document.getElementById('user-label').textContent = user.displayName || user.email.split('@')[0];
        document.getElementById('user-label').classList.remove('hidden');

        // Restore volume
        const vol = localStorage.getItem('vol') || '80';
        document.getElementById('volume-slider').value = vol;
        document.getElementById('volume-label').textContent = vol;
        if (ytPlayer) ytPlayer.setVolume(parseInt(vol));

        // Load playlist cá nhân
        if (currentMode === MODE.PERSONAL) loadPersonalPlaylist();
      } else {
        document.getElementById('auth-btn').classList.remove('hidden');
        document.getElementById('logout-btn').classList.add('hidden');
        document.getElementById('user-label').classList.add('hidden');
      }
    });
  } catch(e) { console.error('Firebase init error:', e); }
}

// ─── CHẾ ĐỘ CÁ NHÂN ──────────────────────────────────────────
function loadPersonalPlaylist() {
  if (!db || !currentUser) return;
  personalPlaylistRef = db.ref('users/' + currentUser.uid + '/playlist');
  personalPlaylistRef.once('value').then(snap => {
    if (snap.exists() && Array.isArray(snap.val())) {
      playlist = snap.val();
      renderPlaylist();
      // Lần đầu load: cue bài đầu
      if (playlist.length > 0 && ytPlayer) {
        currentIndex = 0;
        isFirstLoad = true;
        document.getElementById('track-title').textContent = playlist[0].title;
        document.getElementById('track-index').textContent = '1 / ' + playlist.length;
        playTrack(0);
      }
    }
  }).catch(e => console.error('Load playlist error:', e));
}

function savePersonalPlaylist() {
  if (!db || !currentUser) {
    localStorage.setItem('musicroom_playlist', JSON.stringify(playlist));
    return;
  }
  db.ref('users/' + currentUser.uid + '/playlist').set(playlist)
    .then(() => {
      document.getElementById('sync-note').classList.remove('hidden');
      setTimeout(() => document.getElementById('sync-note').classList.add('hidden'), 3000);
    }).catch(e => console.error('Save error:', e));
}

// ─── CHẾ ĐỘ PHÒNG CHUNG ─────────────────────────────────────
function generateRoomCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function createRoom() {
  if (!currentUser) { showToast('Hãy đăng nhập trước!'); openAuthModal(); return; }
  const name = document.getElementById('room-name-input').value.trim();
  if (!name) { showToast('Nhập tên phòng!'); return; }
  if (!db) { showToast('⚠️ Firebase chưa kết nối'); return; }

  const code = generateRoomCode();
  const roomData = {
    name: name,
    code: code,
    creatorUid: currentUser.uid,
    creatorName: currentUser.displayName || currentUser.email.split('@')[0],
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    playlist: [],
    settings: { currentIndex: -1, currentVideoId: '' }
  };

  db.ref('rooms/' + code).set(roomData)
    .then(() => {
      showToast('✅ Đã tạo phòng: ' + code);
      enterRoom(code, name);
      closeModal('modal-room');
    })
    .catch(e => { console.error(e); showToast('Lỗi tạo phòng!', true); });
}

function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length < 4) { showToast('Nhập mã phòng hợp lệ!'); return; }
  if (!db) { showToast('⚠️ Firebase chưa kết nối'); return; }

  db.ref('rooms/' + code).once('value').then(snap => {
    if (!snap.exists()) { showToast('❌ Không tìm thấy phòng: ' + code); return; }
    enterRoom(code, snap.val().name);
    closeModal('modal-room');
  }).catch(e => showToast('Lỗi tham gia phòng!'));
}

function enterRoom(code, name) {
  // Rời phòng cũ nếu có
  if (currentRoomId) leaveRoomCleanup();

  currentMode = MODE.ROOM;
  currentRoomId = code;
  currentRoomCode = code;

  // Update UI mode
  document.getElementById('mode-badge').className = 'mode-badge mode-room';
  document.getElementById('mode-label').textContent = '🏠 ' + name;
  document.getElementById('room-viewers').classList.remove('hidden');
  document.getElementById('current-room-name').textContent = name;
  document.getElementById('current-room-code').textContent = code;
  document.getElementById('current-room-section').classList.remove('hidden');

  roomRef = db.ref('rooms/' + code);

  // Theo dõi playlist phòng realtime
  roomRef.child('playlist').on('value', snap => {
    const data = snap.val();
    if (data && typeof data === 'object') {
      playlist = Object.values(data).filter(s => s && s.videoId).sort((a,b) => (a.addedAt||0)-(b.addedAt||0));
    } else if (Array.isArray(data)) {
      playlist = data.filter(s => s && s.videoId);
    } else {
      playlist = [];
    }
    renderPlaylist();
  });

  // Theo dõi settings phòng (bài đang phát)
  roomRef.child('settings').on('value', snap => {
    if (!snap.exists() || isManualChange) return;
    const s = snap.val();
    if (s.currentVideoId && s.currentVideoId !== (playlist[currentIndex]?.videoId)) {
      const idx = playlist.findIndex(t => t.videoId === s.currentVideoId);
      if (idx !== -1 && idx !== currentIndex) {
        currentIndex = idx;
        document.getElementById('track-title').textContent = playlist[idx].title;
        document.getElementById('track-index').textContent = (idx+1) + ' / ' + playlist.length;
        loadAndPlayVideo(playlist[idx].videoId);
        renderPlaylist();
      }
    }
  });

  // Presence — đếm người xem
  const myPresenceRef = db.ref('rooms/' + code + '/presence/' + (currentUser?.uid || 'guest_' + Date.now()));
  myPresenceRef.set(true);
  myPresenceRef.onDisconnect().remove();
  db.ref('rooms/' + code + '/presence').on('value', snap => {
    const count = snap.numChildren();
    document.getElementById('viewer-count').textContent = count;
  });

  showToast('✅ Đã vào phòng: ' + name);
}

function leaveRoom() {
  leaveRoomCleanup();
  closeModal('modal-room');
  showToast('Đã rời phòng');
}

function leaveRoomCleanup() {
  if (!currentRoomId || !db) return;
  db.ref('rooms/' + currentRoomId + '/presence').off();
  db.ref('rooms/' + currentRoomId + '/playlist').off();
  db.ref('rooms/' + currentRoomId + '/settings').off();
  if (currentUser) db.ref('rooms/' + currentRoomId + '/presence/' + currentUser.uid).remove();

  currentMode = MODE.PERSONAL;
  currentRoomId = null;
  currentRoomCode = null;
  roomRef = null;

  document.getElementById('mode-badge').className = 'mode-badge mode-personal';
  document.getElementById('mode-label').textContent = 'Cá nhân';
  document.getElementById('room-viewers').classList.add('hidden');
  document.getElementById('current-room-section').classList.add('hidden');

  // Load lại playlist cá nhân
  if (currentUser) loadPersonalPlaylist();
}

function loadActiveRooms() {
  if (!db) return;
  const el = document.getElementById('active-rooms');
  db.ref('rooms').orderByChild('createdAt').limitToLast(10).once('value').then(snap => {
    el.innerHTML = '';
    if (!snap.exists()) { el.innerHTML = '<p class="empty-hint" style="padding:12px 0">Chưa có phòng nào.</p>'; return; }
    const rooms = [];
    snap.forEach(child => rooms.unshift({ code: child.key, ...child.val() }));
    rooms.forEach(room => {
      const div = document.createElement('div');
      div.className = 'room-item' + (room.code === currentRoomCode ? ' active-room' : '');
      div.innerHTML = `
        <div class="room-item-info">
          <span class="room-item-name">${room.name}</span>
          <span class="room-item-code">Mã: ${room.code}</span>
          <span class="room-item-creator">Tạo bởi: ${room.creatorName || 'Ẩn danh'}</span>
        </div>
        <button class="btn-accent" onclick="document.getElementById('room-code-input').value='${room.code}';joinRoom()">Vào</button>
      `;
      el.appendChild(div);
    });
  }).catch(() => { el.innerHTML = '<p class="empty-hint" style="padding:12px 0">Không tải được danh sách phòng.</p>'; });
}

// ─── THÊM BÀI BẰNG LINK ──────────────────────────────────────
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
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([^&\s]{11})/,
    /(?:youtu\.be\/)([^?\s]{11})/,
    /(?:youtube\.com\/embed\/)([^?\s]{11})/,
    /(?:youtube\.com\/shorts\/)([^?\s]{11})/,
  ];
  for (const r of patterns) { const m = url.match(r); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

async function fetchVideoInfo(videoId) {
  // Thử oEmbed trước (không cần API key)
  try {
    const res = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json');
    if (res.ok) {
      const d = await res.json();
      return { videoId, title: d.title, thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg', channel: d.author_name || '' };
    }
  } catch(e) {}
  return { videoId, title: 'Video ' + videoId, thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg', channel: '' };
}

// ─── TÌM KIẾM YOUTUBE ────────────────────────────────────────
async function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  const apiKey = localStorage.getItem('yt_api_key');
  if (!apiKey) { showToast('⚠️ Cần YouTube API Key trong ⚙️ Cài đặt'); openSettings(); return; }
  const el = document.getElementById('search-results');
  el.innerHTML = '<p class="search-status">Đang tìm kiếm...</p>';
  try {
    // videoEmbeddable=true — QUAN TRỌNG: chỉ lấy video được embed
    // Đây là cách web gốc tránh lỗi 101/150
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
      '&videoEmbeddable=true' +
      '&q=' + encodeURIComponent(query) +
      '&maxResults=8&key=' + apiKey
    );
    const data = await res.json();
    if (data.error) { el.innerHTML = '<p class="search-status error">Lỗi: ' + data.error.message + '</p>'; return; }
    renderSearchResults(data.items || []);
  } catch { el.innerHTML = '<p class="search-status error">Lỗi kết nối!</p>'; }
}

function renderSearchResults(items) {
  const el = document.getElementById('search-results');
  if (!items.length) { el.innerHTML = '<p class="search-status">Không tìm thấy.</p>'; return; }
  el.innerHTML = items.map(item => {
    const vid = item.id.videoId;
    const title = item.snippet.title;
    const thumb = item.snippet.thumbnails.default.url;
    const channel = item.snippet.channelTitle;
    const exists = playlist.find(t => t.videoId === vid);
    const safeTitle = title.replace(/"/g, '&quot;');
    const safeVid = vid;
    const safeThumb = thumb;
    const safeCh = (channel || '').replace(/'/g, '');
    const safeTitleAttr = title.replace(/'/g, '').replace(/"/g, '');
    const clickHandler = exists ? '' : ('addFromSearch(' + JSON.stringify(safeVid) + ',' + JSON.stringify(safeTitleAttr) + ',' + JSON.stringify(safeThumb) + ',' + JSON.stringify(safeCh) + ')');
    return '<div class="search-item ' + (exists ? 'search-item-exists' : '') + '" onclick="' + clickHandler + '">' +
      '<img class="search-thumb" src="' + thumb + '" alt="" loading="lazy"/>' +
      '<div class="search-item-info">' +
        '<span class="search-item-title">' + safeTitle + '</span>' +
        '<span class="search-item-channel">' + (channel || '') + '</span>' +
      '</div>' +
      '<span class="search-item-add">' + (exists ? '✓' : '+') + '</span>' +
    '</div>';
  }).join('');
}

function addFromSearch(videoId, title, thumbnail, channel) {
  addToPlaylist(videoId, title, thumbnail, channel);
}

// ─── QUẢN LÝ PLAYLIST ────────────────────────────────────────
function addToPlaylist(videoId, title, thumbnail, channel) {
  if (playlist.find(t => t.videoId === videoId)) { showToast('Bài này đã có rồi!'); return; }

  const track = {
    videoId, title,
    thumbnail: thumbnail || 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg',
    channel: channel || '',
    addedBy: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Ẩn danh',
    addedAt: Date.now(),
  };

  if (currentMode === MODE.ROOM && roomRef) {
    // Room: thêm vào Firebase realtime (playlist là object với key = videoId)
    roomRef.child('playlist/' + videoId).set(track)
      .then(() => showToast('✅ Đã thêm vào phòng: ' + title.slice(0,40)))
      .catch(() => showToast('Lỗi thêm bài!'));
    return; // Playlist sẽ được cập nhật qua listener
  }

  // Personal: thêm local rồi save
  playlist.push(track);
  renderPlaylist();
  savePersonalPlaylist();
  showToast('✅ Đã thêm: ' + title.slice(0,40));

  // Nếu bài đầu tiên → cue (không tự phát)
  if (playlist.length === 1) {
    currentIndex = 0;
    isFirstLoad = true;
    document.getElementById('track-title').textContent = title;
    document.getElementById('track-index').textContent = '1 / 1';
    playTrack(0);
  }
}

function removeFromPlaylist(idx, event) {
  event.stopPropagation();
  const track = playlist[idx];
  if (!track) return;

  if (currentMode === MODE.ROOM && roomRef) {
    roomRef.child('playlist/' + track.videoId).remove()
      .then(() => showToast('Đã xoá bài'))
      .catch(() => showToast('Lỗi xoá bài!'));
    return;
  }

  playlist.splice(idx, 1);
  if (currentIndex === idx) {
    try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
    isPlaying = false; showPlayIcon();
    currentIndex = -1;
    document.getElementById('track-title').textContent = '—';
    document.getElementById('track-index').textContent = '0 / 0';
    if (playlist.length > 0) playTrack(0);
    else document.getElementById('player-placeholder').style.display = 'flex';
  } else if (currentIndex > idx) {
    currentIndex--;
  }
  renderPlaylist();
  savePersonalPlaylist();
}

function clearPlaylist() {
  if (!playlist.length) return;
  if (!confirm('Xoá toàn bộ playlist?')) return;

  if (currentMode === MODE.ROOM && roomRef) {
    roomRef.child('playlist').remove();
    return;
  }

  try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
  playlist = []; currentIndex = -1; isPlaying = false;
  showPlayIcon();
  document.getElementById('track-title').textContent = '—';
  document.getElementById('track-index').textContent = '0 / 0';
  document.getElementById('player-placeholder').style.display = 'flex';
  renderPlaylist();
  savePersonalPlaylist();
}

function renderPlaylist() {
  const ul    = document.getElementById('playlist');
  const empty = document.getElementById('playlist-empty');
  document.getElementById('playlist-count').textContent = playlist.length;

  if (!playlist.length) { ul.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  ul.innerHTML = playlist.map((t, i) => `
    <li class="playlist-item ${i === currentIndex ? 'active' : ''}" onclick="clickPlaylistItem(${i})">
      <span class="item-num">${i+1}</span>
      <img class="item-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="item-info">
        <span class="item-title">${t.title}</span>
        ${t.addedBy ? `<span class="item-by">${t.addedBy}</span>` : ''}
      </div>
      <button class="item-del" onclick="removeFromPlaylist(${i},event)" title="Xoá">✕</button>
    </li>
  `).join('');

  const active = ul.querySelector('.active');
  if (active) active.scrollIntoView({ block:'nearest', behavior:'smooth' });
}

function clickPlaylistItem(idx) {
  if (idx === currentIndex) {
    togglePlay();
  } else {
    isFirstLoad = false; // Đảm bảo chuyển bài thì load+play
    playTrack(idx);
  }
}

// ─── TABS ─────────────────────────────────────────────────────
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
  if (currentRoomCode) {
    document.getElementById('current-room-section').classList.remove('hidden');
  }
  loadActiveRooms();
}
function openAuthModal() { document.getElementById('modal-auth').classList.remove('hidden'); }
function openSettings() {
  document.getElementById('modal-settings').classList.remove('hidden');
  document.getElementById('api-key-input').value = localStorage.getItem('yt_api_key') || '';
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function saveApiKey() {
  localStorage.setItem('yt_api_key', document.getElementById('api-key-input').value.trim());
  closeModal('modal-settings'); showToast('✅ Đã lưu API Key!');
}

// ─── AUTH ─────────────────────────────────────────────────────
function switchAuthTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('atab-login').classList.toggle('active', isLogin);
  document.getElementById('atab-register').classList.toggle('active', !isLogin);
  document.getElementById('auth-title').textContent = isLogin ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN';
  document.getElementById('auth-submit').textContent  = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
  document.getElementById('auth-name').classList.toggle('hidden', isLogin);
  document.getElementById('auth-error').classList.add('hidden');
}

function submitAuth() {
  if (typeof firebase === 'undefined') { showToast('⚠️ Chưa cài Firebase. Xem README.md'); closeModal('modal-auth'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  const name  = document.getElementById('auth-name').value.trim();
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
          // Lưu user vào db
          if (db) db.ref('users/' + cred.user.uid).set({ email, displayName, createdAt: firebase.database.ServerValue.TIMESTAMP });
          closeModal('modal-auth');
          showToast('✅ Tạo tài khoản thành công!');
        });
      })
      .catch(e => { errEl.textContent = translateAuthError(e.code); errEl.classList.remove('hidden'); });
  }
}

function doLogout() {
  if (currentRoomId) leaveRoomCleanup();
  if (typeof firebase !== 'undefined') firebase.auth().signOut();
  playlist = []; currentIndex = -1; isPlaying = false;
  showPlayIcon();
  document.getElementById('track-title').textContent = '—';
  document.getElementById('track-index').textContent = '0 / 0';
  renderPlaylist();
  try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
  document.getElementById('player-placeholder').style.display = 'flex';
}

function translateAuthError(code) {
  const map = {
    'auth/user-not-found':       'Email không tồn tại',
    'auth/wrong-password':       'Mật khẩu không đúng',
    'auth/invalid-credential':   'Email hoặc mật khẩu không đúng',
    'auth/email-already-in-use': 'Email đã được dùng',
    'auth/weak-password':        'Mật khẩu tối thiểu 6 ký tự',
    'auth/invalid-email':        'Email không hợp lệ',
    'auth/too-many-requests':    'Thử lại sau',
  };
  return map[code] || 'Lỗi: ' + code;
}

// ─── TOAST ────────────────────────────────────────────────────
let _tt = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── PHÍM TẮT ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  switch(e.code) {
    case 'Space':      e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': nextTrack(); break;
    case 'ArrowLeft':  prevTrack(); break;
    case 'KeyS':       toggleShuffle(); break;
    case 'KeyR':       toggleRepeat(); break;
  }
});

// ─── KHỞI ĐỘNG ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Restore volume
  const vol = localStorage.getItem('vol') || '80';
  document.getElementById('volume-slider').value = vol;
  document.getElementById('volume-label').textContent = vol;

  // Load playlist local nếu chưa có Firebase
  try {
    const saved = localStorage.getItem('musicroom_playlist');
    if (saved) { playlist = JSON.parse(saved); renderPlaylist(); }
  } catch(e) {}

  // Firebase sẽ được init trong onPlayerReady sau khi YT API load xong
  // Nếu YT API đã ready trước DOMContentLoaded thì init luôn
  if (ytReady) initFirebase();
});
