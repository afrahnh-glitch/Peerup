import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/* ---------- Firebase init ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- state ---------- */
const state = {
  view: 'loading',      // loading | landing | authForm | dashboard
  role: null,            // 'student' | 'teacher'
  mode: 'login',         // 'login' | 'signup'
  loading: false,
  error: '',
  success: '',
  profile: null,         // {uid, role, displayName, email, points}
};

function setState(patch){ Object.assign(state, patch); render(); }

/* ---------- Arabic error messages ---------- */
function mapAuthError(err){
  const code = err && err.code ? err.code : '';
  const map = {
    'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم بالفعل. جرّبي تسجيل الدخول بدلًا من إنشاء حساب.',
    'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
    'auth/weak-password': 'كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/too-many-requests': 'محاولات كثيرة متتالية، حاولي مرة أخرى بعد قليل.',
    'permission-denied': 'رمز المعلمات غير صحيح. تأكدي من الرمز وحاولي مرة أخرى.',
  };
  return map[code] || 'صار خطأ غير متوقع، حاولي مرة أخرى.';
}

/* ---------- auth actions ---------- */
async function handleSignup({role, displayName, email, password, teacherCode}){
  setState({loading:true, error:'', success:''});
  let cred;
  try{
    cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, {displayName});

    const payload = {
      uid: cred.user.uid,
      role,
      displayName,
      email,
      points: 0,
      createdAt: serverTimestamp(),
    };
    if(role === 'teacher'){
      payload.activationCode = teacherCode;
    }
    await setDoc(doc(db, 'users', cred.user.uid), payload);

    setState({loading:false, success: role==='teacher' ? 'تم تفعيل حساب المعلمة بنجاح ✅' : 'تم إنشاء حسابك بنجاح 🎉'});
    await loadProfileAndGo(cred.user.uid);
  }catch(err){
    // لو فشل إنشاء ملف Firestore (مثلًا رمز معلمات خاطئ) نحذف حساب الدخول
    // اللي انشأ توًا حتى تقدر الطالبة تعيد المحاولة بنفس البريد.
    if(cred && cred.user){
      try{ await cred.user.delete(); }catch(_e){ await signOut(auth); }
    }
    setState({loading:false, error: mapAuthError(err)});
  }
}

async function handleLogin({email, password}){
  setState({loading:true, error:'', success:''});
  try{
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await loadProfileAndGo(cred.user.uid);
  }catch(err){
    setState({loading:false, error: mapAuthError(err)});
  }
}

async function loadProfileAndGo(uid){
  const snap = await getDoc(doc(db, 'users', uid));
  if(!snap.exists()){
    setState({loading:false, error:'تعذّر إيجاد ملف الحساب. حاولي تسجيل الدخول مرة أخرى.'});
    await signOut(auth);
    return;
  }
  setState({loading:false, profile: snap.data(), view:'dashboard'});
}

async function handleLogout(){
  await signOut(auth);
  setState({view:'landing', role:null, mode:'login', profile:null, error:'', success:''});
}

/* ---------- keep session on reload ---------- */
onAuthStateChanged(auth, async (user) => {
  if(user && state.view === 'loading'){
    await loadProfileAndGo(user.uid);
    if(state.view === 'loading') setState({view:'landing'});
  } else if(!user && state.view !== 'landing' && state.view !== 'authForm'){
    setState({view:'landing'});
  } else if(state.view === 'loading'){
    setState({view:'landing'});
  }
});

/* ---------- render ---------- */
function brandHeader(sub){
  return `
  <div class="brand-center">
    <div class="brand-mark">P</div>
    <div class="bname">PeerUp</div>
    <div class="tag">نرتقي معًا</div>
    ${sub ? `<div class="slogan">${sub}</div>` : ''}
  </div>`;
}

function viewLanding(){
  return `
  <div class="content">
    ${brandHeader('من طالبة إلى طالبة… المعرفة تنتقل')}
    <div style="height:14px;"></div>
    <button class="role-card" data-action="choose-role" data-role="student">
      <div class="badge" style="background:var(--skyblue-soft)">👩🏻‍🎓</div>
      <div><div class="r-title">دخول طالبة</div><div class="r-sub">شاركي، اسألي، وارتقي مع زميلاتك</div></div>
    </button>
    <button class="role-card" data-action="choose-role" data-role="teacher">
      <div class="badge" style="background:var(--primary-soft)">👩🏻‍🏫</div>
      <div><div class="r-title">دخول معلمة</div><div class="r-sub">تحتاجين رمز تفعيل المعلمات</div></div>
    </button>
  </div>`;
}

