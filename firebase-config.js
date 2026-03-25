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
  apiKey:            "THAY-BANG-API-KEY",
  authDomain:        "TEN-PROJECT.firebaseapp.com",
  databaseURL:       "https://TEN-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "TEN-PROJECT",
  storageBucket:     "TEN-PROJECT.appspot.com",
  messagingSenderId: "SO-SENDER-ID",
  appId:             "APP-ID"
};

firebase.initializeApp(firebaseConfig);
