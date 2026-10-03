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
  fetchChallenge, setChallenge, computeTeacherStats,
  attachBookmarkInfo, addBookmark, removeBookmark, fetchBookmarkedPosts,
  fetchAllApprovedPosts,
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
function effectiveTheme(){
  const stored = document.documentElement.getAttribute('data-theme');
  if(stored) return stored;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  try{ localStorage.setItem('peerup-theme', theme); }catch(_e){ /* تخزين محلي غير متاح، نكمل بدونه */ }
}
function toggleTheme(){
  applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
  setState({});
}

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
  uploadingImage: false,
  expandedQuestions: new Set(),
  pendingPosts: [],
  myStats: null,
  challenge: null,
  teacherStats: null,
  leaderboard: [],
  savedPosts: [],
  history: [],           // in-app back stack once inside student/teacher screens
};

function setState(patch){ Object.assign(state, patch); render(); }

/* ---------- خريطة ذهنية: محرر حقيقي بملء الشاشة (mindmap.js) ----------
   الخريطة تُحفظ كبيانات منظّمة (عقد + علاقات + إحداثيات) داخل مستند المشاركة
   نفسه في Firestore — بدون صور، بدون Storage، بدون اشتراك مدفوع. */
let mapDoc = null;   // الخريطة الجاري بناؤها؛ تبقى بالذاكرة أثناء كتابة المشاركة
let mmOpen = null;   // المحرر المفتوح حاليًا (إن وُجد)
let attachMode = null;   // null | 'voice' | 'map' — المرفق المختار حاليًا بنموذج المشاركة
let challengeMode = null; // null | 'text' | 'voice' | 'map' — طريقة الرد على تحدي اليوم

/* ---------- تسجيل صوتي: يُخزَّن كـ Base64 داخل نفس مستند المشاركة
   (بدون Firebase Storage)، بسقف مدة قصير يضمن بقاء الحجم صغيرًا جدًا. ---------- */
const VOICE_MAX_SECONDS = 20;
let voiceNote = null;        // {dataUrl, duration} بعد انتهاء التسجيل
let mediaRecorder = null;
let mediaStream = null;
let recordChunks = [];
let recordStartMs = 0;
let recordTimer = null;

