/* ============================================================
   MUSICROOM — app.js
   
   Cách hoạt động: ĐÚNG theo web gốc phongnhacchung.fun
   - Dùng YouTube IFrame API: YT.Player('player', {...})
   - Target div#player bằng STRING ID (không phải DOM element)
   - autoplay: 1, enablejsapi: 1
   - Firebase Realtime Database v8 cho auth + playlist
   
   Lý do web gốc phát được video bản quyền:
   - Deploy trên HTTPS domain → YouTube tin tưởng hơn localhost
   - Trên localhost nhiều video bị chặn nhưng trên Vercel thì OK
   ============================================================ */

// ─── TRẠNG THÁI ──────────────────────────────────────────────
let playlist    = [];
let currentIdx  = -1;
let shuffleOn   = false;
let repeatMode  = 0;        // 0=tắt, 1=lặp 1 bài, 2=lặp tất cả
let shuffleOrder = [];
let ytPlayer    = null;     // YT.Player instance
let ytReady     = false;    // API đã sẵn sàng chưa
let isPlaying   = false;
let authMode    = 'login';
let currentUser = null;

// ─── YOUTUBE IFRAME API ───────────────────────────────────────
// Hàm này được YouTube gọi tự động khi script iframe_api load xong
// GIỐNG HỆT web gốc
function onYouTubeIframeAPIReady() {
  ytReady = true;

  // Tạo player target vào div#player — ĐÚNG theo web gốc
  ytPlayer = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: {
      autoplay: 1,          // Tự phát — giống web gốc
      controls: 1,          // Hiện controls của YouTube
      rel: 0,               // Không hiện video liên quan
      modestbranding: 1,    // Ẩn logo YouTube bớt
      enablejsapi: 1,       // Bắt buộc để điều khiển qua JS
      playsinline: 1,       // Phát inline trên iOS
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    }
  });
}

function onPlayerReady(event) {
  // Ẩn placeholder khi player sẵn sàng
  document.getElementById('player-placeholder').style.display = 'none';
  // Set âm lượng ban đầu
  const vol = parseInt(document.getElementById('volume-slider').value);
  event.target.setVolume(vol);
}

function onPlayerStateChange(event) {
  const state = event.data;
  // YT.PlayerState: ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5
  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
    showPauseIcon();
    document.getElementById('player-placeholder').style.display = 'none';
  } else if (state === YT.PlayerState.PAUSED) {
    isPlaying = false;
    showPlayIcon();
  } else if (state === YT.PlayerState.ENDED) {
    isPlaying = false;
    handleTrackEnd();
  }
}

function onPlayerError(event) {
  // Mã lỗi YouTube:
  // 2  = videoId không hợp lệ
  // 5  = lỗi HTML5 player
  // 100 = video không tồn tại / bị xoá
  // 101, 150 = video bị chặn embed (bản quyền)
  const code = event.data;
  console.warn('YouTube player error:', code);

  if (code === 101 || code === 150) {
    // Bị chặn embed — thường chỉ xảy ra trên localhost
    // Trên domain HTTPS thật (Vercel) video sẽ phát bình thường
    showToast('⚠️ Video bị chặn trên localhost. Hãy deploy lên Vercel để xem!');
    updateTrackTitle('⚠️ ' + (playlist[currentIdx]?.title || 'Không thể phát'));
  } else if (code === 100) {
    showToast('❌ Video không tồn tại hoặc đã bị xoá');
    setTimeout(() => nextTrack(), 1500);
  } else if (code === 2) {
    showToast('❌ Link không hợp lệ');
  }
}

function handleTrackEnd() {
  if (repeatMode === 1) {
    // Lặp 1 bài: phát lại từ đầu
    ytPlayer.seekTo(0);
    ytPlayer.playVideo();
  } else if (repeatMode === 2) {
    // Lặp toàn bộ: next (sẽ quay lại đầu khi hết)
    nextTrack();
  } else if (currentIdx < playlist.length - 1) {
    // Còn bài tiếp → tự động next
    nextTrack();
  } else {
    showPlayIcon();
  }
}

// ─── ĐIỀU KHIỂN PLAYER ───────────────────────────────────────
function playTrack(idx) {
  if (idx < 0 || idx >= playlist.length) return;
  currentIdx = idx;
  const track = playlist[idx];

  updateTrackTitle(track.title);
  document.getElementById('track-index').textContent = (idx + 1) + ' / ' + playlist.length;
  document.getElementById('track-source').classList.add('hidden');

  if (!ytReady || !ytPlayer) {
    // API chưa load xong, thử lại sau 500ms
    setTimeout(() => playTrack(idx), 500);
    return;
  }

  // Load và phát video — cách này GIỐNG web gốc
  ytPlayer.loadVideoById(track.videoId);
  document.getElementById('player-placeholder').style.display = 'none';
  renderPlaylist();
}