function viewAuthForm(){
  const isTeacher = state.role === 'teacher';
  const isSignup = state.mode === 'signup';
  return `
  <div class="content">
    <button class="back-btn" data-action="back-to-landing">←</button>
    ${brandHeader(isTeacher ? 'دخول المعلمة' : 'دخول الطالبة')}
    <div style="height:10px;"></div>
    <div class="tabs">
      <button class="tab ${state.mode==='login'?'active':''}" data-action="set-mode" data-mode="login">تسجيل الدخول</button>
      <button class="tab ${state.mode==='signup'?'active':''}" data-action="set-mode" data-mode="signup">إنشاء حساب</button>
    </div>

    ${state.error ? `<div class="alert error">${state.error}</div>` : ''}
    ${state.success ? `<div class="alert success">${state.success}</div>` : ''}

    <form id="authForm">
      ${isSignup ? `
      <div class="field">
        <label>الاسم</label>
        <input type="text" id="displayName" placeholder="مثال: لمار" required>
      </div>` : ''}
      <div class="field">
        <label>البريد الإلكتروني</label>
        <input type="email" id="email" placeholder="name@example.com" required>
      </div>
      <div class="field">
        <label>كلمة المرور</label>
        <input type="password" id="password" placeholder="6 أحرف على الأقل" minlength="6" required>
      </div>
      ${isTeacher && isSignup ? `
      <div class="field">
        <label>رمز تفعيل المعلمات</label>
        <input type="text" id="teacherCode" placeholder="اكتبي الرمز هنا" autocomplete="off" required>
        <div class="hint">رمز التفعيل من إدارة المدرسة. هذا ليس كلمة مرور حسابك.</div>
      </div>` : ''}
      <button type="submit" class="btn ${isTeacher?'btn-primary':'btn-coral'}" ${state.loading?'disabled':''}>
        ${state.loading ? 'جارِ التحميل...' : (isSignup ? 'إنشاء الحساب' : 'تسجيل الدخول')}
      </button>
    </form>
  </div>`;
}

function viewDashboard(){
  const p = state.profile || {};
  const isTeacher = p.role === 'teacher';
  return `
  <div class="content">
    <div class="dash-header">
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <span class="role-chip ${isTeacher?'teacher':'student'}">${isTeacher? '👩🏻‍🏫 معلمة' : '👩🏻‍🎓 طالبة'}</span>
    </div>
    <div class="info-card">
      ✅ تم تسجيل الدخول بنجاح، وتم التحقق من صلاحيتك (${p.role}) عبر Firestore.
      <br><br>
      هذه المرحلة (المرحلة 1) تغطي فقط: تسجيل الدخول/إنشاء الحساب، وتحديد الدور (طالبة/معلمة)،
      وحماية صلاحية المعلمة برمز التفعيل. الصفحة الرئيسية الكاملة والدروس والمشاركات
      ستُبنى في المراحل التالية.
    </div>
    <button class="link-btn" data-action="logout">تسجيل الخروج</button>
  </div>`;
}

function render(){
  const app = document.getElementById('app');
  if(state.view === 'loading'){
    app.innerHTML = `<div class="content" style="text-align:center; padding-top:80px; color:var(--ink-soft); font-size:13px;">جارِ التحميل...</div>`;
    return;
  }
  if(state.view === 'landing') app.innerHTML = viewLanding();
  else if(state.view === 'authForm') app.innerHTML = viewAuthForm();
  else if(state.view === 'dashboard') app.innerHTML = viewDashboard();
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.dataset.action;
  if(action === 'choose-role'){
    setState({view:'authForm', role: el.dataset.role, mode:'login', error:'', success:''});
  } else if(action === 'back-to-landing'){
    setState({view:'landing', error:'', success:''});
  } else if(action === 'set-mode'){
    setState({mode: el.dataset.mode, error:'', success:''});
  } else if(action === 'logout'){
    handleLogout();
  }
});

document.addEventListener('submit', (e) => {
  if(e.target.id !== 'authForm') return;
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if(state.mode === 'signup'){
    const displayName = document.getElementById('displayName').value.trim();
    const teacherCode = state.role==='teacher' ? document.getElementById('teacherCode').value.trim() : undefined;
    handleSignup({role: state.role, displayName, email, password, teacherCode});
  } else {
    handleLogin({email, password});
  }
});

render();
