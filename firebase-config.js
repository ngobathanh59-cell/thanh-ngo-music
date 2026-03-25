/* ================================================================
   firebase-config.js — Firebase Realtime Database v8

   HƯỚNG DẪN SETUP:

   1. Vào https://firebase.google.com → Add project
   2. Đặt tên → tắt Analytics → Create
   3. Nhấn </> (Web) → đặt tên app → Register
   4. Copy firebaseConfig → dán vào bên dưới

   5. BẬT AUTHENTICATION:
      Authentication → Get started → Email/Password → Enable → Save

   6. BẬT REALTIME DATABASE:
      Realtime Database → Create database → Test mode → Enable

   7. DATABASE RULES — Vào tab Rules, thay bằng:
   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "$uid === auth.uid",
           ".write": "$uid === auth.uid"
         }
       },
       "rooms": {
         ".read": true,
         "$roomCode": {
           ".write": true,
           "playlist": { ".write": true },
           "settings": { ".write": true },
           "presence": { ".write": true }
         }
       }
     }
   }

   8. Mở index.html → bỏ comment 4 dòng Firebase scripts

   LƯU Ý: databaseURL bắt buộc có — lấy trong Firebase Console
   → Realtime Database → Data → copy link ở trên
   ================================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBb-MPbaInOuCp7oMjMRrUFwVyfNtq-MpY",
  authDomain: "thanhngo-music.firebaseapp.com",
  projectId: "thanhngo-music",
  storageBucket: "thanhngo-music.firebasestorage.app",
  messagingSenderId: "330285723909",
  appId: "1:330285723909:web:5684901e95527c2f1ec76c",
  measurementId: "G-8BKG87VM5M"
};

firebase.initializeApp(firebaseConfig);