function updateTrackTitle(title) {
  document.getElementById('track-title').textContent = title;
}

function togglePlay() {
  if (!ytPlayer || currentIdx < 0) return;
  try {
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  } catch(e) {
    console.log('Player chưa sẵn sàng');
  }
}

function nextTrack() {
  if (!playlist.length) return;
  if (shuffleOn) {
    const pos = shuffleOrder.indexOf(currentIdx);
    if (pos < shuffleOrder.length - 1) playTrack(shuffleOrder[pos + 1]);
    else if (repeatMode === 2) { buildShuffleOrder(); playTrack(shuffleOrder[0]); }
  } else {
    if (currentIdx < playlist.length - 1) playTrack(currentIdx + 1);
    else if (repeatMode === 2) playTrack(0);
    else showPlayIcon();
  }
}

function prevTrack() {
  if (!playlist.length) return;
  // Nếu đã phát >3 giây thì restart, không thì previous
  try {
    if (ytPlayer && ytPlayer.getCurrentTime() > 3) {
      ytPlayer.seekTo(0);
      return;
    }
  } catch(e) {}

  if (shuffleOn) {
    const pos = shuffleOrder.indexOf(currentIdx);
    if (pos > 0) playTrack(shuffleOrder[pos - 1]);
  } else {
    if (currentIdx > 0) playTrack(currentIdx - 1);
    else if (repeatMode === 2) playTrack(playlist.length - 1);
  }
}

function setVolume(val) {
  document.getElementById('volume-label').textContent = val;
  if (ytPlayer) {
    try { ytPlayer.setVolume(parseInt(val)); } catch(e) {}
  }
}

function showPlayIcon() {
  document.getElementById('icon-play').classList.remove('hidden');
  document.getElementById('icon-pause').classList.add('hidden');
}
function showPauseIcon() {
  document.getElementById('icon-play').classList.add('hidden');
  document.getElementById('icon-pause').classList.remove('hidden');
}

// ─── SHUFFLE ─────────────────────────────────────────────────
function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById('btn-shuffle').classList.toggle('active', shuffleOn);
  if (shuffleOn) buildShuffleOrder();
  showToast(shuffleOn ? '🔀 Shuffle bật' : 'Shuffle tắt');
}

function buildShuffleOrder() {
  const arr = Array.from({ length: playlist.length }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Đưa bài đang phát lên đầu
  if (currentIdx >= 0) {
    const p = arr.indexOf(currentIdx);
    if (p > 0) { arr.splice(p, 1); arr.unshift(currentIdx); }
  }
  shuffleOrder = arr;
}

// ─── REPEAT — 3 trạng thái như web gốc ───────────────────────
function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  const btn = document.getElementById('btn-loop');
  const icons = {
    none: document.getElementById('icon-loop-none'),
    one:  document.getElementById('icon-loop-one'),
    all:  document.getElementById('icon-loop-all'),
  };

  // Ẩn tất cả trước
  Object.values(icons).forEach(i => i.classList.add('hidden'));

  if (repeatMode === 0) {
    btn.classList.remove('active');
    icons.none.classList.remove('hidden');
    showToast('Tắt lặp');
  } else if (repeatMode === 1) {
    btn.classList.add('active');
    icons.one.classList.remove('hidden');
    showToast('🔂 Lặp một bài');
  } else {
    btn.classList.add('active');
    icons.all.classList.remove('hidden');
    showToast('🔁 Lặp toàn bộ');
  }
}

// ─── THÊM BÀI BẰNG LINK ──────────────────────────────────────
async function addByUrl() {
  const input = document.getElementById('url-input');
  const raw = input.value.trim();
  if (!raw) return;

  const videoId = extractVideoId(raw);
  if (!videoId) { showToast('❌ Link không hợp lệ!'); return; }

  showToast('⏳ Đang lấy thông tin...');
  const info = await fetchVideoInfo(videoId);
  input.value = '';
  addToPlaylist(info.videoId, info.title, info.thumbnail);
}

// Trích xuất videoId từ mọi dạng URL YouTube
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([^&\s]{11})/,
    /(?:youtu\.be\/)([^?\s]{11})/,
    /(?:youtube\.com\/embed\/)([^?\s]{11})/,
    /(?:youtube\.com\/shorts\/)([^?\s]{11})/,
  ];
  for (const r of patterns) {
    const m = url.match(r);
    if (m) return m[1];
  }
  // Nếu paste thẳng videoId
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

// Lấy thông tin video qua oEmbed — không cần API key
async function fetchVideoInfo(videoId) {
  try {
    const res = await fetch(
      'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json'
    );
    if (!res.ok) throw new Error('oEmbed failed');
    const data = await res.json();
    return {
      videoId,
      title:     data.title,
      thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg',
    };
  } catch {
    return {
      videoId,
      title:     'Video ' + videoId,
      thumbnail: 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg',
    };
  }
}

