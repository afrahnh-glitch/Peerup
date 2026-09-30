import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  fetchSubjects, fetchLessons, fetchLesson, seedInitialContent, addLesson,
  createPost, fetchPostsForLesson, createQuestion, fetchQuestionsWithAnswers,
  createAnswer, fetchAnswersForQuestion,
  fetchPendingPosts, approvePost, rejectPost, deletePost,
  attachLikeInfo, likePost, computeStudentPoints, fetchLeaderboard,
} from "./content.js";
import {
  MindMapEditor, mmSerialize, mmThumbSvg, mmNodeCount, mmSetDefaultTitle, mmEsc, mmNodesLabel,
} from "./mindmap.js";

const POST_TYPES = {
  quick:   {emoji: '📝', label: 'شرح سريع'},
  image:   {emoji: '🖼️', label: 'صورة / خريطة مفاهيم'},
  example: {emoji: '💡', label: 'مثال من عندي'},
};

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
  posts: [],
  questions: [],
  allQuestions: [],
  shareLessonId: '',
  postType: 'quick',
  uploadingImage: false,
  expandedQuestions: new Set(),
  pendingPosts: [],
  myStats: null,
  leaderboard: [],
  history: [],           // in-app back stack once inside student/teacher screens
};

function setState(patch){ Object.assign(state, patch); render(); }

/* ---------- خريطة ذهنية: محرر حقيقي بملء الشاشة (mindmap.js) ----------
   الخريطة تُحفظ كبيانات منظّمة (عقد + علاقات + إحداثيات) داخل مستند المشاركة
   نفسه في Firestore — بدون صور، بدون Storage، بدون اشتراك مدفوع. */
let mapDoc = null;   // الخريطة الجاري بناؤها؛ تبقى بالذاكرة أثناء كتابة المشاركة
let mmOpen = null;   // المحرر المفتوح حاليًا (إن وُجد)

function currentPostLessonTitle(){
  const sel = document.getElementById('postLesson');
  return lessonTitleById((sel && sel.value) || state.shareLessonId);
}
function renderMapPreview(){
  const box = document.getElementById('mapPreview');
  if(!box) return;
  if(mapDoc && mmNodeCount(mapDoc) > 1){
    const data = mmSerialize(mapDoc);
    box.innerHTML = `
      <div class="mm-preview-card" data-action="open-mindmap">
        ${mmThumbSvg(data)}
        <div class="mm-preview-cap">🧠 ${mmNodesLabel(data.nodes.length)} — اضغطي للتعديل</div>
      </div>
      <div class="mm-preview-actions">
        <button type="button" class="btn btn-primary" data-action="open-mindmap">✏️ تعديل الخريطة</button>
        <button type="button" class="pill-btn" data-action="clear-mindmap">🗑️ مسح الخريطة</button>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="mm-empty">
        <div class="mm-empty-planet">🪐</div>
        <div>ابني خريطة للدرس: فكرة رئيسية في المنتصف، فروع، وفروع فرعية مرتبطة بها.</div>
      </div>
      <button type="button" class="btn btn-primary" data-action="open-mindmap">🧠 افتحي محرر الخريطة</button>`;
  }
}
function openMapEditor(){
  if(mmOpen) return;
  mmOpen = new MindMapEditor({
    doc: mapDoc,
    defaultTitle: currentPostLessonTitle(),
    title: 'خريطتي الذهنية',
    onChange: (d) => { mapDoc = d; },
    onClose: (d) => {
      mapDoc = (d && mmNodeCount(d) > 1) ? d : null;
      mmOpen = null;
      renderMapPreview();
    },
  });
}
function openMapViewer(postId){
  if(mmOpen) return;
  const post = (state.posts || []).find(p => p.id === postId)
            || (state.pendingPosts || []).find(p => p.id === postId);
  if(!post || !post.mindMap) return;
  mmOpen = new MindMapEditor({
    readOnly: true, data: post.mindMap, title: 'خريطة ' + (post.studentName || ''),
    onClose: () => { mmOpen = null; },
  });
}
// معاينة الخريطة داخل بطاقة المشاركة (للطالبات وللمعلمة قبل الاعتماد)
function mindMapBlock(p){
  const mm = p.mindMap;
  if(mm && Array.isArray(mm.nodes) && mm.nodes.length > 1){
    const svg = mmThumbSvg(mm);
    if(svg){
      return `
      <div class="mm-preview-card" data-action="view-mindmap" data-id="${p.id}">
        ${svg}
        <div class="mm-preview-cap">🔍 خريطة ذهنية · ${mmNodesLabel(Math.min(mm.nodes.length, 40))} — اضغطي للعرض الكامل</div>
      </div>`;
    }
  }
  return p.shapesData && p.shapesData.length ? renderShapesMap(p.shapesData) : '';
}

