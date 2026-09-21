// عبّي القيم التالية من Firebase Console:
// المشروع الخاص بك ← أيقونة الترس (Project settings) ← عام (General)
// ← قسم "تطبيقاتك" (Your apps) ← اختاري تطبيق الويب (</>) وانسخي القيم من "SDK setup and configuration"

export const firebaseConfig = {
  apiKey: "AIzaSyA9wxWb7gOOqwDlVvsmYc6hbSe-ZQ96rPA",
  authDomain: "peerup-f26d9.firebaseapp.com",
  projectId: "peerup-f26d9",
  storageBucket: "peerup-f26d9.firebasestorage.app",
  messagingSenderId: "336049557596",
  appId: "1:336049557596:web:1716bd531744170336d699",
};

// رمز تفعيل المعلمات التجريبي — هذا فقط مرجع للتذكير، الرمز الحقيقي
// المُعتمَد في التحقق موجود داخل مستند Firestore: config/teacherCode
// (راجعي README.md لطريقة إنشائه). لا تعتمدي على القيمة هنا للأمان.
export const TEACHER_CODE_HINT = "PEERUP-TCH-2026";