// ─── TÌM KIẾM YOUTUBE ────────────────────────────────────────
async function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const apiKey = localStorage.getItem('yt_api_key');
  if (!apiKey) {
    showToast('⚠️ Cần YouTube API Key để tìm kiếm. Mở ⚙️ Cài đặt!');
    openSettings();
    return;
  }

  const el = document.getElementById('search-results');
  el.innerHTML = '<p class="search-status">Đang tìm kiếm...</p>';

  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=' +
      encodeURIComponent(query) + '&key=' + apiKey + '&maxResults=8'
    );
    const data = await res.json();
    if (data.error) {
      el.innerHTML = '<p class="search-status error">Lỗi: ' + data.error.message + '</p>';
      return;
    }
    renderSearchResults(data.items || []);
  } catch {
    el.innerHTML = '<p class="search-status error">Lỗi kết nối. Thử lại sau!</p>';
  }
}

function renderSearchResults(items) {
  const el = document.getElementById('search-results');
  if (!items.length) {
    el.innerHTML = '<p class="search-status">Không tìm thấy kết quả.</p>';
    return;
  }
  el.innerHTML = items.map(item => {
    const vid   = item.id.videoId;
    const title = item.snippet.title;
    const thumb = item.snippet.thumbnails.default.url;
    const safe  = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<div class="search-item" onclick="addFromSearch('${vid}','${safe}','${thumb}')">
      <img class="search-thumb" src="${thumb}" alt="" loading="lazy" />
      <span class="search-item-title">${title}</span>
      <span class="search-item-add">+</span>
    </div>`;
  }).join('');
}

function addFromSearch(videoId, title, thumbnail) {
  addToPlaylist(videoId, title, thumbnail);
  showToast('✅ Đã thêm: ' + title.slice(0, 40));
}

// ─── QUẢN LÝ PLAYLIST ────────────────────────────────────────
function addToPlaylist(videoId, title, thumbnail) {
  if (playlist.find(t => t.videoId === videoId)) {
    showToast('Bài này đã có trong playlist!');
    return;
  }
  playlist.push({ videoId, title, thumbnail });
  renderPlaylist();
  savePlaylist();
  showToast('✅ Đã thêm: ' + title.slice(0, 40));

  // Nếu là bài đầu tiên → tự phát
  if (playlist.length === 1) playTrack(0);
}

function removeFromPlaylist(idx, event) {
  event.stopPropagation();
  playlist.splice(idx, 1);

  if (currentIdx === idx) {
    // Bài đang phát bị xoá
    try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
    isPlaying = false;
    showPlayIcon();
    currentIdx = -1;
    updateTrackTitle('—');
    document.getElementById('track-index').textContent = '0 / 0';
    if (playlist.length === 0) {
      document.getElementById('player-placeholder').style.display = 'flex';
    } else {
      playTrack(0);
    }
  } else if (currentIdx > idx) {
    currentIdx--;
  }

  renderPlaylist();
  savePlaylist();
  if (shuffleOn) buildShuffleOrder();
}

function clearPlaylist() {
  if (!playlist.length) return;
  if (!confirm('Xoá toàn bộ playlist?')) return;
  try { ytPlayer && ytPlayer.stopVideo(); } catch(e) {}
  playlist = [];
  currentIdx = -1;
  isPlaying = false;
  showPlayIcon();
  updateTrackTitle('—');
  document.getElementById('track-index').textContent = '0 / 0';
  document.getElementById('player-placeholder').style.display = 'flex';
  renderPlaylist();
  savePlaylist();
}

function renderPlaylist() {
  const ul    = document.getElementById('playlist');
  const empty = document.getElementById('playlist-empty');
  document.getElementById('playlist-count').textContent = playlist.length;

  if (!playlist.length) {
    ul.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  ul.innerHTML = playlist.map((t, i) => `
    <li class="playlist-item ${i === currentIdx ? 'active' : ''}" onclick="playTrack(${i})">
      <span class="item-num">${i + 1}</span>
      <img class="item-thumb" src="${t.thumbnail}" alt="" loading="lazy" />
      <span class="item-title">${t.title}</span>
      <button class="item-del" onclick="removeFromPlaylist(${i},event)" title="Xoá">✕</button>
    </li>
  `).join('');

  // Cuộn tới bài đang phát
  const active = ul.querySelector('.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ─── LƯU / TẢI PLAYLIST ──────────────────────────────────────
function savePlaylist() {
  localStorage.setItem('musicroom_playlist', JSON.stringify(playlist));
  // Nếu đã kết nối Firebase → sync
  if (currentUser && typeof firebase !== 'undefined') syncToFirebase();
}

function loadPlaylist() {
  try {
    const saved = localStorage.getItem('musicroom_playlist');
    if (saved) {
      playlist = JSON.parse(saved);
      renderPlaylist();
    }
  } catch { playlist = []; }
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
function openAuthModal() { document.getElementById('modal-auth').classList.remove('hidden'); }
function openSettings() {
  document.getElementById('modal-settings').classList.remove('hidden');
  document.getElementById('api-key-input').value = localStorage.getItem('yt_api_key') || '';
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function saveApiKey() {
  localStorage.setItem('yt_api_key', document.getElementById('api-key-input').value.trim());
  closeModal('modal-settings');
  showToast('✅ Đã lưu API Key!');
}
function switchAuthTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('atab-login').classList.toggle('active', isLogin);
  document.getElementById('atab-register').classList.toggle('active', !isLogin);
  document.getElementById('auth-title').textContent = isLogin ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN';
  document.getElementById('auth-submit').textContent = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
  document.getElementById('auth-error').classList.add('hidden');
}

// ─── FIREBASE AUTH (Realtime Database v8 — giống web gốc) ─────
function submitAuth() {
  if (typeof firebase === 'undefined') {
    showToast('⚠️ Chưa cài Firebase. Xem hướng dẫn trong README.md');
    closeModal('modal-auth');
    return;
  }
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');

  if (!email || !password) {
    errEl.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const promise = authMode === 'login'
    ? firebase.auth().signInWithEmailAndPassword(email, password)
    : firebase.auth().createUserWithEmailAndPassword(email, password);

  promise
    .then(() => { closeModal('modal-auth'); showToast('✅ Đăng nhập thành công!'); })
    .catch(err => {
      errEl.textContent = translateAuthError(err.code);
      errEl.classList.remove('hidden');
    });
}

function logout() {
  if (typeof firebase === 'undefined') return;
  firebase.auth().signOut().then(() => showToast('Đã đăng xuất'));
}

function translateAuthError(code) {
  const map = {
    'auth/user-not-found':       'Email không tồn tại',
    'auth/wrong-password':       'Mật khẩu không đúng',
    'auth/email-already-in-use': 'Email đã được sử dụng',
    'auth/weak-password':        'Mật khẩu phải có ít nhất 6 ký tự',
    'auth/invalid-email':        'Email không hợp lệ',
    'auth/too-many-requests':    'Quá nhiều lần thử. Hãy thử lại sau',
    'auth/invalid-credential':   'Email hoặc mật khẩu không đúng',
  };
  return map[code] || 'Lỗi: ' + code;
}

function initFirebaseAuth() {
  if (typeof firebase === 'undefined') return;

  firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      document.getElementById('auth-btn').classList.add('hidden');
      document.getElementById('logout-btn').classList.remove('hidden');
      document.getElementById('user-label').textContent = user.displayName || user.email;
      document.getElementById('user-label').classList.remove('hidden');
      loadFromFirebase();
    } else {
      document.getElementById('auth-btn').classList.remove('hidden');
      document.getElementById('logout-btn').classList.add('hidden');
      document.getElementById('user-label').classList.add('hidden');
      document.getElementById('sync-note').classList.add('hidden');
    }
  });
}

// Firebase Realtime Database — giống web gốc (dùng rtdb thay vì Firestore)
function syncToFirebase() {
  if (!currentUser || typeof firebase === 'undefined') return;
  const db = firebase.database();
  db.ref('users/' + currentUser.uid + '/playlist').set(playlist)
    .then(() => document.getElementById('sync-note').classList.remove('hidden'))
    .catch(e => console.error('Sync lỗi:', e));
}

function loadFromFirebase() {
  if (!currentUser || typeof firebase === 'undefined') return;
  const db = firebase.database();
  db.ref('users/' + currentUser.uid + '/playlist').once('value')
    .then(snapshot => {
      const data = snapshot.val();
      if (data && Array.isArray(data)) {
        playlist = data;
        renderPlaylist();
        localStorage.setItem('musicroom_playlist', JSON.stringify(playlist));
        document.getElementById('sync-note').classList.remove('hidden');
      }
    })
    .catch(e => console.error('Load Firebase lỗi:', e));
}

// ─── TOAST ────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── PHÍM TẮT — giống web gốc ────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  switch(e.code) {
    case 'Space':       e.preventDefault(); togglePlay(); break;
    case 'ArrowRight':  nextTrack(); break;
    case 'ArrowLeft':   prevTrack(); break;
    case 'KeyS':        toggleShuffle(); break;
    case 'KeyR':        toggleRepeat(); break;
  }
});

// ─── KHỞI ĐỘNG ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadPlaylist();
  initFirebaseAuth();
});