/* مشاركات قديمة أُنشئت بمحرر الأشكال السابق: تبقى قابلة للعرض فقط */
const LEGACY_W = 300, LEGACY_H = 260;
function renderShapesMap(shapes){
  if(!shapes || !shapes.length) return '';
  const items = shapes.map(s => `
    <div class="map-shape map-shape-${s.type === 'circle' ? 'circle' : 'rect'}" style="left:${(Number(s.x)/LEGACY_W*100)}%; top:${(Number(s.y)/LEGACY_H*100)}%; background:${/^#[0-9a-fA-F]{3,8}$/.test(s.color) ? s.color : '#7C5CFC'};">
      <div class="shape-text">${mmEsc(s.text || '')}</div>
    </div>`).join('');
  return `<div class="map-canvas map-canvas-view">${items}</div>`;
}

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
  let pendingPosts = [];
  if(profile.role === 'teacher'){
    pendingPosts = await fetchPendingPosts(db).catch(() => []);
  }
  setState({
    loading:false, profile, subjects, lessons, pendingPosts, history:[],
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
  const [lesson, rawPosts, questions] = await Promise.all([
    fetchLesson(db, lessonId).catch(() => null),
    fetchPostsForLesson(db, lessonId, state.profile.uid).catch(() => []),
    fetchQuestionsWithAnswers(db, lessonId).catch(() => []),
  ]);
  const posts = await attachLikeInfo(db, rawPosts, state.profile.uid).catch(() => rawPosts);
  navigate('lessonDetail', {currentLesson: lesson, posts, questions});
}
async function handleLikePost(postId){
  try{
    await likePost(db, postId, state.profile.uid);
    const updated = (state.posts || []).map(p =>
      p.id === postId ? {...p, likedByMe: true, likesCount: (p.likesCount||0) + 1} : p);
    setState({posts: updated});
    showToast('💡 شكرًا! أفدتِ صاحبة الشرح بنقطتين');
  }catch(err){
    showToast('يبدو إنك سبق ووصلتِها بـ«أفادني».');
  }
}
async function openAchievements(){
  setState({loading:true});
  const [myStats, leaderboard] = await Promise.all([
    computeStudentPoints(db, state.profile.uid).catch(() => null),
    fetchLeaderboard(db, 5).catch(() => []),
  ]);
  setState({loading:false});
  navigate('achievements', {myStats, leaderboard});
}
async function openQuestionsList(){
  const allQuestions = await fetchQuestionsWithAnswers(db).catch(() => []);
  navigate('questionsList', {allQuestions});
}
function lessonTitleById(id){
  const l = (state.lessons || []).find(x => x.id === id);
  return l ? l.title : '';
}
async function handleSubmitPost(){
  const lessonId = document.getElementById('postLesson').value;
  const content = document.getElementById('postContent').value.trim();
  if(!content){ showToast('اكتبي شرحك قبل الإرسال'); return; }
  const mindMap = (mapDoc && mmNodeCount(mapDoc) > 1) ? mmSerialize(mapDoc) : null;
  if(mindMap && JSON.stringify(mindMap).length > 60000){ showToast('الخريطة كبيرة جدًا، قلّلي عدد العقد.'); return; }
  setState({loading:true});
  try{
    const lesson = (state.lessons || []).find(l => l.id === lessonId);
    await createPost(db, {
      lessonId,
      subjectId: lesson ? lesson.subjectId : (state.subjects[0] && state.subjects[0].id),
      studentUid: state.profile.uid,
      studentName: state.profile.displayName,
      type: state.postType,
      title: '',
      content,
      mindMap,
    });
    mapDoc = null;
    setState({loading:false});
    navigate('shareSuccess');
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء الإرسال، حاولي مرة أخرى.');
  }
}
async function handleSubmitQuestion(){
  const lessonId = document.getElementById('questionLesson').value;
  const text = document.getElementById('questionText').value.trim();
  if(!text){ showToast('اكتبي سؤالك قبل الإرسال'); return; }
  setState({loading:true});
  try{
    const lesson = (state.lessons || []).find(l => l.id === lessonId);
    await createQuestion(db, {
      lessonId,
      subjectId: lesson ? lesson.subjectId : (state.subjects[0] && state.subjects[0].id),
      studentUid: state.profile.uid,
      studentName: state.profile.displayName,
      text,
    });
    setState({loading:false});
    showToast('تم إرسال سؤالك 🎉');
    await openQuestionsList();
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء الإرسال، حاولي مرة أخرى.');
  }
}
async function handleSubmitAnswer(questionId, text){
  try{
    await createAnswer(db, {
      questionId, studentUid: state.profile.uid, studentName: state.profile.displayName, text,
    });
    showToast('تم إرسال إجابتك ✨');
    const freshAnswers = await fetchAnswersForQuestion(db, questionId).catch(() => []);
    const updateList = (list) => (list || []).map(q => q.id === questionId ? {...q, answers: freshAnswers} : q);
    setState({
      questions: updateList(state.questions),
      allQuestions: updateList(state.allQuestions),
    });
  }catch(err){
    showToast('صار خطأ أثناء إرسال الإجابة.');
  }
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
async function openTeacherReview(){
  const pendingPosts = await fetchPendingPosts(db).catch(() => []);
  navigate('teacherReview', {pendingPosts});
}
async function handleApprovePost(id){
  try{
    await approvePost(db, id);
    setState({pendingPosts: state.pendingPosts.filter(p => p.id !== id)});
    showToast('✅ تم اعتماد المشاركة');
  }catch(err){
    showToast('صار خطأ أثناء الاعتماد.');
  }
}
async function handleRejectPost(id){
  try{
    await rejectPost(db, id);
    setState({pendingPosts: state.pendingPosts.filter(p => p.id !== id)});
    showToast('تم رفض المشاركة');
  }catch(err){
    showToast('صار خطأ أثناء الرفض.');
  }
}
async function handleDeletePost(id){
  try{
    await deletePost(db, id);
    setState({pendingPosts: state.pendingPosts.filter(p => p.id !== id)});
    showToast('🗑️ تم حذف المشاركة نهائيًا');
  }catch(err){
    showToast('صار خطأ أثناء الحذف.');
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
    <div style="flex:1;"><h2>${title}</h2>${sub?`<div class="p-sub">${sub}</div>`:''}</div>
    <button class="back-btn" data-action="logout" title="تسجيل الخروج">🚪</button>
  </div>`;
}
function studentNav(){
  const active = v => state.view === v ? 'active' : '';
  return `
  <div class="bottomnav">
    <button class="navitem ${active('studentHome')}" data-action="nav-student-home"><span class="ic-wrap">🏠</span>الرئيسية</button>
    <button class="navitem ${active('subjectLessons')||active('lessonDetail')}" data-action="nav-lessons"><span class="ic-wrap">📚</span>الدروس</button>
    <button class="navitem" data-action="nav-share"><span class="nav-raised">💡</span></button>
    <button class="navitem ${active('questionsList')}" data-action="nav-questions-list"><span class="ic-wrap">🆘</span>الأسئلة</button>
    <button class="navitem ${active('achievements')}" data-action="nav-achievements"><span class="ic-wrap">🏆</span>إنجازي</button>
  </div>`;
}
function teacherNav(){
  const active = v => state.view === v ? 'active' : '';
  return `
  <div class="bottomnav">
    <button class="navitem ${active('teacherHome')}" data-action="nav-teacher-home"><span class="ic-wrap">🏠</span>الرئيسية</button>
    <button class="navitem ${active('teacherReview')}" data-action="nav-teacher-review"><span class="ic-wrap">📥</span>المراجعة</button>
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
      <img src="images/planet.svg" class="hero-planet" alt="" aria-hidden="true">
      <img src="images/stars.svg" class="hero-stars" alt="" aria-hidden="true">
      <div class="hero-top">
        <div class="brand-mini"><div class="bm-mark">P</div><div class="bm-name">PeerUp</div></div>
        <div class="hero-avatar">🙋‍♀️</div>
      </div>
      <h1>صباح الخير، ${p.displayName || ''} 👋</h1>
      <p class="sub">وش ودك تسوين اليوم؟</p>
    </div>
    <div style="padding:0 18px;">
      <button class="role-card" data-action="nav-share">
        <div class="badge" style="background:var(--primary-soft)"><img src="images/lightbulb.svg" class="badge-icon" alt=""></div>
        <div><div class="r-title">فهمتها بطريقتي</div><div class="r-sub">شاركي زميلاتك طريقة فهمك</div></div>
        <span class="chev">←</span>
      </button>
      <button class="role-card" data-action="nav-ask">
        <div class="badge" style="background:var(--coral-soft)">🆘</div>
        <div><div class="r-title">أنقذوني!</div><div class="r-sub">في شيء مو فاهمته؟ اسألي زميلاتك</div></div>
        <span class="chev">←</span>
      </button>
      <button class="role-card" data-action="nav-lessons">
        <div class="badge" style="background:var(--skyblue-soft)"><img src="images/book.svg" class="badge-icon" alt=""></div>
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
      <button class="link-btn" data-action="logout">تسجيل الخروج</button>
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

function postCard(p){
  const isMine = state.profile && p.studentUid === state.profile.uid;
  const pending = p.status === 'pending';
  const t = POST_TYPES[p.type] || {emoji:'📝', label:''};
  return `
  <div class="post-card">
    <div class="p-head">
      <div class="badge sm" style="background:var(--primary-soft)">${t.emoji}</div>
      <div style="flex:1;">
        <div class="p-who">${p.studentName}${isMine ? ' (أنتِ)' : ''}</div>
        <div class="p-meta">${t.label}</div>
      </div>
      ${pending ? `<span class="pending-tag">⏳ بانتظار الاعتماد</span>` : ''}
    </div>
    <div class="p-body">${p.content}</div>
    ${mindMapBlock(p)}
    ${!pending ? `
    <div style="margin-top:11px;">
      <button class="pill-btn ${p.likedByMe?'liked':''}" data-action="like-post" data-id="${p.id}" ${p.likedByMe||isMine?'disabled':''}>
        💡 أفادني <span>${p.likesCount||0}</span>
      </button>
    </div>` : ''}
  </div>`;
}

function questionCard(q){
  const expanded = state.expandedQuestions.has(q.id);
  const showLessonTag = state.view === 'questionsList';
  return `
  <div class="post-card">
    <div style="font-weight:700; color:var(--ink); margin-bottom:6px; font-size:14px;">${q.text}</div>
    <div class="p-meta" style="margin-bottom:8px;">سألتها ${q.studentName}${showLessonTag ? ' · ' + lessonTitleById(q.lessonId) : ''}</div>
    <button class="link-btn" style="margin:0; text-align:right;" data-action="toggle-question" data-id="${q.id}">
      ${q.answers.length ? `💬 ${q.answers.length} إجابة${q.answers.length>1?'ات':''} — ${expanded?'إخفاء':'عرض'}` : (expanded ? 'إخفاء نموذج الإجابة' : '✍️ كوني أول من تجاوب')}
    </button>
    ${expanded ? `
      ${q.answers.map(a => `<div class="answer-line"><b>${a.studentName}:</b> ${a.text}</div>`).join('')}
      <form class="answer-form" data-answer-for="${q.id}">
        <input type="text" placeholder="اكتبي إجابتك..." required>
        <button type="submit">إرسال</button>
      </form>` : ''}
  </div>`;
}

function viewLessonDetail(){
  const l = state.currentLesson;
  const posts = state.posts || [];
  const questions = state.questions || [];
  return `
  <div class="content-app">
    ${pageHead(l ? l.title : 'الدرس', '🧲 الفيزياء')}
    <div class="section-title">💡 شروحات الطالبات</div>
    ${posts.length ? posts.map(postCard).join('') : `
      <div class="empty-state"><span class="emoji">💭</span>لسه ما فيه شروحات لهالدرس. كوني أول من تشارك فهمها!</div>`}
    <button class="btn btn-primary" style="margin-top:4px;" data-action="nav-share" data-lesson="${l?l.id:''}">💡 شاركي فهمك بهالدرس</button>

    <div class="section-title">🆘 الأسئلة المتعلقة بالدرس</div>
    ${questions.length ? questions.map(questionCard).join('') : `
      <div class="empty-state"><span class="emoji">🆘</span>ولا سؤال لهالدرس بعد.</div>`}
    <button class="btn btn-coral" style="margin-top:4px;" data-action="nav-ask" data-lesson="${l?l.id:''}">🆘 اسألي عن هالدرس</button>
  </div>`;
}

function viewSharePost(){
  const lessons = state.lessons || [];
  const selected = state.shareLessonId || (lessons[0] && lessons[0].id) || '';
  return `
  <div class="content-app">
    ${pageHead('فهمتها بطريقتي 💡', 'شاركي زميلاتك طريقة فهمك')}
    <div class="field">
      <label>الدرس</label>
      <select id="postLesson">
        ${lessons.map(l => `<option value="${l.id}" ${l.id===selected?'selected':''}>${l.title}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>نوع المشاركة</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${Object.entries(POST_TYPES).map(([key,t]) => `
          <button type="button" class="type-chip ${state.postType===key?'selected':''}" data-action="pick-type" data-type="${key}">${t.emoji} ${t.label}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label>اشرحيها بطريقتك</label>
      <textarea id="postContent" placeholder="اكتبي شرحك هنا..."></textarea>
    </div>
    <div class="field">
      <label>خريطة ذهنية للدرس (اختياري)</label>
      <div id="mapPreview" class="mm-preview"></div>
      <div class="hint">تُرسل مع شرحك للمعلمة، وتظهر لزميلاتك بعد الاعتماد.</div>
    </div>
    <button class="btn btn-primary" data-action="submit-post" ${state.loading?'disabled':''}>${state.loading?'جارِ الإرسال...':'إرسال للمعلمة'}</button>
  </div>`;
}

function viewShareSuccess(){
  return `
  <div class="content">
    <div class="success-screen">
      <img src="images/rocket.svg" class="success-rocket" alt="">
      <h2>وصلت مشاركتك!</h2>
      <p>بعد اعتماد المعلمة ستظهر لزميلاتك.</p>
      <button class="btn btn-primary" data-action="nav-student-home">رجوع للرئيسية</button>
    </div>
  </div>`;
}

function viewAskQuestion(){
  const lessons = state.lessons || [];
  const selected = state.shareLessonId || (lessons[0] && lessons[0].id) || '';
  return `
  <div class="content-app">
    ${pageHead('أنقذوني! 🆘', 'وين علقتي؟')}
    <div class="field">
      <label>الدرس</label>
      <select id="questionLesson">
        ${lessons.map(l => `<option value="${l.id}" ${l.id===selected?'selected':''}>${l.title}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>سؤالك</label>
      <textarea id="questionText" placeholder="مثال: ما فهمت ليش..."></textarea>
    </div>
    <button class="btn btn-coral" data-action="submit-question" ${state.loading?'disabled':''}>${state.loading?'جارِ الإرسال...':'اسألي PeerUp'}</button>
  </div>`;
}

function viewQuestionsList(){
  const questions = state.allQuestions || [];
  return `
  <div class="content-app">
    <div class="page-head" style="padding-top:2px;">
      <div style="flex:1;"><h2>🆘 أسئلة الطالبات</h2></div>
      <button class="btn btn-coral" style="width:auto; padding:9px 14px;" data-action="nav-ask">+ اسألي</button>
    </div>
    ${questions.length ? questions.map(questionCard).join('') : `<div class="empty-state"><span class="emoji">🆘</span>ولا سؤال لسه.</div>`}
  </div>`;
}

function viewAchievements(){
  const s = state.myStats || {points:0, explanationsCount:0, answersCount:0, likesReceived:0, helpedCount:0};
  const board = state.leaderboard || [];
  const p = state.profile || {};
  return `
  <div class="content-app">
    <div class="dash-header">
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <div class="points-big">${s.points} PeerPoints</div>
    </div>
    <div style="display:flex; gap:10px; margin:16px 0 22px;">
      <div class="stat-mini"><div class="num">${s.explanationsCount}</div><div class="lbl">💡 شروحات</div></div>
      <div class="stat-mini"><div class="num">${s.helpedCount}</div><div class="lbl">🤝 ساعدتِ طالبات</div></div>
      <div class="stat-mini"><div class="num">${s.likesReceived}</div><div class="lbl">⭐ أفادني</div></div>
    </div>
    <div class="section-title stars-title-row"><img src="images/stars.svg" class="title-stars" alt="">🔥 نجوم PeerUp</div>
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${board.length ? board.map((st,i) => `
        <div class="list-row" style="cursor:default;">
          <div style="width:22px; text-align:center; font-weight:700; color:var(--ink-faint); flex-shrink:0;">${i+1}</div>
          <div style="flex:1; font-weight:700; color:var(--ink);">${st.displayName}${st.uid===p.uid?' (أنتِ)':''}</div>
          <div style="color:var(--primary); font-weight:700; font-size:12.5px;">${st.points} نقطة</div>
        </div>`).join('') : `<div class="empty-state">ولا طالبة سجّلت نقاط لسه.</div>`}
    </div>
    <button class="link-btn" data-action="logout">تسجيل الخروج</button>
  </div>`;
}

/* ---------- teacher views ---------- */
function viewTeacherHome(){
  const p = state.profile || {};
  const subjCount = state.subjects.length;
  const lessonCount = state.lessons.length;
  const pendingCount = (state.pendingPosts || []).length;
  return `
  <div class="content-app">
    <div class="dash-header">
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <span class="role-chip teacher">👩🏻‍🏫 معلمة</span>
    </div>
    <button class="role-card" data-action="nav-teacher-review" style="margin-top:4px;">
      <div class="badge" style="background:var(--coral-soft)">📥</div>
      <div><div class="r-title">${pendingCount} مشاركة تنتظر المراجعة</div><div class="r-sub">اضغطي لاعتماد أو رفض المشاركات</div></div>
      <span class="chev">←</span>
    </button>
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

function pendingPostCard(p){
  const t = POST_TYPES[p.type] || {emoji:'📝', label:''};
  return `
  <div class="post-card">
    <div class="p-head">
      <div class="badge sm" style="background:var(--primary-soft)">${t.emoji}</div>
      <div style="flex:1;">
        <div class="p-who">${p.studentName}</div>
        <div class="p-meta">${t.label} · ${lessonTitleById(p.lessonId)}</div>
      </div>
    </div>
    <div class="p-body" style="margin-bottom:12px;">${p.content}</div>
    ${mindMapBlock(p)}
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary" style="width:auto; flex:1;" data-action="approve-post" data-id="${p.id}">✓ اعتماد</button>
      <button class="btn" style="width:auto; flex:1; background:var(--surface); border:1.5px solid var(--border); color:var(--ink);" data-action="reject-post" data-id="${p.id}">✕ رفض</button>
      <button class="btn" style="width:auto; padding:0 14px; background:var(--danger-soft); color:var(--danger);" data-action="delete-post" data-id="${p.id}">🗑️</button>
    </div>
  </div>`;
}

function viewTeacherReview(){
  const pending = state.pendingPosts || [];
  return `
  <div class="content-app">
    <div class="page-head" style="padding-top:2px;">
      <div><h2>📥 المراجعة</h2><div class="p-sub">${pending.length} مشاركة تنتظر الاعتماد</div></div>
    </div>
    ${pending.length ? pending.map(pendingPostCard).join('') : `
      <div class="empty-state"><span class="emoji">✅</span>ما فيه شي بانتظار المراجعة حاليًا.</div>`}
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
  if(state.view === 'sharePost'){ app.innerHTML = viewSharePost() + studentNav(); renderMapPreview(); return; }
  if(state.view === 'shareSuccess'){ app.innerHTML = viewShareSuccess() + studentNav(); return; }
  if(state.view === 'askQuestion'){ app.innerHTML = viewAskQuestion() + studentNav(); return; }
  if(state.view === 'questionsList'){ app.innerHTML = viewQuestionsList() + studentNav(); return; }
  if(state.view === 'achievements'){ app.innerHTML = viewAchievements() + studentNav(); return; }
  if(state.view === 'teacherHome'){ app.innerHTML = viewTeacherHome() + teacherNav(); return; }
  if(state.view === 'teacherReview'){ app.innerHTML = viewTeacherReview() + teacherNav(); return; }
  app.innerHTML = viewLanding();
}

/* ---------- events ---------- */
document.addEventListener('change', (e) => {
  if(e.target.id === 'postLesson'){
    state.shareLessonId = e.target.value;
    if(mapDoc && mmSetDefaultTitle(mapDoc, lessonTitleById(e.target.value))) renderMapPreview();
  }
});

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
  } else if(action === 'nav-teacher-review'){
    openTeacherReview();
  } else if(action === 'approve-post'){
    handleApprovePost(el.dataset.id);
  } else if(action === 'reject-post'){
    handleRejectPost(el.dataset.id);
  } else if(action === 'delete-post'){
    handleDeletePost(el.dataset.id);
  } else if(action === 'nav-lessons'){
    openSubjectLessons();
  } else if(action === 'nav-lesson'){
    openLesson(el.dataset.id);
  } else if(action === 'seed-content'){
    runSeed();
  } else if(action === 'nav-share'){
    state.shareLessonId = el.dataset.lesson || (state.lessons[0] && state.lessons[0].id) || '';
    mapDoc = null;
    setState({postType:'quick'});
    navigate('sharePost');
  } else if(action === 'open-mindmap'){
    openMapEditor();
  } else if(action === 'clear-mindmap'){
    mapDoc = null;
    renderMapPreview();
  } else if(action === 'view-mindmap'){
    openMapViewer(el.dataset.id);
  } else if(action === 'nav-ask'){
    state.shareLessonId = el.dataset.lesson || (state.lessons[0] && state.lessons[0].id) || '';
    navigate('askQuestion');
  } else if(action === 'nav-questions-list'){
    openQuestionsList();
  } else if(action === 'nav-achievements'){
    openAchievements();
  } else if(action === 'like-post'){
    handleLikePost(el.dataset.id);
  } else if(action === 'pick-type'){
    state.postType = el.dataset.type;
    document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  } else if(action === 'submit-post'){
    handleSubmitPost();
  } else if(action === 'submit-question'){
    handleSubmitQuestion();
  } else if(action === 'toggle-question'){
    const id = el.dataset.id;
    if(state.expandedQuestions.has(id)) state.expandedQuestions.delete(id);
    else state.expandedQuestions.add(id);
    render();
  } else if(action === 'coming-soon'){
    comingSoon();
  }
});

document.addEventListener('submit', (e) => {
  const answerFor = e.target.dataset && e.target.dataset.answerFor;
  if(answerFor){
    e.preventDefault();
    const input = e.target.querySelector('input');
    const text = input.value.trim();
    if(!text) return;
    handleSubmitAnswer(answerFor, text);
    return;
  }
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

/* لمسة تفاعل: إضافة/إزالة class="pressed" أثناء الضغط الفعلي باللمس أو
   الفأرة، بدل الاعتماد على :active وحدها (غير موثوق دائمًا على iOS). */
const PRESS_SEL = '.btn, .role-card, .list-row, .pill-btn, .navitem';
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(PRESS_SEL);
  if(el && !el.disabled) el.classList.add('pressed');
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    const el = e.target.closest(PRESS_SEL);
    if(el) el.classList.remove('pressed');
  });
});

render();
