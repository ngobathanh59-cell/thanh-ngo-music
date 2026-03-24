# 🎵 MUSICROOM — Hướng dẫn cài đặt

## Cấu trúc file
```
musicroom/
├── index.html          ← Giao diện chính
├── style.css           ← Toàn bộ CSS/design
├── app.js              ← Logic: player, playlist, auth
├── firebase-config.js  ← Cấu hình Firebase (bạn điền vào)
└── README.md           ← File này
```

---

## BƯỚC 1 — Chạy thử ngay (không cần cài gì)

Chỉ cần **double-click vào `index.html`** để mở trong trình duyệt.

✅ Lúc này bạn đã có thể:
- Dán link YouTube để thêm bài hát
- Điều khiển play/pause/next/prev
- Shuffle và repeat playlist
- Dữ liệu lưu trong trình duyệt (localStorage)

❌ Chưa có:
- Tìm kiếm YouTube (cần API key)
- Đăng nhập / lưu playlist lên mây (cần Firebase)

---

## BƯỚC 2 — Bật tính năng Tìm kiếm YouTube

1. Vào: https://console.cloud.google.com
2. Tạo project mới (tên tùy ý)
3. Menu trái → "APIs & Services" → "Library"
4. Tìm "YouTube Data API v3" → Enable
5. Menu trái → "Credentials" → "Create Credentials" → "API key"
6. Copy API key đó
7. Mở website → nhấn **⚙️ Cài đặt** (góc phải header)
8. Dán API key vào ô → Lưu

> 💡 Miễn phí 10,000 lượt tìm kiếm/ngày — quá đủ dùng!

---

## BƯỚC 3 — Bật đăng nhập & lưu playlist lên mây (Firebase)

### 3.1 Tạo project Firebase

1. Vào: https://firebase.google.com → **Get started**
2. Đăng nhập bằng Gmail → **Add project**
3. Đặt tên project (ví dụ: `musicroom`) → Continue
4. **Tắt** Google Analytics → **Create project** → Continue

### 3.2 Tạo Web App

5. Nhấn biểu tượng **</>** (Web)
6. Đặt tên app (ví dụ: `musicroom-web`) → **Register app**
7. Bạn sẽ thấy đoạn code như sau — **copy phần `firebaseConfig`**:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "musicroom-abc.firebaseapp.com",
  projectId: "musicroom-abc",
  storageBucket: "musicroom-abc.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

8. Mở file `firebase-config.js` → **thay toàn bộ phần config** bằng config vừa copy
9. Nhấn Continue to console

### 3.3 Bật Authentication

10. Menu trái → **Authentication** → **Get started**
11. Tab **Sign-in method** → **Email/Password** → **Enable** → **Save**

### 3.4 Bật Firestore Database

12. Menu trái → **Firestore Database** → **Create database**
13. Chọn **"Start in test mode"** → **Next** → chọn region gần nhất → **Enable**

### 3.5 Kết nối vào website

14. Mở file `index.html` trong VS Code
15. Tìm 4 dòng cuối file có dấu `<!-- ... -->`
16. **Xoá dấu `<!--` và `-->`** để bỏ comment 4 dòng đó:

Trước:
```html
<!-- <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script> -->
<!-- <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script> -->
<!-- <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js"></script> -->
<!-- <script src="firebase-config.js"></script> -->
```

Sau:
```html
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js"></script>
<script src="firebase-config.js"></script>
```

✅ Xong! Reload lại trình duyệt là có thể đăng nhập/tạo tài khoản!

---

## BƯỚC 4 — Đưa website lên internet (Vercel)

1. Tải và cài **Git**: https://git-scm.com/downloads
2. Tạo tài khoản **GitHub**: https://github.com
3. Tạo tài khoản **Vercel**: https://vercel.com (đăng nhập bằng GitHub)

### Upload code lên GitHub

Mở terminal (hoặc VS Code terminal), chạy lần lượt:

```bash
cd đường-dẫn-tới-thư-mục-musicroom

git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/TÊN-BẠN/musicroom.git
git push -u origin main
```

### Deploy lên Vercel

4. Vào vercel.com → **New Project**
5. **Import** repo musicroom từ GitHub
6. Nhấn **Deploy**
7. Bạn nhận được link kiểu: `musicroom-abc.vercel.app` 🎉

---

## Phím tắt

| Phím | Chức năng |
|------|-----------|
| `Space` | Play / Pause |
| `→` | Bài tiếp theo |
| `←` | Bài trước đó |
| `S` | Bật/tắt Shuffle |
| `R` | Đổi chế độ Repeat |

---

## Nếu gặp vấn đề

**"Thêm link không được"** → Kiểm tra có phải link YouTube không (youtube.com hoặc youtu.be)

**"Tìm kiếm không hoạt động"** → Kiểm tra API key đã nhập chưa, và YouTube Data API v3 đã bật chưa

**"Đăng nhập không được"** → Kiểm tra đã bỏ comment 4 dòng Firebase trong index.html chưa, và firebase-config.js đã điền đúng chưa

**"Mở index.html trên Chrome bị lỗi CORS"** → Dùng VS Code + extension "Live Server" để chạy local
