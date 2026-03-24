/* ============================================================
   firebase-config.js
   
   Dùng Firebase Realtime Database v8 — GIỐNG web gốc phongnhacchung.fun
   (Không phải Firestore)
   
   HƯỚNG DẪN SETUP (làm 1 lần):
   
   1. Vào: https://firebase.google.com
   2. Đăng nhập → "Add project" → đặt tên → tắt Analytics → Create
   3. Nhấn biểu tượng </> (Web) → đặt tên app → Register
   4. COPY đoạn firebaseConfig → DÁN vào file này bên dưới
   
   5. BẬT AUTHENTICATION:
      Firebase Console → Authentication → Get started
      → Sign-in method → Email/Password → Enable → Save
   
   6. BẬT REALTIME DATABASE (khác với Firestore!):
      Firebase Console → Realtime Database → Create database
      → Start in TEST mode → Enable
      
      Sau đó vào tab "Rules" và thay bằng:
      {
        "rules": {
          "users": {
            "$uid": {
              ".read": "$uid === auth.uid",
              ".write": "$uid === auth.uid"
            }
          }
        }
      }
   
   7. Mở index.html → bỏ comment 4 dòng Firebase scripts:
      Xoá <!-- và --> xung quanh 4 dòng script Firebase
   ============================================================ */

// THAY đoạn này bằng config của bạn từ Firebase Console:
const firebaseConfig = {
  apiKey: "AIzaSyBb-MPbaInOuCp7oMjMRrUFwVyfNtq-MpY",
  authDomain: "thanhngo-music.firebaseapp.com",
  projectId: "thanhngo-music",
  storageBucket: "thanhngo-music.firebasestorage.app",
  messagingSenderId: "330285723909",
  appId: "1:330285723909:web:5684901e95527c2f1ec76c",
  measurementId: "G-8BKG87VM5M"
};
// Khởi động Firebase v8
firebase.initializeApp(firebaseConfig);
