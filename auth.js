import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { fetchSubjects, fetchLessons, fetchLesson, seedInitialContent, addLesson } from "./content.js";

/* ---------- Firebase init ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- state ---------- */
const state = {
  view: 'loading',      // loading | landing | authForm | studentHome | subjectLessons | lessonDetail | teacherHome
  role: null,            // 'student' | 'teacher'  (chosen on the landing screen)
  mode: 'login',         // 'login' | 'signup'
  loading: false,
  error: '',
  success: '',
  profile: null,         // {uid, role, displayName, email, points}
  subjects: [],
  lessons: [],
  currentLesson: null,
  history: [],           // in-app back stack once inside student/teacher screens
};

function setState(patch){ Object.assign(state, patch); render(); }

function showToast(msg){
  const old = document.querySelector('.toast');
  if(old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.querySelector('.shell').appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function comingSoon(){
  showToast('🚧 هذي الميزة بتُبنى بمرحلة قادمة');
}

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
  setState({view:'loading'});
  const snap = await getDoc(doc(db, 'users', uid));
  if(!snap.exists()){
    setState({loading:false, error:'تعذّر إيجاد ملف الحساب. حاولي تسجيل الدخول مرة أخرى.', view:'landing'});
    await signOut(auth);
    return;
  }
  const profile = snap.data();
  const subjects = await fetchSubjects(db).catch(() => []);
  let lessons = [];
  if(subjects.length){
    lessons = await fetchLessons(db, subjects[0].id).catch(() => []);
  }
  setState({
    loading:false, profile, subjects, lessons, history:[],
    view: profile.role === 'teacher' ? 'teacherHome' : 'studentHome',
  });
}

async function handleLogout(){
  await signOut(auth);
  setState({view:'landing', role:null, mode:'login', profile:null, error:'', success:'', history:[]});
}

/* ---------- in-app navigation (after login) ---------- */
function navigate(view, extra={}){
  state.history.push(state.view);
  setState({view, ...extra});
}
function goBack(){
  const prev = state.history.pop();
  if(prev) setState({view: prev});
  else setState({view: state.profile?.role === 'teacher' ? 'teacherHome' : 'studentHome'});
}
async function openSubjectLessons(){
  if(!state.subjects.length){ showToast('المحتوى لسه ما تهيّأ من المعلمة.'); return; }
  const lessons = await fetchLessons(db, state.subjects[0].id).catch(() => []);
  navigate('subjectLessons', {lessons});
}
async function openLesson(lessonId){
  const lesson = await fetchLesson(db, lessonId).catch(() => null);
  navigate('lessonDetail', {currentLesson: lesson});
}
async function runSeed(){
  setState({loading:true});
  try{
    const res = await seedInitialContent(db);
    const subjects = await fetchSubjects(db).catch(() => []);
    const lessons = subjects.length ? await fetchLessons(db, subjects[0].id).catch(() => []) : [];
    setState({loading:false, subjects, lessons});
    showToast(`✅ تم إنشاء ${res.subjects} مادة و${res.lessons} دروس`);
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء التهيئة. تأكدي إنك مسجّلة كمعلمة.');
  }
}
async function handleAddLesson(title){
  if(!state.subjects.length){ showToast('هيّئي المحتوى الأساسي أول شي.'); return; }
  setState({loading:true});
  try{
    const subjectId = state.subjects[0].id;
    const newLesson = await addLesson(db, subjectId, title, state.lessons);
    setState({loading:false, lessons:[...state.lessons, newLesson]});
    showToast(`✅ تمت إضافة درس «${title}»`);
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء إضافة الدرس. تأكدي إنك مسجّلة كمعلمة.');
  }
}

/* ---------- keep session on reload ---------- */
onAuthStateChanged(auth, async (user) => {
  if(user && state.view === 'loading' && !state.profile){
    await loadProfileAndGo(user.uid);
  } else if(!user && state.view !== 'landing' && state.view !== 'authForm'){
    setState({view:'landing'});
  } else if(state.view === 'loading' && !user){
    setState({view:'landing'});
  }
});

/* ---------- shared UI pieces ---------- */
function brandHeader(sub){
  return `
  <div class="brand-center">
    <div class="brand-mark">P</div>
    <div class="bname">PeerUp</div>
    <div class="tag">نرتقي معًا</div>
    ${sub ? `<div class="slogan">${sub}</div>` : ''}
  </div>`;
}
function pageHead(title, sub){
  return `
  <div class="page-head">
    <button class="back-btn" data-action="back">←</button>
    <div><h2>${title}</h2>${sub?`<div class="p-sub">${sub}</div>`:''}</div>
  </div>`;
}
function studentNav(){
  const active = v => state.view === v ? 'active' : '';
  return `
  <div class="bottomnav">
    <button class="navitem ${active('studentHome')}" data-action="nav-student-home"><span class="ic-wrap">🏠</span>الرئيسية</button>
    <button class="navitem ${active('subjectLessons')||active('lessonDetail')}" data-action="nav-lessons"><span class="ic-wrap">📚</span>الدروس</button>
    <button class="navitem" data-action="coming-soon"><span class="nav-raised">💡</span></button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">🆘</span>الأسئلة</button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">🏆</span>إنجازي</button>
  </div>`;
}
function teacherNav(){
  const active = v => state.view === v ? 'active' : '';
  return `
  <div class="bottomnav">
    <button class="navitem ${active('teacherHome')}" data-action="nav-teacher-home"><span class="ic-wrap">🏠</span>الرئيسية</button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">📥</span>المراجعة</button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">❓</span>الأسئلة</button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">📊</span>الإحصائيات</button>
  </div>`;
}

/* ---------- auth views ---------- */
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

/* ---------- student views ---------- */
function viewStudentHome(){
  const p = state.profile || {};
  const lessons = state.lessons || [];
  const subj = state.subjects[0];
  return `
  <div class="content-home">
    <div class="hero">
      <div class="hero-top">
        <div class="brand-mini"><div class="bm-mark">P</div><div class="bm-name">PeerUp</div></div>
        <div class="hero-avatar">🙋‍♀️</div>
      </div>
      <h1>صباح الخير، ${p.displayName || ''} 👋</h1>
      <p class="sub">وش ودك تسوين اليوم؟</p>
    </div>
    <div style="padding:0 18px;">
      <button class="role-card disabled" data-action="coming-soon">
        <div class="badge" style="background:var(--primary-soft)">💡</div>
        <div><div class="r-title">فهمتها بطريقتي</div><div class="r-sub">شاركي زميلاتك طريقة فهمك — قريبًا</div></div>
        <span class="chev">←</span>
      </button>
      <button class="role-card disabled" data-action="coming-soon">
        <div class="badge" style="background:var(--coral-soft)">🆘</div>
        <div><div class="r-title">أنقذوني!</div><div class="r-sub">في شيء مو فاهمته؟ اسألي زميلاتك — قريبًا</div></div>
        <span class="chev">←</span>
      </button>
      <button class="role-card" data-action="nav-lessons">
        <div class="badge" style="background:var(--skyblue-soft)">📚</div>
        <div><div class="r-title">أبي أفهم</div><div class="r-sub">شوفي دروس ${subj ? subj.name : 'المادة'}</div></div>
        <span class="chev">←</span>
      </button>

      ${lessons.length ? `
      <div class="section-title">📚 دروس ${subj ? subj.name : ''}</div>
      <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
        ${lessons.map(l => `
          <div class="list-row" data-action="nav-lesson" data-id="${l.id}">
            <div class="badge sm" style="background:var(--primary-soft)">${subj ? subj.emoji : '📘'}</div>
            <div><div class="r-title">${l.title}</div><div class="r-meta">اضغطي لعرض الدرس</div></div>
            <span class="chev">←</span>
          </div>`).join('')}
      </div>` : `
      <div class="empty-state" style="margin-top:24px;">
        <span class="emoji">📭</span>
        المحتوى لسه ما تهيّأ. اطلبي من معلمتك تسجل دخولها وتضغط زر "تهيئة المحتوى" من لوحتها.
      </div>`}
    </div>
  </div>`;
}

function viewSubjectLessons(){
  const subj = state.subjects[0];
  const lessons = state.lessons || [];
  return `
  <div class="content-app">
    ${pageHead('تعلّمي من زميلاتك', 'اختاري الدرس اللي تبين تشوفينه')}
    ${subj ? `<div class="subject-tag">${subj.emoji} ${subj.name}</div>` : ''}
    ${lessons.length ? `
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${lessons.map(l => `
        <div class="list-row" data-action="nav-lesson" data-id="${l.id}">
          <div class="badge sm" style="background:var(--primary-soft)">${subj ? subj.emoji : '📘'}</div>
          <div><div class="r-title">${l.title}</div><div class="r-meta">اضغطي لعرض الدرس</div></div>
          <span class="chev">←</span>
        </div>`).join('')}
    </div>` : `
    <div class="empty-state"><span class="emoji">📭</span>ما فيه دروس بعد.</div>`}
  </div>`;
}

function viewLessonDetail(){
  const l = state.currentLesson;
  return `
  <div class="content-app">
    ${pageHead(l ? l.title : 'الدرس', '🧲 الفيزياء')}
    <div class="section-title">💡 شروحات الطالبات المعتمدة</div>
    <div class="empty-state">
      <span class="emoji">💭</span>
      لسه ما فيه شروحات لهالدرس — ميزة المشاركة بتُبنى بالمرحلة القادمة.
    </div>
    <div class="section-title">🆘 الأسئلة المتعلقة بالدرس</div>
    <div class="empty-state">
      <span class="emoji">🆘</span>
      لسه ما فيه أسئلة لهالدرس — ميزة الأسئلة بتُبنى بالمرحلة القادمة.
    </div>
  </div>`;
}

/* ---------- teacher views ---------- */
function viewTeacherHome(){
  const p = state.profile || {};
  const subjCount = state.subjects.length;
  const lessonCount = state.lessons.length;
  return `
  <div class="content-app">
    <div class="dash-header">
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <span class="role-chip teacher">👩🏻‍🏫 معلمة</span>
    </div>
    <div class="info-card">
      المواد الحالية: <b>${subjCount}</b> — الدروس: <b>${lessonCount}</b>
      ${subjCount===0 ? `
      <br><br>
      ما فيه محتوى بعد. اضغطي زر "تهيئة/تحديث الدروس الأساسية" تحت عشان تُنشئ
      مادة الفيزياء ودروسها في قاعدة البيانات.` : `
      <br><br>
      ✅ المحتوى الأساسي موجود. تقدرين تضغطين "تهيئة/تحديث الدروس الأساسية" في أي وقت
      لتحديث قائمة الدروس الافتراضية (هذا آمن ولا يحذف مشاركات الطالبات لاحقًا).`}
    </div>
    <button class="btn btn-primary" style="margin-top:14px;" data-action="seed-content" ${state.loading?'disabled':''}>${state.loading?'جارِ التهيئة...':'🔄 تهيئة / تحديث الدروس الأساسية'}</button>
    ${subjCount>0 ? `
    <div class="section-title">إضافة درس جديد لمادة ${state.subjects[0] ? state.subjects[0].name : ''}</div>
    <form id="addLessonForm">
      <div class="field">
        <input type="text" id="newLessonTitle" placeholder="مثال: قوانين نيوتن للحركة" required>
      </div>
      <button type="submit" class="btn btn-primary" ${state.loading?'disabled':''}>${state.loading?'جارِ الإضافة...':'➕ إضافة الدرس'}</button>
    </form>
    <div class="section-title">الدروس الحالية (${lessonCount})</div>
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${state.lessons.map(l => `
        <div class="list-row" style="cursor:default;">
          <div><div class="r-title">${l.title}</div></div>
        </div>`).join('')}
    </div>` : ''}
    <button class="link-btn" data-action="logout">تسجيل الخروج</button>
  </div>`;
}

/* ---------- main render ---------- */
function render(){
  const app = document.getElementById('app');
  if(state.view === 'loading'){
    app.innerHTML = `<div class="content" style="text-align:center; padding-top:80px; color:var(--ink-soft); font-size:13px;">جارِ التحميل...</div>`;
    return;
  }
  if(state.view === 'landing'){ app.innerHTML = viewLanding(); return; }
  if(state.view === 'authForm'){ app.innerHTML = viewAuthForm(); return; }
  if(state.view === 'studentHome'){ app.innerHTML = viewStudentHome() + studentNav(); return; }
  if(state.view === 'subjectLessons'){ app.innerHTML = viewSubjectLessons() + studentNav(); return; }
  if(state.view === 'lessonDetail'){ app.innerHTML = viewLessonDetail() + studentNav(); return; }
  if(state.view === 'teacherHome'){ app.innerHTML = viewTeacherHome() + teacherNav(); return; }
  app.innerHTML = viewLanding();
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
  } else if(action === 'back'){
    goBack();
  } else if(action === 'nav-student-home'){
    setState({view:'studentHome', history:[]});
  } else if(action === 'nav-teacher-home'){
    setState({view:'teacherHome', history:[]});
  } else if(action === 'nav-lessons'){
    openSubjectLessons();
  } else if(action === 'nav-lesson'){
    openLesson(el.dataset.id);
  } else if(action === 'seed-content'){
    runSeed();
  } else if(action === 'coming-soon'){
    comingSoon();
  }
});

document.addEventListener('submit', (e) => {
  if(e.target.id === 'addLessonForm'){
    e.preventDefault();
    const input = document.getElementById('newLessonTitle');
    const title = input.value.trim();
    if(!title) return;
    handleAddLesson(title);
    return;
  }
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