function fmtSec(s){ return '0:' + String(s).padStart(2, '0'); }
function blobToDataUrl(blob){
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
function renderVoiceArea(){
  const box = document.getElementById('voiceArea');
  if(!box) return;
  if(mediaRecorder && mediaRecorder.state === 'recording'){
    const elapsed = Math.floor((Date.now() - recordStartMs) / 1000);
    box.innerHTML = `
      <div class="voice-recording">
        <span class="voice-dot"></span> جارِ التسجيل… ${fmtSec(elapsed)} / ${fmtSec(VOICE_MAX_SECONDS)}
      </div>
      <button type="button" class="btn btn-coral" data-action="stop-voice">⏹️ إيقاف التسجيل</button>`;
  } else if(voiceNote){
    box.innerHTML = `
      <audio controls src="${voiceNote.dataUrl}" style="width:100%;"></audio>
      <div class="voice-actions">
        <button type="button" class="pill-btn" data-action="redo-voice">🔁 إعادة التسجيل</button>
        <button type="button" class="pill-btn" data-action="discard-voice">🗑️ حذف</button>
      </div>`;
  } else {
    box.innerHTML = `
      <button type="button" class="btn btn-primary" data-action="start-voice">🎙️ ابدئي التسجيل</button>
      <div class="hint" style="text-align:center; margin-top:6px;">٢٠ ثانية كحد أقصى</div>`;
  }
}
async function startRecording(){
  if(!navigator.mediaDevices || !window.MediaRecorder){
    showToast('التسجيل الصوتي غير مدعوم على هذا المتصفح.');
    return;
  }
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
  }catch(err){
    showToast('ما قدرنا نوصل للميكروفون. تأكدي من إذن الوصول بإعدادات المتصفح.');
    return;
  }
  recordChunks = [];
  let mime = '';
  ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].forEach((m) => {
    if(!mime && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) mime = m;
  });
  try{
    mediaRecorder = new MediaRecorder(mediaStream, mime ? {mimeType: mime, audioBitsPerSecond: 24000} : {audioBitsPerSecond: 24000});
  }catch(err){
    showToast('التسجيل الصوتي غير مدعوم على هذا المتصفح.');
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    return;
  }
  mediaRecorder.ondataavailable = (e) => { if(e.data && e.data.size) recordChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordChunks, {type: mediaRecorder.mimeType || 'audio/webm'});
    const duration = Math.min(VOICE_MAX_SECONDS, Math.round((Date.now() - recordStartMs) / 1000));
    const dataUrl = await blobToDataUrl(blob);
    voiceNote = {dataUrl, duration};
    if(mediaStream){ mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    mediaRecorder = null;
    renderVoiceArea();
  };
  recordStartMs = Date.now();
  mediaRecorder.start();
  renderVoiceArea();
  recordTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordStartMs) / 1000);
    if(elapsed >= VOICE_MAX_SECONDS) stopRecording();
    else renderVoiceArea();
  }, 500);
}
function stopRecording(){
  clearInterval(recordTimer); recordTimer = null;
  if(mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}
function discardVoice(){
  voiceNote = null;
  renderVoiceArea();
}

function renderAttachArea(){
  const box = document.getElementById('attachArea');
  if(!box) return;
  box.innerHTML = `
    <div class="attach-toggle">
      <button type="button" class="attach-opt ${attachMode==='voice'?'selected':''}" data-action="pick-attach" data-mode="voice">🎙️ تسجيل صوتي</button>
      <button type="button" class="attach-opt ${attachMode==='map'?'selected':''}" data-action="pick-attach" data-mode="map">🧠 خريطة ذهنية</button>
    </div>
    ${attachMode==='voice' ? '<div id="voiceArea" class="attach-body"></div>' : ''}
    ${attachMode==='map' ? '<div id="mapPreview" class="attach-body mm-preview"></div>' : ''}`;
  if(attachMode === 'voice') renderVoiceArea();
  if(attachMode === 'map') renderMapPreview();
}

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
  // نجيب كل شي ما يعتمد على نتيجة شي ثاني بنفس الوقت بدل الواحد ورا الثاني
  // (هذا كان سبب جزء من البطء: كل طلب ينتظر اللي قبله بدون داعٍ).
  const [subjects, challenge, roleSpecific] = await Promise.all([
    fetchSubjects(db).catch(() => []),
    fetchChallenge(db).catch(() => null),
    profile.role === 'teacher'
      ? fetchPendingPosts(db).catch(() => [])
      : computeStudentPoints(db, uid).catch(() => null),
  ]);
  let lessons = [];
  if(subjects.length){
    lessons = await fetchLessons(db, subjects[0].id).catch(() => []);
  }
  const pendingPosts = profile.role === 'teacher' ? roleSpecific : [];
  const myStats = profile.role === 'teacher' ? null : roleSpecific;
  setState({
    loading:false, profile, subjects, lessons, pendingPosts, myStats, challenge, history:[],
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
  searchPool = null; // تحديث نتائج البحث بأحدث الشروحات المعتمدة بكل زيارة جديدة
  navigate('subjectLessons', {lessons});
}
async function openLesson(lessonId){
  const [lesson, rawPosts, questions] = await Promise.all([
    fetchLesson(db, lessonId).catch(() => null),
    fetchPostsForLesson(db, lessonId, state.profile.uid).catch(() => []),
    fetchQuestionsWithAnswers(db, lessonId).catch(() => []),
  ]);
  let posts = await attachLikeInfo(db, rawPosts, state.profile.uid).catch(() => rawPosts);
  posts = await attachBookmarkInfo(db, posts, state.profile.uid).catch(() => posts);
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
async function handleToggleBookmark(postId){
  const uid = state.profile.uid;
  const inLesson = (state.posts || []).find(p => p.id === postId);
  const inSaved = (state.savedPosts || []).find(p => p.id === postId);
  const current = inLesson ? !!inLesson.bookmarked : (inSaved ? true : false);
  try{
    if(current){
      await removeBookmark(db, postId, uid);
      showToast('تم إلغاء الحفظ');
    } else {
      await addBookmark(db, postId, uid);
      showToast('🔖 تم الحفظ، تقدرين ترجعين لها من «إنجازي»');
    }
    const flip = (list) => (list || []).map(p => p.id === postId ? {...p, bookmarked: !current} : p);
    if(current && state.view === 'savedPosts'){
      // إلغاء حفظ وإحنا بصفحة المحفوظات: تختفي من القائمة فورًا
      setState({savedPosts: (state.savedPosts || []).filter(p => p.id !== postId)});
    } else {
      setState({posts: flip(state.posts), savedPosts: flip(state.savedPosts)});
    }
  }catch(err){
    showToast('صار خطأ، حاولي مرة أخرى.');
  }
}
async function openSavedPosts(){
  setState({loading:true});
  const savedPosts = await fetchBookmarkedPosts(db, state.profile.uid).catch(() => []);
  setState({loading:false});
  navigate('savedPosts', {savedPosts});
}
async function refreshHomeStats(){
  const myStats = await computeStudentPoints(db, state.profile.uid).catch(() => state.myStats);
  setState({myStats});
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
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  if(!title){ showToast('اكتبي عنوان قبل الإرسال'); return; }
  if(!content){ showToast('اكتبي شرحك قبل الإرسال'); return; }
  const mindMap = (attachMode === 'map' && mapDoc && mmNodeCount(mapDoc) > 1) ? mmSerialize(mapDoc) : null;
  if(mindMap && JSON.stringify(mindMap).length > 60000){ showToast('الخريطة كبيرة جدًا، قلّلي عدد العقد.'); return; }
  const voice = (attachMode === 'voice' && voiceNote) ? voiceNote : null;
  if(voice && voice.dataUrl.length > 400000){ showToast('التسجيل كبير، سجّلي مقطع أقصر.'); return; }
  if(attachMode === 'voice' && mediaRecorder && mediaRecorder.state === 'recording'){ showToast('أوقفي التسجيل قبل الإرسال.'); return; }
  setState({loading:true});
  try{
    const lesson = (state.lessons || []).find(l => l.id === lessonId);
    await createPost(db, {
      lessonId,
      subjectId: lesson ? lesson.subjectId : (state.subjects[0] && state.subjects[0].id),
      studentUid: state.profile.uid,
      studentName: state.profile.displayName,
      title,
      content,
      mindMap,
      voiceNote: voice,
    });
    mapDoc = null;
    voiceNote = null;
    attachMode = null;
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
async function handleSetChallenge(text){
  setState({loading:true});
  try{
    await setChallenge(db, text);
    setState({loading:false, challenge:{text}});
    showToast('🔥 تحدي اليوم صار منشور للطالبات');
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء نشر التحدي. تأكدي إنك مسجّلة كمعلمة.');
  }
}
async function openTeacherStats(){
  setState({loading:true});
  const teacherStats = await computeTeacherStats(db).catch(() => null);
  setState({loading:false});
  navigate('teacherStats', {teacherStats});
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
    <button class="navitem ${active('teacherStats')}" data-action="nav-teacher-stats"><span class="ic-wrap">📊</span>الإحصائيات</button>
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
  const s = state.myStats;
  return `
  <div class="content-home">
    <div class="hero hero-compact">
      <img src="images/planet.svg" class="hero-planet" alt="" aria-hidden="true">
      <img src="images/stars.svg" class="hero-stars" alt="" aria-hidden="true">
      <div class="hero-top">
        <div class="brand-mini"><div class="bm-mark">P</div><div class="bm-name">PeerUp</div></div>
        <div class="hero-end">
          <button class="theme-toggle" data-action="toggle-theme" aria-label="تبديل الوضع الداكن">${effectiveTheme()==='dark'?'☀️':'🌙'}</button>
          <div class="hero-avatar">👩‍🚀</div>
        </div>
      </div>
      <h1>صباح الخير، ${p.displayName || ''} 👋</h1>
      <p class="sub">وش ودك تسوين اليوم؟</p>
      ${s ? `
      <div class="hero-stats">
        <div class="hero-stat"><span class="hs-ic">⭐</span><span class="hs-v">${s.points}</span><span class="hs-l">نقطة</span></div>
        <div class="hero-stat"><span class="hs-ic">💡</span><span class="hs-v">${s.explanationsCount}</span><span class="hs-l">شرح</span></div>
        <div class="hero-stat"><span class="hs-ic">🤝</span><span class="hs-v">${s.helpedCount}</span><span class="hs-l">ساعدتِ</span></div>
      </div>` : ''}
    </div>
    <div style="padding:0 18px;">
      <div class="qa-grid">
        <button class="qa-card" data-action="nav-share">
          <div class="qa-badge" style="background:var(--primary-soft)"><img src="images/lightbulb.svg" class="badge-icon" alt=""></div>
          <div class="qa-title">فهمتها<br>بطريقتي</div>
        </button>
        <button class="qa-card" data-action="nav-ask">
          <div class="qa-badge" style="background:var(--coral-soft)">🆘</div>
          <div class="qa-title">أنقذوني<br>أحتاج مساعدة</div>
        </button>
      </div>
      <button class="qa-card qa-wide" data-action="nav-lessons">
        <div class="qa-badge" style="background:var(--skyblue-soft)"><img src="images/book.svg" class="badge-icon" alt=""></div>
        <div class="qa-title">أبي أفهم<div class="qa-sub">شوفي دروس ${subj ? subj.name : 'المادة'}</div></div>
        <span class="chev">←</span>
      </button>

      ${state.challenge && state.challenge.text ? `
      <div class="challenge-card">
        <img src="images/rocket.svg" class="challenge-rocket" alt="" aria-hidden="true">
        <div class="challenge-tag">🔥 تحدي اليوم</div>
        <div class="challenge-text">${state.challenge.text}</div>
        <button class="btn challenge-btn" data-action="nav-challenge-share">أشارك بالتحدي ←</button>
      </div>` : ''}

      ${lessons.length ? `
      <div class="section-title">📚 دروس ${subj ? subj.name : ''}</div>
      <div class="lesson-list">
        ${lessons.map((l, i) => `
          <button class="lesson-row" data-action="nav-lesson" data-id="${l.id}">
            <div class="lesson-ic">${subj ? subj.emoji : '📘'}</div>
            <div class="lesson-mid"><div class="lesson-title">${l.title}</div><div class="lesson-meta">درس ${i+1}</div></div>
            <span class="chev">←</span>
          </button>`).join('')}
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
    <div class="field" style="margin-bottom:16px;">
      <input type="search" id="lessonSearchInput" placeholder="🔍 ابحثي باسم الدرس أو عنوان الشرح أو نصه..." autocomplete="off">
    </div>
    <div id="searchResultsArea"></div>
    <div id="lessonListArea">
      ${subj ? `<div class="subject-tag">${subj.emoji} ${subj.name}</div>` : ''}
      ${lessons.length ? `
      <div class="lesson-list">
        ${lessons.map((l, i) => `
          <button class="lesson-row" data-action="nav-lesson" data-id="${l.id}">
            <div class="lesson-ic">${subj ? subj.emoji : '📘'}</div>
            <div class="lesson-mid"><div class="lesson-title">${l.title}</div><div class="lesson-meta">درس ${i+1}</div></div>
            <span class="chev">←</span>
          </button>`).join('')}
      </div>` : `
      <div class="empty-state"><span class="emoji">📭</span>ما فيه دروس بعد.</div>`}
    </div>
  </div>`;
}

/* ---------- بحث: نصي بسيط بعنوان/نص الشرح، بدون أي خدمة خارجية ----------
   نجيب كل الشروحات المعتمدة مرة وحدة ونخزّنها بالذاكرة، وكل بحث بعدها
   فلترة فورية محليًا — بدون طلب شبكة جديد بكل حرف تكتبه الطالبة. */
let searchPool = null;
let searchDebounce = null;
async function ensureSearchPool(){
  if(searchPool) return searchPool;
  searchPool = await fetchAllApprovedPosts(db).catch(() => []);
  return searchPool;
}
async function renderSearchResults(term){
  const results = document.getElementById('searchResultsArea');
  const listArea = document.getElementById('lessonListArea');
  if(!results || !listArea) return;
  const q = term.trim();
  if(!q){
    results.innerHTML = '';
    listArea.style.display = '';
    return;
  }
  listArea.style.display = 'none';
  results.innerHTML = `<div class="empty-state">⏳ جارِ البحث...</div>`;
  const pool = await ensureSearchPool();
  const needle = q.toLowerCase();
  let matches = pool.filter(p =>
    (p.title || '').toLowerCase().includes(needle)
    || (p.content || '').toLowerCase().includes(needle)
    || lessonTitleById(p.lessonId).toLowerCase().includes(needle));
  matches = await attachLikeInfo(db, matches, state.profile.uid).catch(() => matches);
  matches = await attachBookmarkInfo(db, matches, state.profile.uid).catch(() => matches);
  if(document.getElementById('lessonSearchInput') && document.getElementById('lessonSearchInput').value.trim() !== q) return; // تغيّر البحث أثناء الانتظار
  results.innerHTML = matches.length
    ? `<div class="section-title">🔍 ${matches.length} نتيجة</div>` + matches.map(p => postCard({...p, _searchResult:true})).join('')
    : `<div class="empty-state"><span class="emoji">🔍</span>ما فيه نتائج لـ«${q}».</div>`;
}

function postCard(p){
  const isMine = state.profile && p.studentUid === state.profile.uid;
  const pending = p.status === 'pending';
  const t = POST_TYPES[p.type]; // النوع صار اختياريًا؛ موجود فقط بمشاركات قديمة قبل هذا التحديث
  return `
  <div class="post-card">
    <div class="p-head">
      <div class="badge sm" style="background:var(--primary-soft)">${t ? t.emoji : '💡'}</div>
      <div style="flex:1;">
        <div class="p-who">${p.studentName}${isMine ? ' (أنتِ)' : ''}</div>
        ${(state.view==='savedPosts' || p._searchResult) ? `<div class="p-meta">${lessonTitleById(p.lessonId)}</div>` : (t ? `<div class="p-meta">${t.label}</div>` : '')}
      </div>
      ${pending ? `<span class="pending-tag">⏳ بانتظار الاعتماد</span>` : ''}
    </div>
    ${p.title ? `<div class="p-title">${p.title}</div>` : ''}
    <div class="p-body">${p.content}</div>
    ${p.voiceNote && p.voiceNote.dataUrl ? `<audio controls src="${p.voiceNote.dataUrl}" class="post-audio"></audio>` : ''}
    ${mindMapBlock(p)}
    ${!pending ? `
    <div style="margin-top:11px; display:flex; gap:8px;">
      <button class="pill-btn ${p.likedByMe?'liked':''}" data-action="like-post" data-id="${p.id}" ${p.likedByMe||isMine?'disabled':''}>
        💡 أفادني <span>${p.likesCount||0}</span>
      </button>
      <button class="pill-btn ${p.bookmarked?'saved':''}" data-action="toggle-bookmark" data-id="${p.id}">
        ${p.bookmarked ? '🔖 محفوظ' : '🔖 احتفظي فيها'}
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
      <label>العنوان</label>
      <input type="text" id="postTitle" placeholder="مثال: أسهل طريقة أفهم فيها الدرس">
    </div>
    <div class="field">
      <label>الشرح</label>
      <textarea id="postContent" placeholder="اكتبي شرحك هنا..."></textarea>
    </div>
    <div class="field">
      <label>إضافة مرفق (اختياري)</label>
      <div id="attachArea"></div>
      <div class="hint">يُرسل مع شرحك للمعلمة، ويظهر لزميلاتك بعد الاعتماد.</div>
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

function viewChallengeShare(){
  const lessons = state.lessons || [];
  const selected = state.shareLessonId || (lessons[0] && lessons[0].id) || '';
  return `
  <div class="content-app">
    ${pageHead('🔥 تحدي اليوم', 'شاركي ردك بالطريقة اللي تناسبك')}
    ${state.challenge && state.challenge.text ? `<div class="challenge-banner">${state.challenge.text}</div>` : ''}
    <div class="field">
      <label>الدرس المرتبط</label>
      <select id="challengeLesson">
        ${lessons.map(l => `<option value="${l.id}" ${l.id===selected?'selected':''}>${l.title}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>كيف تبين تجاوبين؟</label>
      <div id="challengeAttach"></div>
    </div>
    <button class="btn btn-coral" data-action="submit-challenge" ${state.loading?'disabled':''}>${state.loading?'جارِ الإرسال...':'إرسال للمعلمة'}</button>
  </div>`;
}
function renderChallengeAttach(){
  const box = document.getElementById('challengeAttach');
  if(!box) return;
  box.innerHTML = `
    <div class="attach-toggle three">
      <button type="button" class="attach-opt ${challengeMode==='text'?'selected':''}" data-action="pick-challenge-mode" data-mode="text">📝 نص</button>
      <button type="button" class="attach-opt ${challengeMode==='voice'?'selected':''}" data-action="pick-challenge-mode" data-mode="voice">🎙️ صوت</button>
      <button type="button" class="attach-opt ${challengeMode==='map'?'selected':''}" data-action="pick-challenge-mode" data-mode="map">🧠 خريطة</button>
    </div>
    ${challengeMode==='text' ? '<textarea id="challengeText" class="challenge-textarea" placeholder="اكتبي إجابتك هنا..."></textarea>' : ''}
    ${challengeMode==='voice' ? '<div id="voiceArea" class="attach-body"></div>' : ''}
    ${challengeMode==='map' ? '<div id="mapPreview" class="attach-body mm-preview"></div>' : ''}
    ${!challengeMode ? '<div class="hint" style="text-align:center;">اختاري طريقة الإجابة فوق.</div>' : ''}`;
  if(challengeMode === 'voice') renderVoiceArea();
  if(challengeMode === 'map') renderMapPreview();
}
async function handleSubmitChallenge(){
  const lessonId = document.getElementById('challengeLesson').value;
  if(!challengeMode){ showToast('اختاري طريقة الإجابة أول (نص، صوت، أو خريطة).'); return; }
  let content = '', mindMap = null, voice = null;
  if(challengeMode === 'text'){
    content = document.getElementById('challengeText').value.trim();
    if(!content){ showToast('اكتبي إجابتك قبل الإرسال'); return; }
  } else if(challengeMode === 'voice'){
    if(mediaRecorder && mediaRecorder.state === 'recording'){ showToast('أوقفي التسجيل قبل الإرسال.'); return; }
    if(!voiceNote){ showToast('سجّلي إجابتك الصوتية قبل الإرسال.'); return; }
    if(voiceNote.dataUrl.length > 400000){ showToast('التسجيل كبير، سجّلي مقطع أقصر.'); return; }
    voice = voiceNote;
    content = '🔥 إجابة صوتية على تحدي اليوم';
  } else if(challengeMode === 'map'){
    if(!mapDoc || mmNodeCount(mapDoc) < 2){ showToast('أضيفي خريطتك الذهنية قبل الإرسال.'); return; }
    mindMap = mmSerialize(mapDoc);
    if(JSON.stringify(mindMap).length > 60000){ showToast('الخريطة كبيرة جدًا، قلّلي عدد العقد.'); return; }
    content = '🔥 إجابة بخريطة ذهنية على تحدي اليوم';
  }
  setState({loading:true});
  try{
    const lesson = (state.lessons || []).find(l => l.id === lessonId);
    await createPost(db, {
      lessonId,
      subjectId: lesson ? lesson.subjectId : (state.subjects[0] && state.subjects[0].id),
      studentUid: state.profile.uid,
      studentName: state.profile.displayName,
      title: '🔥 تحدي اليوم',
      content,
      mindMap,
      voiceNote: voice,
    });
    mapDoc = null; voiceNote = null; challengeMode = null;
    setState({loading:false});
    navigate('shareSuccess');
  }catch(err){
    setState({loading:false});
    showToast('صار خطأ أثناء الإرسال، حاولي مرة أخرى.');
  }
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
    <button class="role-card" data-action="nav-saved-posts" style="margin-top:4px;">
      <div class="badge" style="background:var(--coral-soft)">🔖</div>
      <div><div class="r-title">شروحات محفوظة</div><div class="r-sub">ارجعي للشروحات اللي احتفظتِ فيها</div></div>
      <span class="chev">←</span>
    </button>
    <button class="link-btn" data-action="logout">تسجيل الخروج</button>
  </div>`;
}

function viewSavedPosts(){
  const posts = state.savedPosts || [];
  return `
  <div class="content-app">
    ${pageHead('🔖 شروحات محفوظة', 'الشروحات اللي احتفظتِ فيها عشان ترجعين لها بسهولة')}
    ${posts.length ? posts.map(postCard).join('') : `
      <div class="empty-state"><span class="emoji">🔖</span>ما حفظتِ أي شرح بعد. اضغطي «🔖 احتفظي فيها» تحت أي شرح يعجبك.</div>`}
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
      <button class="theme-toggle theme-toggle-abs" data-action="toggle-theme" aria-label="تبديل الوضع الداكن">${effectiveTheme()==='dark'?'☀️':'🌙'}</button>
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <span class="role-chip teacher">👩🏻‍🏫 معلمة</span>
    </div>
    <button class="role-card" data-action="nav-teacher-review" style="margin-top:4px;">
      <div class="badge" style="background:var(--coral-soft)">📥</div>
      <div><div class="r-title">${pendingCount} مشاركة تنتظر المراجعة</div><div class="r-sub">اضغطي لاعتماد أو رفض المشاركات</div></div>
      <span class="chev">←</span>
    </button>
    <div class="section-title">🔥 تحدي اليوم</div>
    <form id="challengeForm" class="challenge-edit-card">
      <textarea id="challengeInput" placeholder="مثال: اشرحي في 60 ثانية: لماذا لا يسقط برج بيزا؟">${state.challenge && state.challenge.text ? state.challenge.text : ''}</textarea>
      <button type="submit" class="btn btn-primary" ${state.loading?'disabled':''}>${state.loading?'جارِ الحفظ...':(state.challenge && state.challenge.text ? '💾 تحديث التحدي' : '🚀 نشر تحدي اليوم')}</button>
    </form>

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
  const t = POST_TYPES[p.type];
  return `
  <div class="post-card">
    <div class="p-head">
      <div class="badge sm" style="background:var(--primary-soft)">${t ? t.emoji : '💡'}</div>
      <div style="flex:1;">
        <div class="p-who">${p.studentName}</div>
        <div class="p-meta">${t ? t.label + ' · ' : ''}${lessonTitleById(p.lessonId)}</div>
      </div>
    </div>
    ${p.title ? `<div class="p-title">${p.title}</div>` : ''}
    <div class="p-body" style="margin-bottom:12px;">${p.content}</div>
    ${p.voiceNote && p.voiceNote.dataUrl ? `<audio controls src="${p.voiceNote.dataUrl}" class="post-audio" style="margin-bottom:12px;"></audio>` : ''}
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

function viewTeacherStats(){
  const t = state.teacherStats;
  if(!t){
    return `
    <div class="content-app">
      <div class="page-head" style="padding-top:2px;"><div><h2>📊 الإحصائيات</h2></div></div>
      <div class="empty-state"><span class="emoji">📊</span>ما فيه بيانات كافية بعد.</div>
    </div>`;
  }
  const rows = [
    ['👩🏻‍🎓 الطالبات المشاركات', t.studentsCount],
    ['💡 عدد الشروحات المعتمدة', t.explanationsCount],
    ['🆘 عدد الأسئلة', t.questionsCount],
    ['💬 عدد الإجابات', t.answersCount],
    ['⭐ عدد التفاعلات («أفادني»)', t.interactionsCount],
  ];
  return `
  <div class="content-app">
    <div class="page-head" style="padding-top:2px;"><div><h2>📊 الإحصائيات</h2></div></div>
    <div class="stats-grid">
      ${rows.map(([label, val]) => `
        <div class="stat-tile"><div class="stat-num">${val}</div><div class="stat-lbl">${label}</div></div>`).join('')}
    </div>

    ${t.topLessonId ? `
    <div class="section-title">🏆 أكثر درس تفاعلًا</div>
    <div class="info-card" style="margin-top:0;">
      <b>${lessonTitleById(t.topLessonId)}</b> — ${t.topLessonScore} تفاعل (شروحات وأسئلة معًا)
    </div>` : ''}

    <div class="section-title">⚠️ مفاهيم تحتاج دعمًا</div>
    ${t.needsSupport.length ? `
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${t.needsSupport.map(n => `
        <div class="quick-glance-row"><span>${lessonTitleById(n.lessonId)}</span><span class="qv">${n.count} سؤال</span></div>`).join('')}
    </div>
    <div class="hint" style="margin-top:8px;">الدروس اللي عليها أكثر أسئلة من الطالبات — مؤشر إنها تحتاج إعادة شرح بالحصة.</div>` : `
    <div class="empty-state"><span class="emoji">🎉</span>ما فيه مفاهيم بارزة تحتاج دعمًا إضافيًا حاليًا.</div>`}
  </div>`;
}

/* ---------- main render ---------- */
function render(){
  const app = document.getElementById('app');
  if(state.view !== 'sharePost' && state.view !== 'challengeShare' && mediaStream){
    stopRecording();
    if(mediaStream){ mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  }
  if(state.view === 'loading'){
    app.innerHTML = `<div class="content" style="text-align:center; padding-top:80px; color:var(--ink-soft); font-size:13px;">جارِ التحميل...</div>`;
    return;
  }
  if(state.view === 'landing'){ app.innerHTML = viewLanding(); return; }
  if(state.view === 'authForm'){ app.innerHTML = viewAuthForm(); return; }
  if(state.view === 'studentHome'){ app.innerHTML = viewStudentHome() + studentNav(); return; }
  if(state.view === 'subjectLessons'){ app.innerHTML = viewSubjectLessons() + studentNav(); return; }
  if(state.view === 'lessonDetail'){ app.innerHTML = viewLessonDetail() + studentNav(); return; }
  if(state.view === 'sharePost'){ app.innerHTML = viewSharePost() + studentNav(); renderAttachArea(); return; }
  if(state.view === 'challengeShare'){ app.innerHTML = viewChallengeShare() + studentNav(); renderChallengeAttach(); return; }
  if(state.view === 'shareSuccess'){ app.innerHTML = viewShareSuccess() + studentNav(); return; }
  if(state.view === 'askQuestion'){ app.innerHTML = viewAskQuestion() + studentNav(); return; }
  if(state.view === 'questionsList'){ app.innerHTML = viewQuestionsList() + studentNav(); return; }
  if(state.view === 'achievements'){ app.innerHTML = viewAchievements() + studentNav(); return; }
  if(state.view === 'savedPosts'){ app.innerHTML = viewSavedPosts() + studentNav(); return; }
  if(state.view === 'teacherHome'){ app.innerHTML = viewTeacherHome() + teacherNav(); return; }
  if(state.view === 'teacherReview'){ app.innerHTML = viewTeacherReview() + teacherNav(); return; }
  if(state.view === 'teacherStats'){ app.innerHTML = viewTeacherStats() + teacherNav(); return; }
  app.innerHTML = viewLanding();
}

/* ---------- events ---------- */
document.addEventListener('change', (e) => {
  if(e.target.id === 'postLesson'){
    state.shareLessonId = e.target.value;
    if(mapDoc && mmSetDefaultTitle(mapDoc, lessonTitleById(e.target.value))) renderMapPreview();
  }
});

document.addEventListener('input', (e) => {
  if(e.target.id === 'lessonSearchInput'){
    const term = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => renderSearchResults(term), 300);
  }
});

document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  if(!el) return;
  const action = el.dataset.action;
  if(action === 'choose-role'){
    setState({view:'authForm', role: el.dataset.role, mode:'login', error:'', success:''});
  } else if(action === 'back-to-landing'){
    setState({view:'landing', error:'', success:''});
  } else if(action === 'set-mode'){
    setState({mode: el.dataset.mode, error:'', success:''});
  } else if(action === 'toggle-theme'){
    toggleTheme();
  } else if(action === 'logout'){
    handleLogout();
  } else if(action === 'back'){
    goBack();
  } else if(action === 'nav-student-home'){
    setState({view:'studentHome', history:[]});
    refreshHomeStats();
  } else if(action === 'nav-teacher-home'){
    setState({view:'teacherHome', history:[]});
  } else if(action === 'nav-teacher-review'){
    openTeacherReview();
  } else if(action === 'nav-teacher-stats'){
    openTeacherStats();
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
    attachMode = null;
    voiceNote = null;
    if(mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
    navigate('sharePost');
  } else if(action === 'nav-challenge-share'){
    state.shareLessonId = state.lessons[0] ? state.lessons[0].id : '';
    challengeMode = null;
    mapDoc = null;
    voiceNote = null;
    if(mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
    navigate('challengeShare');
  } else if(action === 'pick-attach'){
    const mode = el.dataset.mode;
    if(mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
    attachMode = (attachMode === mode) ? null : mode;
    renderAttachArea();
  } else if(action === 'start-voice'){
    startRecording();
  } else if(action === 'stop-voice'){
    stopRecording();
  } else if(action === 'redo-voice'){
    voiceNote = null;
    renderVoiceArea();
  } else if(action === 'discard-voice'){
    discardVoice();
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
  } else if(action === 'nav-saved-posts'){
    openSavedPosts();
  } else if(action === 'like-post'){
    handleLikePost(el.dataset.id);
  } else if(action === 'toggle-bookmark'){
    handleToggleBookmark(el.dataset.id);
  } else if(action === 'submit-post'){
    handleSubmitPost();
  } else if(action === 'pick-challenge-mode'){
    if(mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording();
    challengeMode = (challengeMode === el.dataset.mode) ? null : el.dataset.mode;
    renderChallengeAttach();
  } else if(action === 'submit-challenge'){
    handleSubmitChallenge();
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
  if(e.target.id === 'challengeForm'){
    e.preventDefault();
    const text = document.getElementById('challengeInput').value.trim();
    if(!text){ showToast('اكتبي نص التحدي قبل النشر'); return; }
    handleSetChallenge(text);
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
const PRESS_SEL = '.btn, .role-card, .list-row, .pill-btn, .navitem, .qa-card, .lesson-row';
document.addEventListener('pointerdown', (e) => {
  const el = e.target && e.target.closest ? e.target.closest(PRESS_SEL) : null;
  if(el && !el.disabled) el.classList.add('pressed');
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    const el = e.target && e.target.closest ? e.target.closest(PRESS_SEL) : null;
    if(el) el.classList.remove('pressed');
  });
});

render();
