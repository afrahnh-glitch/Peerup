import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
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
  setAvatar, attachAvatarInfo, fetchAvatarsFor,
  setSpaceProgress, shareSpaceFact, fetchRecentSpaceFacts,
  submitLandingComment, fetchLandingComments, deleteLandingComment,
  startSpaceQuizAttempt, completeSpaceQuizAttempt, fetchSpaceQuizLeaderboard, deleteSpaceQuizResult,
} from "./content.js";
import {
  MindMapEditor, mmSerialize, mmThumbSvg, mmNodeCount, mmSetDefaultTitle, mmEsc, mmNodesLabel,
} from "./mindmap.js";

/* ==================================================================
   نظام أيقونات موحّد: SVG بسيط بنفس سماكة الخط لكل أيقونات الواجهة
   (التنقل، الأزرار، الشارات)، بدل الإيموجي المتفرّقة. تستخدم currentColor
   فتتبع لون النص تلقائيًا بالوضعين الفاتح والداكن بدون أي نسخة إضافية.
   الإيموجي التعبيرية (التوست، الاحتفالات، الحالات الفارغة) بقيت كما هي —
   هذي صوت المنصة، مو عناصر واجهة تحتاج توحيد.
   ================================================================== */
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 2"/><circle cx="12" cy="16.9" r=".2" fill="currentColor"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5.3a2 2 0 0 0 0 4H7"/><path d="M16 5h2.7a2 2 0 0 1 0 4H17"/><path d="M12 13v3"/><path d="M9 20h6"/><path d="M10 16.5h4v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lightbulb: '<path d="M9.5 18h5"/><path d="M10.3 21h3.4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2.2h5.2c0-1 .4-1.7 1-2.2A6 6 0 0 0 12 3Z"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v10A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-10Z"/><circle cx="12" cy="13" r="3.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M9 21h6"/>',
  map: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="8.3" r="1.9"/><circle cx="7.6" cy="15" r="1.9"/><circle cx="16.4" cy="15" r="1.9"/><path d="M12 10.2 8.4 13.4M12 10.2l3.6 3.2"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13"/>',
  bookmark: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1Z"/>',
  search: '<circle cx="11" cy="11" r="6.3"/><path d="M20 20l-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  moon: '<path d="M20 14.3A8.4 8.4 0 1 1 9.7 4a6.9 6.9 0 0 0 10.3 10.3Z"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  inbox: '<path d="M4 13 6.2 5.6A1 1 0 0 1 7.2 5h9.6a1 1 0 0 1 1 .6L20 13"/><path d="M4 13h4.8l1 2.4h4.4l1-2.4H20v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z"/>',
  refresh: '<path d="M4 11a8 8 0 0 1 14-5.2M20 13a8 8 0 0 1-14 5.2"/><path d="M18 3v4.5h-4.5M6 21v-4.5h4.5"/>',
  edit: '<path d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z"/><path d="M13.5 6.5l4 4"/>',
  save: '<path d="M5 4h11l3 3v13H5V4Z"/><path d="M8 4v5h7V4"/><path d="M8 14h8v6H8v-6Z"/>',
};
function icon(name, size = 20){
  const d = ICONS[name];
  if(!d) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ==================================================================
   نظام الصور الشخصية (Avatar): 6 شخصيات جاهزة مدمجة بالمشروع (SVG، بدون
   أي خدمة خارجية)، أو رابط صورة مرفوعة من الجهاز، أو حرف افتراضي.
   avatarHtml() هي نقطة الاستخدام الموحّدة بكل مكان يظهر فيه ملف طالبة.
   ================================================================== */
const AVATAR_IDS = ['avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05', 'avatar-06'];

/* ---------- أسبوع الفضاء: محتوى رحلة الاستكشاف (ميزة موسمية) ---------- */
const SPACE_QUIZ_BANK = [
  {
    q: 'أي كوكب بالمجموعة الشمسية أقرب للشمس؟',
    options: ['الأرض', 'عطارد', 'الزهرة', 'المريخ'],
    correct: 1,
    explain: 'عطارد أقرب كوكب للشمس، ويكمل دورة كاملة حولها خلال 88 يومًا أرضيًا بس.',
  },
  {
    q: 'أي كوكب أكبر كوكب بالمجموعة الشمسية؟',
    options: ['الأرض', 'زحل', 'المشتري', 'أورانوس'],
    correct: 2,
    explain: 'المشتري أكبر الكواكب بفارق كبير، حجمه يكفي يسع أكثر من 1300 كوكب بحجم الأرض.',
  },
  {
    q: 'كم عدد الكواكب بالمجموعة الشمسية؟',
    options: ['7', '8', '9', '10'],
    correct: 1,
    explain: 'ثمانية كواكب بعد ما استُبعد بلوتو من التصنيف سنة 2006 واعتُبر كوكبًا قزمًا.',
  },
  {
    q: 'أي قوة تخلي الكواكب تدور حول الشمس ومتماسكة بمداراتها؟',
    options: ['الجاذبية', 'المغناطيسية', 'الاحتكاك', 'الضغط الجوي'],
    correct: 0,
    explain: 'جاذبية الشمس الهائلة تحني مسار الكواكب باستمرار، فتضل تدور حولها بدل ما تنفلت بخط مستقيم.',
  },
  {
    q: 'ما اسم المجرة اللي تنتمي لها الأرض والمجموعة الشمسية؟',
    options: ['درب التبانة', 'المرأة المسلسلة', 'العنقاء', 'الدب الأكبر'],
    correct: 0,
    explain: 'درب التبانة مجرّتنا، فيها أكثر من 100 مليار نجم، والشمس وحدة منهم بس.',
  },
];
let SPACE_QUIZ = SPACE_QUIZ_BANK[0];
/* ---------- مسابقة أسبوع الفضاء: 10 أسئلة ثابتة، متنوعة الصعوبة ---------- */
const SPACE_COMPETITION_QUESTIONS = [
  {topic:'النظام الشمسي', q:'كم عدد الكواكب بالمجموعة الشمسية؟', options:['7','8','9','10'], correct:1},
  {topic:'الكواكب', q:'أي كوكب يُلقّب بـ"الكوكب الأحمر"؟', options:['المشتري','الزهرة','المريخ','زحل'], correct:2},
  {topic:'النجوم', q:'النجوم تُنتج طاقتها أساسًا عن طريق عملية...؟', options:['الانشطار النووي','الاندماج النووي','الاحتراق الكيميائي','التبخر'], correct:1},
  {topic:'الشمس', q:'ما حالة المادة الغالبة بالشمس؟', options:['صلبة','سائلة','غازية','بلازما'], correct:3},
  {topic:'القمر', q:'لماذا نرى دائمًا نفس وجه القمر من الأرض؟', options:['لأن القمر لا يدور حول نفسه إطلاقًا','لأن دورانه حول نفسه يساوي زمن دورانه حول الأرض','لأن الأرض نفسها لا تدور','لأن القمر بعيد جدًا فما يبين فرق'], correct:1},
  {topic:'الجاذبية', q:'أي وحدة من هذي تقيس "كتلة" الجسم (لا وزنه)؟', options:['نيوتن','كيلوجرام','باسكال','واط'], correct:1},
  {topic:'الضوء', q:'سرعة الضوء بالفراغ تقارب...؟', options:['300 كم/ث','3,000 كم/ث','300,000 كم/ث','3 مليون كم/ث'], correct:2},
  {topic:'المجرات', q:'ما اسم أقرب مجرة كبيرة لمجرتنا درب التبانة؟', options:['درب التبانة نفسها','مجرة المرأة المسلسلة (أندروميدا)','سحابة ماجلان الكبرى','العنقاء'], correct:1},
  {topic:'استكشاف الفضاء', q:'ما اسم أول قمر صناعي يُطلق للفضاء؟', options:['سبوتنيك 1','أبولو 11','فوييجر 1','هابل'], correct:0},
  {topic:'رواد الفضاء', q:'من أول إنسان مشى على سطح القمر؟', options:['يوري غاغارين','نيل أرمسترونغ','باز ألدرن','جون غلين'], correct:1},
];
function shuffleQuizOptions(q){
  const idx = q.options.map((_, i) => i);
  for(let i = idx.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {...q, options: idx.map(i => q.options[i]), correct: idx.indexOf(q.correct)};
}

const SPACE_FACTS = [
  'أشعة الشمس تحتاج حوالي 8 دقائق و20 ثانية عشان توصل للأرض.',
  'المريخ فيه أكبر بركان بالمجموعة الشمسية، وارتفاعه يقارب 3 أضعاف ارتفاع إفرست.',
  'يوم واحد على كوكب الزهرة أطول من سنته الكاملة حول الشمس.',
  'نظام الكواكب الحلقية مو بس لزحل — عطارد والمشتري وأورانوس ونبتون عندهم حلقات أخف بكثير.',
  'الفضاء مو فاضي تمامًا؛ فيه جزيئات غاز وغبار متناثرة حتى بين النجوم.',
];
// profile-like: أي كائن فيه (avatarUrl أو avatarId) و(displayName أو studentName)
function avatarHtml(obj, size = 44){
  const name = obj.displayName || obj.studentName || '?';
  const url = obj.avatarUrl || obj.authorAvatarUrl;
  const aid = obj.avatarId || obj.authorAvatarId;
  const style = `width:${size}px; height:${size}px; border-radius:50%; flex-shrink:0; object-fit:cover; display:block;`;
  if(url) return `<img src="${url}" class="avatar-img" alt="" style="${style}">`;
  if(aid && AVATAR_IDS.includes(aid)) return `<img src="images/${aid}.svg" class="avatar-img" alt="" style="${style}">`;
  const fs = Math.round(size * 0.42);
  return `<div class="avatar-fallback" style="${style} display:flex; align-items:center; justify-content:center; font-size:${fs}px;">${(name[0]||'?')}</div>`;
}

// الأسئلة فيها طبقتين (السؤال + إجاباته المتداخلة)، فنجمع كل المعرّفات
// من الطبقتين سوا ونطلبها بدُفعة واحدة بدل استدعاء منفصل لكل طبقة.
async function attachAvatarsToQuestions(questions){
  if(!questions.length) return questions;
  const allUids = [];
  questions.forEach(q => { allUids.push(q.studentUid); (q.answers||[]).forEach(a => allUids.push(a.studentUid)); });
  const map = await fetchAvatarsFor(db, allUids).catch(() => ({}));
  const pick = (uid) => ({authorAvatarId: (map[uid]||{}).avatarId || null, authorAvatarUrl: (map[uid]||{}).avatarUrl || null});
  return questions.map(q => ({
    ...q, ...pick(q.studentUid),
    answers: (q.answers || []).map(a => ({...a, ...pick(a.studentUid)})),
  }));
}

const POST_TYPES = {
  quick:   {emoji: '📝', label: 'شرح سريع'},
  image:   {emoji: '🖼️', label: 'صورة / خريطة مفاهيم'},
  example: {emoji: '💡', label: 'مثال من عندي'},
};

/* ---------- Firebase init ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* ---------- state ---------- */
// تحية تتغيّر حسب وقت الجهاز: ٥ص–١١:٥٩ص صباح الخير، وإلا مساء الخير
function greetingWord(){
  const h = new Date().getHours();
  return (h >= 5 && h < 12) ? 'صباح الخير' : 'مساء الخير';
}
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
  avatarModalOpen: false,
  avatarUploading: false,
  allStudents: [],
  viewedStudent: null,
  viewedStats: null,
  spaceStation: 1,
  spaceQuizAnswer: null,
  spaceFactIndex: 0,
  spaceRecentFacts: [],
  landingComments: [],
  spaceCompName: '',
  spaceCompAttemptId: null,
  spaceCompQuestions: [],
  spaceCompIndex: 0,
  spaceCompScore: 0,
  spaceCompAnswered: null,
  spaceCompDone: false,
  spaceCompResult: null,
  spaceCompLeaderboard: [],
  history: [],           // in-app back stack once inside student/teacher screens
};

function setState(patch){ Object.assign(state, patch); render(); }

/* ---------- خريطة ذهنية: محرر حقيقي بملء الشاشة (mindmap.js) ----------
   الخريطة تُحفظ كبيانات منظّمة (عقد + علاقات + إحداثيات) داخل مستند المشاركة
   نفسه في Firestore — بدون صور، بدون Storage، بدون اشتراك مدفوع. */
let mapDoc = null;   // الخريطة الجاري بناؤها؛ تبقى بالذاكرة أثناء كتابة المشاركة
let mmOpen = null;   // المحرر المفتوح حاليًا (إن وُجد)
let attachMode = null;   // null | 'voice' | 'map' | 'photo' — المرفق المختار حاليًا بنموذج المشاركة

/* ---------- صورة حقيقية (Firebase Storage، يحتاج خطة Blaze) ----------
   نضغط الصورة بالمتصفح قبل الرفع (أقصى بُعد 1280px، JPEG) حتى ما يكبر
   حجم التخزين والنقل بدون داعٍ — خطة Blaze تُحاسَب على الاستخدام. ---------- */
let photoBlob = null;      // الصورة المضغوطة الجاهزة للرفع
let photoPreviewUrl = null; // رابط معاينة محلي (object URL)
function compressImage(file, maxDim = 1280, quality = 0.82){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let {width, height} = img;
      if(width > maxDim || height > maxDim){
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale); height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}
async function handlePhotoSelect(file){
  if(!file || !file.type.startsWith('image/')){ showToast('اختاري ملف صورة فقط.'); return; }
  try{
    const blob = await compressImage(file);
    if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoBlob = blob;
    photoPreviewUrl = URL.createObjectURL(blob);
  }catch(err){
    showToast('تعذّر تجهيز الصورة، جربي صورة ثانية.');
    return;
  }
  renderAttachArea();
}
function discardPhoto(){
  if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoBlob = null; photoPreviewUrl = null;
  renderAttachArea();
}

/* ---------- حفظ اختيار الصورة الشخصية (Avatar جاهز أو افتراضي) ---------- */
async function handleSetAvatar({avatarId, avatarUrl}){
  try{
    await setAvatar(db, state.profile.uid, {avatarId, avatarUrl});
    setState({
      profile: {...state.profile, avatarId, avatarUrl},
      avatarModalOpen: false,
    });
    showToast('✨ تم تحديث صورتك الشخصية');
  }catch(err){
    showToast('صار خطأ أثناء الحفظ، حاولي مرة أخرى.');
  }
}
/* ---------- رفع صورة شخصية من الجهاز (نفس أسلوب ضغط صور الشروحات) ---------- */
async function handleAvatarUpload(file){
  if(!file || !file.type.startsWith('image/')){ showToast('اختاري ملف صورة فقط.'); return; }
  setState({avatarUploading: true});
  try{
    const blob = await compressImage(file, 480, 0.85);
    const path = `avatars/${state.profile.uid}/${Date.now()}.jpg`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, {contentType: 'image/jpeg'});
    const url = await getDownloadURL(fileRef);
    await setAvatar(db, state.profile.uid, {avatarId: null, avatarUrl: url});
    setState({
      profile: {...state.profile, avatarId: null, avatarUrl: url},
      avatarModalOpen: false, avatarUploading: false,
    });
    showToast('✨ تم تحديث صورتك الشخصية');
  }catch(err){
    setState({avatarUploading: false});
    showToast('تعذّر رفع الصورة. تأكدي من تفعيل Storage بمشروعك، أو جربي صورة أصغر.');
  }
}
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
        <button type="button" class="pill-btn" data-action="redo-voice">${icon('refresh',16)} إعادة التسجيل</button>
        <button type="button" class="pill-btn" data-action="discard-voice">${icon('trash',16)} حذف</button>
      </div>`;
  } else {
    box.innerHTML = `
      <button type="button" class="btn btn-primary" data-action="start-voice">${icon('mic',17)} ابدئي التسجيل</button>
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
    <div class="attach-toggle three">
      <button type="button" class="attach-opt ${attachMode==='photo'?'selected':''}" data-action="pick-attach" data-mode="photo">${icon('camera',17)} صورة</button>
      <button type="button" class="attach-opt ${attachMode==='voice'?'selected':''}" data-action="pick-attach" data-mode="voice">${icon('mic',17)} صوت</button>
      <button type="button" class="attach-opt ${attachMode==='map'?'selected':''}" data-action="pick-attach" data-mode="map">${icon('map',17)} خريطة</button>
    </div>
    ${attachMode==='photo' ? '<div id="photoArea" class="attach-body"></div>' : ''}
    ${attachMode==='voice' ? '<div id="voiceArea" class="attach-body"></div>' : ''}
    ${attachMode==='map' ? '<div id="mapPreview" class="attach-body mm-preview"></div>' : ''}`;
  if(attachMode === 'photo') renderPhotoArea();
  if(attachMode === 'voice') renderVoiceArea();
  if(attachMode === 'map') renderMapPreview();
}
function renderPhotoArea(){
  const box = document.getElementById('photoArea');
  if(!box) return;
  if(photoPreviewUrl){
    box.innerHTML = `
      <img src="${photoPreviewUrl}" class="photo-preview" alt="معاينة الصورة">
      <div class="voice-actions">
        <label class="pill-btn" for="photoInput">${icon('refresh',16)} استبدال الصورة</label>
        <button type="button" class="pill-btn" data-action="discard-photo">${icon('trash',16)} حذف</button>
      </div>
      <input type="file" id="photoInput" accept="image/*" style="display:none;">`;
  } else {
    box.innerHTML = `
      <label class="btn btn-primary" for="photoInput" style="display:flex; cursor:pointer;">${icon('camera',17)} اختاري أو صوّري صورة</label>
      <div class="hint" style="text-align:center; margin-top:6px;">تُضغط تلقائيًا قبل الرفع</div>
      <input type="file" id="photoInput" accept="image/*" style="display:none;">`;
  }
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
        <div class="mm-preview-cap">${icon('map',15)} ${mmNodesLabel(data.nodes.length)} — اضغطي للتعديل</div>
      </div>
      <div class="mm-preview-actions">
        <button type="button" class="btn btn-primary" data-action="open-mindmap">${icon('edit',17)} تعديل الخريطة</button>
        <button type="button" class="pill-btn" data-action="clear-mindmap">${icon('trash',16)} مسح الخريطة</button>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="mm-empty">
        <div class="mm-empty-planet">🪐</div>
        <div>ابني خريطة للدرس: فكرة رئيسية في المنتصف، فروع، وفروع فرعية مرتبطة بها.</div>
      </div>
      <button type="button" class="btn btn-primary" data-action="open-mindmap">${icon('map',17)} افتحي محرر الخريطة</button>`;
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
        <div class="mm-preview-cap">${icon('map',15)} خريطة ذهنية · ${mmNodesLabel(Math.min(mm.nodes.length, 40))} — اضغطي للعرض الكامل</div>
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
// صفحة البداية عامة (أي زائر، قبل تسجيل الدخول)، فنجيب التعليقات العامة
// معها مباشرة بدل ما ننتظر أي حالة تسجيل دخول.
async function openLanding(){
  const landingComments = await fetchLandingComments(db, 12).catch(() => []);
  setState({view: 'landing', landingComments});
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
  posts = await attachAvatarInfo(db, posts).catch(() => posts);
  const questionsWithAvatars = await attachAvatarsToQuestions(questions).catch(() => questions);
  navigate('lessonDetail', {currentLesson: lesson, posts, questions: questionsWithAvatars});
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
  let savedPosts = await fetchBookmarkedPosts(db, state.profile.uid).catch(() => []);
  savedPosts = await attachAvatarInfo(db, savedPosts).catch(() => savedPosts);
  setState({loading:false});
  navigate('savedPosts', {savedPosts});
}
async function refreshHomeStats(){
  const myStats = await computeStudentPoints(db, state.profile.uid).catch(() => state.myStats);
  setState({myStats});
}
function openSpaceJourney(){
  SPACE_QUIZ = SPACE_QUIZ_BANK[Math.floor(Math.random() * SPACE_QUIZ_BANK.length)];
  setState({spaceStation: 1, spaceQuizAnswer: null, spaceFactIndex: 0, spaceRecentFacts: []});
  navigate('spaceJourney');
}
function openSpaceQuiz(){
  setState({
    spaceCompName: '', spaceCompAttemptId: null, spaceCompQuestions: [],
    spaceCompIndex: 0, spaceCompScore: 0, spaceCompAnswered: null,
    spaceCompDone: false, spaceCompResult: null,
  });
  navigate('spaceQuiz');
}
async function handleStartSpaceQuiz(){
  const name = document.getElementById('spaceCompNameInput').value.trim();
  if(name.length < 2 || name.length > 30){ showToast('اكتبي اسمك (بين 2 و30 حرف)'); return; }
  setState({loading: true});
  try{
    const attemptId = await startSpaceQuizAttempt(db, name);
    const questions = SPACE_COMPETITION_QUESTIONS.map(shuffleQuizOptions);
    setState({
      loading: false, spaceCompName: name, spaceCompAttemptId: attemptId,
      spaceCompQuestions: questions, spaceCompIndex: 0, spaceCompScore: 0, spaceCompAnswered: null,
    });
  }catch(err){
    setState({loading: false});
    showToast('صار خطأ أثناء البدء، حاولي مرة أخرى.');
  }
}
async function handleAnswerSpaceCompQuiz(i){
  if(state.spaceCompAnswered !== null) return;
  const q = state.spaceCompQuestions[state.spaceCompIndex];
  const correct = i === q.correct;
  const nextScore = state.spaceCompScore + (correct ? 1 : 0);
  setState({spaceCompAnswered: i, spaceCompScore: nextScore});
  setTimeout(async () => {
    const isLast = state.spaceCompIndex === state.spaceCompQuestions.length - 1;
    if(!isLast){
      setState({spaceCompIndex: state.spaceCompIndex + 1, spaceCompAnswered: null});
      return;
    }
    setState({loading: true});
    try{
      const completionTime = await completeSpaceQuizAttempt(db, state.spaceCompAttemptId, nextScore);
      const result = {id: state.spaceCompAttemptId, score: nextScore, completionTime};
      try{ localStorage.setItem('peerup-space-quiz-result', JSON.stringify(result)); }catch(_e){ /* تجاهل */ }
      setState({loading: false, spaceCompDone: true, spaceCompResult: result});
    }catch(err){
      setState({loading: false});
      showToast('صار خطأ أثناء حفظ نتيجتك، حاولي مرة أخرى.');
    }
  }, 500);
}
async function openSpaceQuizLeaderboard(){
  setState({loading: true});
  const spaceCompLeaderboard = await fetchSpaceQuizLeaderboard(db, 50).catch(() => []);
  setState({loading: false});
  navigate('spaceQuizLeaderboard', {spaceCompLeaderboard});
}
async function handleSpaceQuizAnswer(i){
  if(state.spaceQuizAnswer !== null) return;
  setState({spaceQuizAnswer: i});
  // زائرة بدون حساب: تشوف صح/خطأ والتفسير عادي، بس ما فيه نقاط تُحفظ —
  // مافيه حساب أصلًا نربط فيه هالنقاط.
  if(i === SPACE_QUIZ.correct && state.profile){
    try{
      await setSpaceProgress(db, state.profile.uid, {spaceWeekQuizCorrect: true});
      const myStats = await computeStudentPoints(db, state.profile.uid).catch(() => state.myStats);
      setState({myStats});
    }catch(err){ /* صامت: الإجابة صحيحة محليًا حتى لو فشل حفظ النقاط مؤقتًا */ }
  }
}
async function openSpaceFactsWall(){
  const spaceRecentFacts = await fetchRecentSpaceFacts(db, 6).catch(() => []);
  setState({spaceRecentFacts});
}
function handleSpaceNextStation(){
  if(state.spaceStation === 1){ setState({spaceStation: 2}); }
  else if(state.spaceStation === 2){ setState({spaceStation: 3}); openSpaceFactsWall(); }
}
function handleSpaceNextFact(){
  setState({spaceFactIndex: (state.spaceFactIndex + 1) % SPACE_FACTS.length});
}
async function handleSubmitSpaceFact(){
  const text = document.getElementById('spaceFactInput').value.trim();
  if(!text){ showToast('اكتبي معلومتك قبل المشاركة'); return; }
  const loggedIn = !!state.profile;
  let name = loggedIn ? state.profile.displayName : document.getElementById('spaceFactName').value.trim();
  if(!loggedIn && !name){ showToast('اكتبي اسمك قبل المشاركة'); return; }
  setState({loading: true});
  try{
    await shareSpaceFact(db, {uid: loggedIn ? state.profile.uid : null, studentName: name, text});
    if(loggedIn){
      await setSpaceProgress(db, state.profile.uid, {spaceWeekBadge: true});
      const myStats = await computeStudentPoints(db, state.profile.uid).catch(() => state.myStats);
      setState({loading: false, myStats, spaceStation: 'done', profile: {...state.profile, spaceWeekBadge: true}});
    } else {
      // زائرة بدون حساب: شكرًا بدون أي نقاط أو شارة مزيّفة ما وراها حساب فعلي
      setState({loading: false, spaceStation: 'done'});
    }
  }catch(err){
    setState({loading: false});
    showToast('صار خطأ أثناء المشاركة، حاولي مرة أخرى.');
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
async function openStudentsList(){
  setState({loading:true});
  const allStudents = await fetchLeaderboard(db, 999).catch(() => []);
  setState({loading:false});
  navigate('studentsList', {allStudents});
}
async function openStudentProfile(uid){
  setState({loading:true});
  const [snap, stats] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    computeStudentPoints(db, uid).catch(() => null),
  ]);
  setState({loading:false});
  if(!snap.exists()){ showToast('تعذّر إيجاد ملف هذي الطالبة.'); return; }
  const profile = {uid, ...snap.data()};
  navigate('studentProfile', {viewedStudent: profile, viewedStats: stats});
}
async function openQuestionsList(){
  let allQuestions = await fetchQuestionsWithAnswers(db).catch(() => []);
  allQuestions = await attachAvatarsToQuestions(allQuestions).catch(() => allQuestions);
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
  if(attachMode === 'photo' && !photoBlob){ showToast('اختاري صورة قبل الإرسال.'); return; }
  setState({loading:true});
  try{
    let imageUrl = null;
    if(attachMode === 'photo' && photoBlob){
      const path = `posts/${state.profile.uid}/${Date.now()}.jpg`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, photoBlob, {contentType: 'image/jpeg'});
      imageUrl = await getDownloadURL(fileRef);
    }
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
      imageUrl,
    });
    mapDoc = null;
    voiceNote = null;
    if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoBlob = null; photoPreviewUrl = null;
    attachMode = null;
    setState({loading:false});
    navigate('shareSuccess');
  }catch(err){
    setState({loading:false});
    if(attachMode === 'photo'){
      showToast('تعذّر رفع الصورة. تأكدي من تفعيل Storage بمشروعك، أو حاولي بصورة أصغر.');
    } else {
      showToast('صار خطأ أثناء الإرسال، حاولي مرة أخرى.');
    }
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
    let freshAnswers = await fetchAnswersForQuestion(db, questionId).catch(() => []);
    const avMap = await fetchAvatarsFor(db, freshAnswers.map(a => a.studentUid)).catch(() => ({}));
    freshAnswers = freshAnswers.map(a => ({...a, authorAvatarId: (avMap[a.studentUid]||{}).avatarId || null, authorAvatarUrl: (avMap[a.studentUid]||{}).avatarUrl || null}));
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
/* ---------- تعليقات الزوار بصفحة البداية (بدون تسجيل دخول) ---------- */
async function handleSubmitLandingComment(){
  const name = document.getElementById('commenterName').value.trim();
  const text = document.getElementById('commenterText').value.trim();
  if(!name || !text){ showToast('اكتبي اسمك ورأيك قبل الإرسال'); return; }
  // حدّ بسيط من طرف المتصفح (مرة كل 30 ثانية) يمنع الضغط المتكرر بالخطأ أو
  // سبام بسيط. هذا مو حماية حقيقية على مستوى الخادم (تحتاج Cloud Functions)،
  // بس أبسط رادع ممكن بدون بنية تحتية جديدة.
  let last = 0;
  try{ last = Number(localStorage.getItem('peerup-last-comment') || 0); }catch(_e){ /* تجاهل */ }
  if(Date.now() - last < 30000){
    showToast('تم إرسال تعليق قبل قليل، جربي بعد شوي.');
    return;
  }
  setState({loading: true});
  try{
    await submitLandingComment(db, {name, text});
    try{ localStorage.setItem('peerup-last-comment', String(Date.now())); }catch(_e){ /* تجاهل */ }
    const landingComments = await fetchLandingComments(db, 12).catch(() => state.landingComments);
    document.getElementById('commenterName').value = '';
    document.getElementById('commenterText').value = '';
    setState({loading: false, landingComments});
    showToast('شكرًا على رأيك! 💜');
  }catch(err){
    setState({loading: false});
    showToast('صار خطأ أثناء الإرسال، حاولي مرة أخرى.');
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
  let pendingPosts = await fetchPendingPosts(db).catch(() => []);
  pendingPosts = await attachAvatarInfo(db, pendingPosts).catch(() => pendingPosts);
  navigate('teacherReview', {pendingPosts});
}
async function openTeacherComments(){
  const landingComments = await fetchLandingComments(db, 100).catch(() => []);
  navigate('teacherComments', {landingComments});
}
async function openSpaceQuizAdmin(){
  const spaceCompLeaderboard = await fetchSpaceQuizLeaderboard(db, 200).catch(() => []);
  navigate('spaceQuizAdmin', {spaceCompLeaderboard});
}
async function handleDeleteSpaceQuizResult(id){
  try{
    await deleteSpaceQuizResult(db, id);
    setState({spaceCompLeaderboard: (state.spaceCompLeaderboard || []).filter(r => r.id !== id)});
    showToast('تم حذف المشاركة');
  }catch(err){
    showToast('صار خطأ أثناء الحذف، تأكدي إنك مسجّلة كمعلمة.');
  }
}
async function handleResetSpaceQuizResults(){
  const list = state.spaceCompLeaderboard || [];
  if(!list.length) return;
  setState({loading: true});
  try{
    await Promise.all(list.map(r => deleteSpaceQuizResult(db, r.id)));
    setState({loading: false, spaceCompLeaderboard: []});
    showToast('تم حذف كل نتائج المسابقة');
  }catch(err){
    setState({loading: false});
    showToast('صار خطأ أثناء إعادة الضبط، حاولي مرة أخرى.');
  }
}
async function handleDeleteLandingComment(id){
  try{
    await deleteLandingComment(db, id);
    setState({landingComments: (state.landingComments || []).filter(c => c.id !== id)});
    showToast('تم إخفاء التعليق');
  }catch(err){
    showToast('صار خطأ أثناء الحذف، تأكدي إنك مسجّلة كمعلمة.');
  }
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
  } else if(!user && state.view !== 'landing' && state.view !== 'roleChoice' && state.view !== 'authForm'){
    openLanding();
  } else if(state.view === 'loading' && !user){
    openLanding();
  }
});

/* ---------- shared UI pieces ---------- */
function brandHeader(sub){
  return `
  <div class="brand-center">
    <img src="images/logo.png" class="brand-mark brand-mark-light" alt="PeerUp">
    <img src="images/logo-white.png" class="brand-mark brand-mark-dark" alt="PeerUp">
    <div class="bname">PeerUp</div>
    <div class="tag">نرتقي معًا</div>
    <div class="dev-credit">منصة تعليمية من تطوير<br>المعلمة أفراح الحربي</div>
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
    <button class="navitem ${active('studentHome')}" data-action="nav-student-home"><span class="ic-wrap">${icon('home')}</span>الرئيسية</button>
    <button class="navitem ${active('subjectLessons')||active('lessonDetail')}" data-action="nav-lessons"><span class="ic-wrap">${icon('book')}</span>الدروس</button>
    <button class="navitem" data-action="nav-share"><span class="nav-raised">${icon('plus', 22)}</span>إضافة</button>
    <button class="navitem ${active('questionsList')}" data-action="nav-questions-list"><span class="ic-wrap">${icon('help')}</span>الأسئلة</button>
    <button class="navitem ${active('achievements')}" data-action="nav-achievements"><span class="ic-wrap">${icon('trophy')}</span>إنجازي</button>
  </div>`;
}
function teacherNav(){
  const active = v => state.view === v ? 'active' : '';
  return `
  <div class="bottomnav">
    <button class="navitem ${active('teacherHome')}" data-action="nav-teacher-home"><span class="ic-wrap">${icon('home')}</span>الرئيسية</button>
    <button class="navitem ${active('teacherReview')}" data-action="nav-teacher-review"><span class="ic-wrap">${icon('inbox')}</span>المراجعة</button>
    <button class="navitem" data-action="coming-soon"><span class="ic-wrap">${icon('help')}</span>الأسئلة</button>
    <button class="navitem ${active('teacherStats')}" data-action="nav-teacher-stats"><span class="ic-wrap">${icon('stats')}</span>الإحصائيات</button>
  </div>`;
}

/* ---------- auth views ---------- */
function viewLanding(){
  const comments = state.landingComments || [];
  const journeySteps = [
    {ic:'💡', w:'افهمي'}, {ic:'💬', w:'شاركي'}, {ic:'🆘', w:'اسألي'}, {ic:'🤝', w:'ساعدي'}, {ic:'🚀', w:'ارتقي'},
  ];
  return `
  <div class="landing-topbar">
    <div class="landing-topbar-brand"><img src="images/logo.png" alt="PeerUp"><span>PeerUp</span></div>
    <button class="landing-topbar-btn" data-action="nav-role-choice">تسجيل الدخول</button>
  </div>
  <div class="content landing-intro">
    <div class="landing-hero" id="landing-top">
      <img src="images/logo.png" class="brand-mark" alt="PeerUp" style="margin-bottom:10px;">
      <div class="bname">PeerUp</div>
      <div class="tag">نرتقي معًا</div>
      <div class="landing-flow-tag">افهمي، ساعدي، ارتقي…</div>
      <p class="landing-intro-p">من طالبة إلى طالبة…<br>المعرفة تنتقل.</p>
      <a href="#peerup-story" class="btn btn-primary landing-cta-main">استكشفي PeerUp</a>
    </div>

    <div class="landing-section" id="peerup-story">
      <h3 class="landing-h3">من فكرة بسيطة… إلى رحلة معرفية</h3>
      <div class="landing-story-card">
        <p class="landing-p" style="margin-bottom:10px;">ماذا لو أصبحت معرفة الطالبة وسيلة لمساعدة طالبة أخرى؟</p>
        <p class="landing-p" style="margin-bottom:0;">في PeerUp لا يقتصر التعلم على أن أفهم أنا،<br>بل يمتد إلى أن أشارك ما فهمته،<br>وأسأل عندما أحتاج المساعدة،<br>وأساعد غيري على الفهم.</p>
      </div>
    </div>

    <div class="landing-section">
      <h3 class="landing-h3">رحلة PeerUp</h3>
      <div class="landing-journey-path">
        ${journeySteps.map((s,i) => `
          <div class="landing-journey-step">
            <div class="landing-journey-ic">${s.ic}</div>
            <div class="landing-journey-label">${s.w}</div>
          </div>
          ${i < journeySteps.length-1 ? '<div class="landing-journey-connector"></div>' : ''}`).join('')}
      </div>
    </div>

    <div class="space-week-card" style="margin:22px 0;">
      <img src="images/planet.svg" class="space-week-planet" alt="" aria-hidden="true">
      <img src="images/stars.svg" class="space-week-stars" alt="" aria-hidden="true">
      <div class="space-week-tag">PeerUp × أسبوع الفضاء</div>
      <div class="space-week-text">المعرفة رحلة… والفضاء أعظم رحلة.<br>مهمتك تبدأ هنا 🚀</div>
      <button class="btn space-week-btn" data-action="nav-space-journey">ابدئي المهمة ←</button>
    </div>

    <div class="space-quiz-card" style="margin-bottom:22px;">
      <img src="images/stars.svg" class="space-quiz-stars" alt="" aria-hidden="true">
      <div class="space-quiz-tag">🚀 مسابقة أسبوع الفضاء</div>
      <div class="space-quiz-text">اختبري معلوماتك عن الفضاء،<br>واجعلي اسمك بين أسرع المستكشفات!</div>
      <button class="btn space-quiz-btn" data-action="nav-space-quiz">ابدئي المسابقة ←</button>
    </div>

    <div class="landing-section">
      <h3 class="landing-h3">صوتك جزء من رحلتنا 💜</h3>
      <p class="landing-p" style="margin-top:-6px;">ما رأيك في PeerUp؟</p>
      <form id="landingCommentForm" class="landing-comment-form">
        <input type="text" id="commenterName" placeholder="اسمك" maxlength="40">
        <textarea id="commenterText" placeholder="اكتبي رأيك في PeerUp..." maxlength="300"></textarea>
        <button type="submit" class="btn btn-primary" ${state.loading ? 'disabled' : ''}>${state.loading ? 'جارِ الإرسال...' : 'إرسال التعليق'}</button>
      </form>
      ${comments.length ? `
      <div class="landing-comments-rail">
        ${comments.map(c => `
          <div class="landing-comment-card">
            <div class="landing-comment-name">${mmEsc(c.name)}</div>
            <div class="landing-comment-text">${mmEsc(c.text)}</div>
          </div>`).join('')}
      </div>` : ''}
    </div>

    <div class="landing-footer">
      <div class="landing-footer-icon">💡</div>
      <div class="landing-footer-line1">من تطوير</div>
      <div class="landing-footer-line2">المعلمة أفراح الحربي</div>
      <div class="landing-footer-year">PeerUp 2026</div>
    </div>

    <div class="landing-section" style="text-align:center;">
      <h3 class="landing-h3">جاهزة للانضمام إلى PeerUp؟</h3>
      <button class="btn landing-cta-main" data-action="nav-role-choice">✨ تسجيل الدخول</button>
    </div>
  </div>`;
}
function viewRoleChoice(){
  return `
  <div class="content">
    <button class="back-btn" data-action="back-to-landing-intro">←</button>
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

function spaceStationDot(num, label){
  const st = state.spaceStation;
  const status = st === 'done' || num < st ? 'done' : (num === st ? 'current' : 'locked');
  return `<div class="journey-dot ${status}"><span class="journey-dot-ic">${status === 'done' ? icon('check', 14) : num}</span><span class="journey-dot-label">${label}</span></div>`;
}
function fmtMMSS(ms){
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function spaceQuizResultMsg(score){
  if(score === 10) return '🌟 مستكشفة فضاء متميزة!';
  if(score >= 8) return '🚀 أداء رائع!';
  if(score >= 6) return '🪐 رحلة جميلة!';
  return '🌌 استكشفي أكثر… الرحلة لم تنتهِ!';
}
function viewSpaceQuiz(){
  // زائرة سبق شاركت من نفس الجهاز
  let prior = null;
  try{ prior = JSON.parse(localStorage.getItem('peerup-space-quiz-result') || 'null'); }catch(_e){ /* تجاهل */ }
  if(prior && !state.spaceCompDone){
    return `
    <div class="content-app space-journey-bg">
      <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
      ${pageHead('🌌 مسابقة أسبوع الفضاء')}
      <div class="journey-complete">
        <img src="images/rocket.svg" class="journey-complete-rocket" alt="">
        <h2>أنتِ ضمن قائمة المستكشفات 🚀</h2>
        <p>سبق لك المشاركة في هذه المسابقة من هذا الجهاز.</p>
        <div class="points-big">${prior.score} / 10</div>
        <p style="margin-top:-6px;">الزمن: ${fmtMMSS(prior.completionTime)}</p>
        <button class="btn btn-primary" style="margin-top:14px;" data-action="nav-space-quiz-leaderboard">🏆 عرض لوحة المتصدرين</button>
        <button class="btn" style="margin-top:10px; background:rgba(255,255,255,.14); color:#fff;" data-action="back-to-landing-intro">العودة إلى PeerUp</button>
      </div>
    </div>`;
  }

  if(state.spaceCompDone){
    const r = state.spaceCompResult || {score:0, completionTime:0};
    return `
    <div class="content-app space-journey-bg">
      <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
      ${pageHead('🌌 مسابقة أسبوع الفضاء')}
      <div class="journey-complete">
        <img src="images/rocket.svg" class="journey-complete-rocket" alt="">
        <h2>🚀 انتهت رحلتك!</h2>
        <p>أحسنتِ يا ${mmEsc(state.spaceCompName)}</p>
        <div class="points-big">${r.score} / 10</div>
        <p style="margin-top:-6px;">الزمن: ${fmtMMSS(r.completionTime)}</p>
        <p style="font-weight:700; color:#fff; margin-top:4px;">${spaceQuizResultMsg(r.score)}</p>
        <button class="btn btn-primary" style="margin-top:16px;" data-action="nav-space-quiz-leaderboard">🏆 شاهدي لوحة المتصدرين</button>
        <button class="btn" style="margin-top:10px; background:rgba(255,255,255,.14); color:#fff;" data-action="back-to-landing-intro">العودة إلى PeerUp</button>
      </div>
    </div>`;
  }

  if(!state.spaceCompAttemptId){
    return `
    <div class="content-app space-journey-bg">
      <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
      ${pageHead('🌌 مسابقة أسبوع الفضاء', '10 أسئلة… 10 فرص لتثبتي معرفتك بالفضاء.')}
      <div class="journey-station">
        <h3 class="journey-station-title">اكتبي اسمك</h3>
        <input type="text" id="spaceCompNameInput" class="journey-share-input" placeholder="اسم المشاركة" maxlength="30">
        <button class="btn btn-primary" data-action="start-space-quiz" ${state.loading ? 'disabled' : ''}>${state.loading ? 'جارِ البدء...' : 'ابدئي الرحلة 🚀'}</button>
      </div>
    </div>`;
  }

  const q = state.spaceCompQuestions[state.spaceCompIndex];
  const answered = state.spaceCompAnswered !== null;
  const dots = state.spaceCompQuestions.map((_, i) => i < state.spaceCompIndex ? '●' : (i === state.spaceCompIndex ? '●' : '○')).join('');
  return `
  <div class="content-app space-journey-bg">
    <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
    ${pageHead('🌌 مسابقة أسبوع الفضاء')}
    <div class="quiz-progress-head">
      <div class="quiz-progress-label">السؤال ${state.spaceCompIndex + 1} من ${state.spaceCompQuestions.length}</div>
      <div class="quiz-progress-dots">${dots}</div>
    </div>
    <div class="quiz-card">
      <div class="quiz-q">${mmEsc(q.q)}</div>
      ${q.options.map((opt, i) => `
        <button class="quiz-opt ${answered && i===state.spaceCompAnswered ? 'selected-pending' : ''}" data-action="answer-space-comp-quiz" data-i="${i}" ${answered ? 'disabled' : ''}>${mmEsc(opt)}</button>`).join('')}
    </div>
  </div>`;
}

function viewSpaceQuizLeaderboard(){
  const list = state.spaceCompLeaderboard || [];
  let myResult = null;
  try{ myResult = JSON.parse(localStorage.getItem('peerup-space-quiz-result') || 'null'); }catch(_e){ /* تجاهل */ }
  const medal = (i) => i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : '';
  return `
  <div class="content-app space-journey-bg">
    <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
    ${pageHead('🏆 لوحة مستكشفات الفضاء')}
    ${list.length ? `
    <div class="leaderboard-list">
      ${list.map((r, i) => {
        const isMe = myResult && myResult.id === r.id;
        return `
        <div class="leaderboard-row ${isMe ? 'is-me' : ''}">
          <div class="lb-rank">${medal(i) || '#'+(i+1)}</div>
          <div class="lb-name">${isMe ? '✨ أنتِ — ' : ''}${mmEsc(r.name)}</div>
          <div class="lb-score">${r.score}/10</div>
          <div class="lb-time">${fmtMMSS(r.completionTime)}</div>
        </div>`;
      }).join('')}
    </div>` : `<div class="empty-state"><span class="emoji">🚀</span>ولا مستكشفة شاركت لين الحين.</div>`}
    <button class="btn" style="margin-top:18px; background:rgba(255,255,255,.14); color:#fff;" data-action="back-to-landing-intro">العودة إلى PeerUp</button>
  </div>`;
}

function viewSpaceJourney(){
  return `
  <div class="content-app space-journey-bg">
    <img src="images/planet.svg" class="journey-bg-planet" alt="" aria-hidden="true">
    ${pageHead('رحلة PeerUp في الفضاء', 'اكتشفي، فكري، وشاركي معرفتك في رحلة قصيرة بين الكواكب والنجوم.')}
    <div class="journey-path">
      ${spaceStationDot(1, 'استكشفي')}
      <div class="journey-line ${state.spaceStation === 'done' || state.spaceStation > 1 ? 'done' : ''}"></div>
      ${spaceStationDot(2, 'اكتشفي')}
      <div class="journey-line ${state.spaceStation === 'done' || state.spaceStation > 2 ? 'done' : ''}"></div>
      ${spaceStationDot(3, 'شاركي')}
    </div>
    ${state.spaceStation === 'done' ? spaceJourneyCompleteHtml()
      : state.spaceStation === 1 ? spaceStation1Html()
      : state.spaceStation === 2 ? spaceStation2Html()
      : spaceStation3Html()}
  </div>`;
}
function spaceStation1Html(){
  const answered = state.spaceQuizAnswer !== null;
  return `
  <div class="journey-station">
    <h3 class="journey-station-title">🔭 استكشفي</h3>
    <p class="journey-station-desc">اختبري معرفتك بسؤال قصير عن الفضاء والفيزياء.</p>
    <div class="quiz-card">
      <div class="quiz-q">${SPACE_QUIZ.q}</div>
      ${SPACE_QUIZ.options.map((opt, i) => `
        <button class="quiz-opt ${answered ? (i === SPACE_QUIZ.correct ? 'correct' : (i === state.spaceQuizAnswer ? 'wrong' : '')) : ''}"
          data-action="answer-space-quiz" data-i="${i}" ${answered ? 'disabled' : ''}>${opt}</button>`).join('')}
      ${answered ? `
      <div class="quiz-feedback ${state.spaceQuizAnswer === SPACE_QUIZ.correct ? 'good' : 'bad'}">
        ${state.spaceQuizAnswer === SPACE_QUIZ.correct ? 'أحسنتِ! إجابة صحيحة' : `الإجابة الصحيحة: ${SPACE_QUIZ.options[SPACE_QUIZ.correct]}`}
        <div class="quiz-explain">${SPACE_QUIZ.explain}</div>
      </div>
      <button class="btn btn-primary" data-action="space-next-station">التالي ←</button>` : ''}
    </div>
  </div>`;
}
function spaceStation2Html(){
  const fact = SPACE_FACTS[state.spaceFactIndex % SPACE_FACTS.length];
  return `
  <div class="journey-station">
    <h3 class="journey-station-title">🪐 اكتشفي</h3>
    <p class="journey-station-desc">اكتشفي معلومة فضائية قصيرة ومثيرة.</p>
    <div class="fact-card">
      <div class="fact-tag">هل تعلمين؟</div>
      <div class="fact-text">${fact}</div>
      <button type="button" class="pill-btn" data-action="space-next-fact">معلومة ثانية ${icon('refresh', 13)}</button>
    </div>
    <button class="btn btn-primary" style="margin-top:16px;" data-action="space-next-station">التالي ←</button>
  </div>`;
}
function spaceStation3Html(){
  const loggedIn = !!state.profile;
  return `
  <div class="journey-station">
    <h3 class="journey-station-title">🚀 شاركي</h3>
    <p class="journey-station-desc">اكتبي معلومة أو حقيقة فضائية تعرفينها وشاركي معرفتك مع زميلاتك.</p>
    ${!loggedIn ? '<input type="text" id="spaceFactName" class="journey-share-input" placeholder="اسمك" maxlength="40" style="min-height:unset; margin-bottom:10px;">' : ''}
    <textarea id="spaceFactInput" class="journey-share-input" placeholder="اكتبي معلومتك الفضائية هنا..."></textarea>
    <button class="btn btn-primary" data-action="submit-space-fact" ${state.loading ? 'disabled' : ''}>${state.loading ? 'جارِ المشاركة...' : 'شاركي معرفتك'}</button>
    ${state.spaceRecentFacts.length ? `
    <div class="section-title" style="margin-top:24px;">معلومات شاركتها زميلاتك</div>
    ${state.spaceRecentFacts.map(f => `<div class="fact-mini"><b>${mmEsc(f.studentName)}:</b> ${mmEsc(f.text)}</div>`).join('')}` : ''}
  </div>`;
}
function spaceJourneyCompleteHtml(){
  const loggedIn = !!state.profile;
  const s = state.myStats || {points: 0};
  return `
  <div class="journey-complete">
    <img src="images/rocket.svg" class="journey-complete-rocket" alt="">
    <h2>أتممتِ المهمة!</h2>
    <p>المعرفة رحلة… وكل مشاركة تقرّبنا من النجوم.</p>
    ${loggedIn ? `
    <div class="points-big">${s.points} PeerPoints</div>
    <div class="badge-earned-card" style="margin:18px auto 0; max-width:260px;">
      <img src="images/planet.svg" class="badge-earned-icon" alt="" aria-hidden="true">
      <div><div class="badge-earned-title">مستكشفة PeerUp</div><div class="badge-earned-sub">تم الحصول عليها</div></div>
    </div>
    <button class="btn btn-primary" style="margin-top:20px;" data-action="nav-student-home">رجوع للرئيسية</button>` : `
    <p style="margin-top:4px;">سجّلي دخولك المرة الجاية عشان تُحفظ نقاطك وتحصلين على شارة «مستكشفة PeerUp».</p>
    <button class="btn btn-primary" style="margin-top:14px;" data-action="nav-role-choice">تسجيل الدخول</button>
    <button class="btn" style="margin-top:10px; background:var(--surface); border:1.5px solid var(--border); color:var(--ink);" data-action="back-to-landing-intro">رجوع لصفحة البداية</button>`}
  </div>`;
}

function viewAboutStory(){
  return `
  <div class="content-app about-story">
    ${pageHead('قصة PeerUp')}
    <img src="images/stars.svg" class="about-stars" alt="" aria-hidden="true">
    <h2 class="about-title">من فكرة تطوعية إلى رحلة معرفية</h2>
    <p class="about-p">بدأت PeerUp من فكرة بسيطة:<br>ماذا لو أصبحت معرفة الطالبة وسيلة لمساعدة طالبة أخرى؟</p>

    <div class="about-flow">
      ${['افهمي','شاركي','اسألي','ساعدي','ارتقي'].map((w,i,arr) => `
        <span class="about-flow-step">${w}</span>${i<arr.length-1 ? '<span class="about-flow-arrow">←</span>' : ''}`).join('')}
    </div>

    <h3 class="about-h3">لماذا PeerUp؟</h3>
    <p class="about-p">لأن التعلم لا يتوقف عند أن أفهم أنا…<br>بل يكتمل عندما أساعد غيري على الفهم.</p>

    <div class="about-closing">
      <p>كل طالبة تعرف شيئًا…<br>قد تكون سببًا في أن تعرفه طالبة أخرى.</p>
    </div>
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
        <div class="brand-mini"><img src="images/logo-white.png" class="bm-mark" alt="PeerUp"><div class="bm-name">PeerUp</div></div>
        <div class="hero-end">
          <button class="theme-toggle" data-action="toggle-theme" aria-label="تبديل الوضع الداكن">${icon(effectiveTheme()==='dark'?'sun':'moon',17)}</button>
          <div class="hero-avatar">${avatarHtml(p, 36)}</div>
        </div>
      </div>
      <h1>${greetingWord()}، ${p.displayName || ''} 👋</h1>
      <p class="sub">افهمي، ساعدي، ارتقي…</p>
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
          <div class="qa-badge" style="background:var(--primary-soft); color:var(--primary);">${icon('lightbulb', 22)}</div>
          <div class="qa-title">فهمتها<br>بطريقتي</div>
        </button>
        <button class="qa-card" data-action="nav-ask">
          <div class="qa-badge" style="background:var(--coral-soft); color:var(--coral);">${icon('help', 22)}</div>
          <div class="qa-title">أنقذوني<br>أحتاج مساعدة</div>
        </button>
      </div>
      <button class="qa-card qa-wide" data-action="nav-lessons">
        <div class="qa-badge" style="background:var(--skyblue-soft); color:var(--on-skyblue-soft);">${icon('book', 22)}</div>
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

      <div class="space-week-card">
        <img src="images/planet.svg" class="space-week-planet" alt="" aria-hidden="true">
        <img src="images/stars.svg" class="space-week-stars" alt="" aria-hidden="true">
        <div class="space-week-tag">أسبوع الفضاء مع PeerUp</div>
        <div class="space-week-text">لأن المعرفة رحلة… والفضاء أعظم رحلة.</div>
        <button class="btn space-week-btn" data-action="nav-space-journey">ابدئي رحلة الاستكشاف ←</button>
      </div>

      <div class="space-quiz-card">
        <img src="images/stars.svg" class="space-quiz-stars" alt="" aria-hidden="true">
        <div class="space-quiz-tag">🚀 مسابقة أسبوع الفضاء</div>
        <div class="space-quiz-text">اختبري معلوماتك عن الفضاء،<br>واجعلي اسمك بين أسرع المستكشفات!</div>
        <button class="btn space-quiz-btn" data-action="nav-space-quiz">ابدئي المسابقة ←</button>
      </div>

      ${lessons.length ? `
      <div class="section-title">📚 دروس ${subj ? subj.name : ''}</div>
      <div class="lesson-list">
        ${lessons.map((l, i) => `
          <button class="lesson-row" data-action="nav-lesson" data-id="${l.id}">
            <div class="lesson-ic">${i + 1}</div>
            <div class="lesson-mid"><div class="lesson-title">${l.title}</div></div>
            <span class="chev">←</span>
          </button>`).join('')}
      </div>` : `
      <div class="empty-state" style="margin-top:24px;">
        <span class="emoji">📭</span>
        المحتوى لسه ما تهيّأ. اطلبي من معلمتك تسجل دخولها وتضغط زر "تهيئة المحتوى" من لوحتها.
      </div>`}
      <button class="peerup-credit" data-action="nav-about-story">
        <div class="credit-name">PeerUp</div>
        <div class="credit-sub">من تطوير المعلمة أفراح الحربي</div>
      </button>
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
    <div class="field search-wrap" style="margin-bottom:16px;">
      ${icon('search', 16)}
      <input type="search" id="lessonSearchInput" placeholder="ابحثي باسم الدرس أو عنوان الشرح أو نصه..." autocomplete="off">
    </div>
    <div id="searchResultsArea"></div>
    <div id="lessonListArea">
      ${subj ? `<div class="subject-tag">${subj.emoji} ${subj.name}</div>` : ''}
      ${lessons.length ? `
      <div class="lesson-list">
        ${lessons.map((l, i) => `
          <button class="lesson-row" data-action="nav-lesson" data-id="${l.id}">
            <div class="lesson-ic">${i + 1}</div>
            <div class="lesson-mid"><div class="lesson-title">${l.title}</div></div>
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
  matches = await attachAvatarInfo(db, matches).catch(() => matches);
  if(document.getElementById('lessonSearchInput') && document.getElementById('lessonSearchInput').value.trim() !== q) return; // تغيّر البحث أثناء الانتظار
  results.innerHTML = matches.length
    ? `<div class="section-title">${icon('search',15)} ${matches.length} نتيجة</div>` + matches.map(p => postCard({...p, _searchResult:true})).join('')
    : `<div class="empty-state"><span class="emoji">${icon('search',28)}</span>ما فيه نتائج لـ«${q}».</div>`;
}

function postCard(p){
  const isMine = state.profile && p.studentUid === state.profile.uid;
  const pending = p.status === 'pending';
  const t = POST_TYPES[p.type]; // النوع صار اختياريًا؛ موجود فقط بمشاركات قديمة قبل هذا التحديث
  return `
  <div class="post-card">
    <div class="p-head">
      ${avatarHtml(p, 38)}
      <div style="flex:1;">
        <div class="p-who">${p.studentName}${isMine ? ' (أنتِ)' : ''}</div>
        ${(state.view==='savedPosts' || p._searchResult) ? `<div class="p-meta">${lessonTitleById(p.lessonId)}</div>` : (t ? `<div class="p-meta">${t.label}</div>` : '')}
      </div>
      ${pending ? `<span class="pending-tag">⏳ بانتظار الاعتماد</span>` : ''}
    </div>
    ${p.title ? `<div class="p-title">${p.title}</div>` : ''}
    <div class="p-body">${p.content}</div>
    ${p.imageUrl ? `<img src="${p.imageUrl}" class="post-image" alt="صورة الشرح" loading="lazy">` : ''}
    ${p.voiceNote && p.voiceNote.dataUrl ? `<audio controls src="${p.voiceNote.dataUrl}" class="post-audio"></audio>` : ''}
    ${mindMapBlock(p)}
    ${!pending ? `
    <div style="margin-top:11px; display:flex; gap:8px;">
      <button class="pill-btn ${p.likedByMe?'liked':''}" data-action="like-post" data-id="${p.id}" ${p.likedByMe||isMine?'disabled':''}>
        💡 أفادني <span>${p.likesCount||0}</span>
      </button>
      <button class="pill-btn ${p.bookmarked?'saved':''}" data-action="toggle-bookmark" data-id="${p.id}">
        ${icon('bookmark',14)} ${p.bookmarked ? 'محفوظ' : 'احتفظي فيها'}
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
    <div class="p-meta q-asker" style="margin-bottom:8px;">${avatarHtml(q,20)} سألتها ${q.studentName}${showLessonTag ? ' · ' + lessonTitleById(q.lessonId) : ''}</div>
    <button class="link-btn" style="margin:0; text-align:right;" data-action="toggle-question" data-id="${q.id}">
      ${q.answers.length ? `💬 ${q.answers.length} إجابة${q.answers.length>1?'ات':''} — ${expanded?'إخفاء':'عرض'}` : (expanded ? 'إخفاء نموذج الإجابة' : '✍️ كوني أول من تجاوب')}
    </button>
    ${expanded ? `
      ${q.answers.map(a => `<div class="answer-line">${avatarHtml(a,18)} <b>${a.studentName}:</b> ${a.text}</div>`).join('')}
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
    <button class="btn btn-primary" style="margin-top:4px;" data-action="nav-share" data-lesson="${l?l.id:''}">${icon('lightbulb',17)} شاركي فهمك بهالدرس</button>

    <div class="section-title">🆘 الأسئلة المتعلقة بالدرس</div>
    ${questions.length ? questions.map(questionCard).join('') : `
      <div class="empty-state"><span class="emoji">🆘</span>ولا سؤال لهالدرس بعد.</div>`}
    <button class="btn btn-coral" style="margin-top:4px;" data-action="nav-ask" data-lesson="${l?l.id:''}">${icon('help',17)} اسألي عن هالدرس</button>
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
    <button class="btn btn-primary" data-action="submit-post" ${state.loading?'disabled':''}>${state.loading?(attachMode==='photo'?'جارِ رفع الصورة...':'جارِ الإرسال...'):'إرسال للمعلمة'}</button>
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
      <button type="button" class="attach-opt ${challengeMode==='text'?'selected':''}" data-action="pick-challenge-mode" data-mode="text">${icon('edit',17)} نص</button>
      <button type="button" class="attach-opt ${challengeMode==='voice'?'selected':''}" data-action="pick-challenge-mode" data-mode="voice">${icon('mic',17)} صوت</button>
      <button type="button" class="attach-opt ${challengeMode==='map'?'selected':''}" data-action="pick-challenge-mode" data-mode="map">${icon('map',17)} خريطة</button>
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
      <div class="profile-avatar-wrap">
        ${avatarHtml(p, 84)}
        <button class="avatar-edit-btn" data-action="open-avatar-picker" aria-label="تغيير الصورة">${icon('camera',14)}</button>
      </div>
      <h2 style="margin:10px 0 0;">${p.displayName || ''}</h2>
      <button class="link-btn" style="margin:2px 0 0;" data-action="open-avatar-picker">تغيير الصورة</button>
      <div class="points-big">${s.points} PeerPoints</div>
    </div>
    <div style="display:flex; gap:10px; margin:16px 0 22px;">
      <div class="stat-mini"><div class="num">${s.explanationsCount}</div><div class="lbl">💡 شروحات</div></div>
      <div class="stat-mini"><div class="num">${s.helpedCount}</div><div class="lbl">🤝 ساعدتِ طالبات</div></div>
      <div class="stat-mini"><div class="num">${s.likesReceived}</div><div class="lbl">⭐ أفادني</div></div>
    </div>
    ${p.spaceWeekBadge ? `
    <div class="badge-earned-card">
      <img src="images/planet.svg" class="badge-earned-icon" alt="" aria-hidden="true">
      <div><div class="badge-earned-title">مستكشفة PeerUp</div><div class="badge-earned-sub">تم الحصول عليها</div></div>
    </div>` : ''}
    <div class="section-title stars-title-row"><img src="images/stars.svg" class="title-stars" alt="">🔥 نجوم PeerUp</div>
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${board.length ? board.map((st,i) => {
        const isMe = st.uid === p.uid;
        return `
        <button class="list-row" ${isMe ? 'style="cursor:default;" disabled' : `data-action="view-student-profile" data-uid="${st.uid}"`}>
          <div style="width:22px; text-align:center; font-weight:700; color:var(--ink-faint); flex-shrink:0;">${i+1}</div>
          ${avatarHtml(st, 30)}
          <div style="flex:1; font-weight:700; color:var(--ink);">${st.displayName}${isMe ? ' (أنتِ)' : ''}</div>
          <div style="color:var(--primary); font-weight:700; font-size:12.5px;">${st.points} نقطة</div>
          ${!isMe ? '<span class="chev">←</span>' : ''}
        </button>`;
      }).join('') : `<div class="empty-state">ولا طالبة سجّلت نقاط لسه.</div>`}
    </div>
    <button class="role-card" data-action="nav-students-list" style="margin-top:4px;">
      <div class="badge" style="background:var(--primary-soft); color:var(--primary);">${icon('trophy',20)}</div>
      <div><div class="r-title">كل الطالبات</div><div class="r-sub">شوفي كل طالبة ونقاطها بالتفصيل</div></div>
      <span class="chev">←</span>
    </button>
    <button class="role-card" data-action="nav-saved-posts" style="margin-top:4px;">
      <div class="badge" style="background:var(--coral-soft); color:var(--coral);">${icon('bookmark',20)}</div>
      <div><div class="r-title">شروحات محفوظة</div><div class="r-sub">ارجعي للشروحات اللي احتفظتِ فيها</div></div>
      <span class="chev">←</span>
    </button>
    <button class="link-btn" data-action="logout">تسجيل الخروج</button>
  </div>
  ${state.avatarModalOpen ? avatarModalHtml() : ''}`;
}

function avatarModalHtml(){
  const p = state.profile || {};
  const current = p.avatarUrl ? 'custom' : (p.avatarId || null);
  return `
  <div class="avatar-modal-backdrop" data-action="close-avatar-picker">
    <div class="avatar-modal" data-action="noop">
      <div class="avatar-modal-head">
        <h3>اختاري شخصيتك في PeerUp</h3>
        <button class="avatar-modal-close" data-action="close-avatar-picker">${icon('close',16)}</button>
      </div>
      ${state.avatarUploading ? `
      <div class="empty-state" style="margin:10px 0;">جارِ رفع الصورة...</div>` : `
      <div class="avatar-grid">
        ${AVATAR_IDS.map(id => `
          <button class="avatar-opt ${current===id?'selected':''}" data-action="pick-avatar" data-id="${id}">
            <img src="images/${id}.svg" alt="">
            ${current===id ? `<span class="avatar-check">${icon('check',12)}</span>` : ''}
          </button>`).join('')}
      </div>
      <div class="avatar-modal-actions">
        <label class="pill-btn" for="avatarUploadInput">${icon('camera',15)} رفع صورة من الجهاز</label>
        <input type="file" id="avatarUploadInput" accept="image/*" style="display:none;">
        <button type="button" class="pill-btn" data-action="use-default-avatar">استخدام الصورة الافتراضية</button>
      </div>`}
    </div>
  </div>`;
}

function viewStudentsList(){
  const list = state.allStudents || [];
  return `
  <div class="content-app">
    ${pageHead('الطالبات', `${list.length} طالبة مسجّلة`)}
    ${list.length ? `
    <div class="card" style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:4px 12px;">
      ${list.map((st,i) => {
        const isMe = st.uid === state.profile.uid;
        return `
        <button class="list-row" ${isMe ? 'style="cursor:default;" disabled' : `data-action="view-student-profile" data-uid="${st.uid}"`}>
          <div style="width:20px; text-align:center; font-weight:700; color:var(--ink-faint); font-size:12px; flex-shrink:0;">${i+1}</div>
          ${avatarHtml(st, 34)}
          <div style="flex:1; font-weight:700; color:var(--ink); font-size:13.5px;">${st.displayName}${isMe ? ' (أنتِ)' : ''}</div>
          <div style="color:var(--primary); font-weight:700; font-size:12px;">${st.points} نقطة</div>
          ${!isMe ? '<span class="chev">←</span>' : ''}
        </button>`;
      }).join('')}
    </div>` : `<div class="empty-state"><span class="emoji">👩🏻‍🎓</span>ما فيه طالبات مسجّلات بعد.</div>`}
  </div>`;
}

function viewStudentProfile(){
  const st = state.viewedStudent || {};
  const s = state.viewedStats || {points:0, explanationsCount:0, answersCount:0, likesReceived:0, helpedCount:0};
  return `
  <div class="content-app">
    ${pageHead(st.displayName || 'ملف طالبة')}
    <div class="dash-header">
      ${avatarHtml(st, 84)}
      <h2 style="margin:10px 0 0;">${st.displayName || ''}</h2>
      <div class="points-big">${s.points} PeerPoints</div>
    </div>
    <div class="stats-grid">
      <div class="stat-tile"><div class="stat-num">${s.explanationsCount}</div><div class="stat-lbl">💡 شرح</div></div>
      <div class="stat-tile"><div class="stat-num">${s.answersCount}</div><div class="stat-lbl">🆘 إجابة</div></div>
      <div class="stat-tile"><div class="stat-num">${s.helpedCount}</div><div class="stat-lbl">🤝 ساعدت</div></div>
    </div>
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
      <button class="theme-toggle theme-toggle-abs" data-action="toggle-theme" aria-label="تبديل الوضع الداكن">${icon(effectiveTheme()==='dark'?'sun':'moon',17)}</button>
      <div class="dash-avatar">${(p.displayName||'?')[0]}</div>
      <h2 style="margin:0;">${p.displayName || ''}</h2>
      <span class="role-chip teacher">👩🏻‍🏫 معلمة</span>
    </div>
    <button class="role-card" data-action="nav-teacher-review" style="margin-top:4px;">
      <div class="badge" style="background:var(--coral-soft); color:var(--coral);">${icon('inbox',20)}</div>
      <div><div class="r-title">${pendingCount} مشاركة تنتظر المراجعة</div><div class="r-sub">اضغطي لاعتماد أو رفض المشاركات</div></div>
      <span class="chev">←</span>
    </button>
    <button class="role-card" data-action="nav-teacher-comments" style="margin-top:4px;">
      <div class="badge" style="background:var(--primary-soft); color:var(--primary);">💬</div>
      <div><div class="r-title">تعليقات الزوار</div><div class="r-sub">راجعي آراء الزوار وأخفي غير المناسب</div></div>
      <span class="chev">←</span>
    </button>
    <button class="role-card" data-action="nav-space-quiz-admin" style="margin-top:4px;">
      <div class="badge" style="background:var(--primary-soft); color:var(--primary);">🚀</div>
      <div><div class="r-title">نتائج مسابقة الفضاء</div><div class="r-sub">راجعي النتائج واحذفي أي مشاركة غير مناسبة</div></div>
      <span class="chev">←</span>
    </button>
    <div class="section-title">🔥 تحدي اليوم</div>
    <form id="challengeForm" class="challenge-edit-card">
      <textarea id="challengeInput" placeholder="مثال: اشرحي في 60 ثانية: لماذا لا يسقط برج بيزا؟">${state.challenge && state.challenge.text ? state.challenge.text : ''}</textarea>
      <button type="submit" class="btn btn-primary" ${state.loading?'disabled':''}>${state.loading?'جارِ الحفظ...':(state.challenge && state.challenge.text ? icon('save',17)+' تحديث التحدي' : icon('plus',17)+' نشر تحدي اليوم')}</button>
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
    <button class="btn btn-primary" style="margin-top:14px;" data-action="seed-content" ${state.loading?'disabled':''}>${state.loading?'جارِ التهيئة...':icon('refresh',17)+' تهيئة / تحديث الدروس الأساسية'}</button>
    ${subjCount>0 ? `
    <div class="section-title">إضافة درس جديد لمادة ${state.subjects[0] ? state.subjects[0].name : ''}</div>
    <form id="addLessonForm">
      <div class="field">
        <input type="text" id="newLessonTitle" placeholder="مثال: قوانين نيوتن للحركة" required>
      </div>
      <button type="submit" class="btn btn-primary" ${state.loading?'disabled':''}>${state.loading?'جارِ الإضافة...':icon('plus',17)+' إضافة الدرس'}</button>
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
      ${avatarHtml(p, 38)}
      <div style="flex:1;">
        <div class="p-who">${p.studentName}</div>
        <div class="p-meta">${t ? t.label + ' · ' : ''}${lessonTitleById(p.lessonId)}</div>
      </div>
    </div>
    ${p.title ? `<div class="p-title">${p.title}</div>` : ''}
    <div class="p-body" style="margin-bottom:12px;">${p.content}</div>
    ${p.imageUrl ? `<img src="${p.imageUrl}" class="post-image" alt="صورة الشرح" loading="lazy" style="margin-bottom:12px;">` : ''}
    ${p.voiceNote && p.voiceNote.dataUrl ? `<audio controls src="${p.voiceNote.dataUrl}" class="post-audio" style="margin-bottom:12px;"></audio>` : ''}
    ${mindMapBlock(p)}
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary" style="width:auto; flex:1;" data-action="approve-post" data-id="${p.id}">${icon('check',17)} اعتماد</button>
      <button class="btn" style="width:auto; flex:1; background:var(--surface); border:1.5px solid var(--border); color:var(--ink);" data-action="reject-post" data-id="${p.id}">${icon('close',17)} رفض</button>
      <button class="btn" style="width:auto; padding:0 14px; background:var(--danger-soft); color:var(--danger);" data-action="delete-post" data-id="${p.id}">${icon('trash',17)}</button>
    </div>
  </div>`;
}

function viewSpaceQuizAdmin(){
  const results = state.spaceCompLeaderboard || [];
  return `
  <div class="content-app">
    <div class="page-head" style="padding-top:2px;">
      <div><h2>🚀 نتائج مسابقة الفضاء</h2><div class="p-sub">${results.length} مشاركة</div></div>
    </div>
    ${results.length ? `
    <button class="btn" style="width:auto; padding:9px 16px; margin-bottom:14px; background:var(--danger-soft); color:var(--danger); font-size:12.5px;" data-action="reset-space-quiz-results">إعادة ضبط كل النتائج</button>
    ${results.map(r => `
      <div class="post-card">
        <div class="p-head">
          <div style="flex:1;"><div class="p-who">${mmEsc(r.name)}</div><div class="p-meta">${r.score}/10 · ${fmtMMSS(r.completionTime)}</div></div>
          <button class="btn" style="width:auto; padding:0 12px; background:var(--danger-soft); color:var(--danger);" data-action="delete-space-quiz-result" data-id="${r.id}">${icon('trash',16)}</button>
        </div>
      </div>`).join('')}` : `
      <div class="empty-state"><span class="emoji">🚀</span>ولا مشاركة وصلت بعد.</div>`}
  </div>`;
}

function viewTeacherComments(){
  const comments = state.landingComments || [];
  return `
  <div class="content-app">
    <div class="page-head" style="padding-top:2px;">
      <div><h2>💬 تعليقات الزوار</h2><div class="p-sub">${comments.length} تعليق على صفحة البداية</div></div>
    </div>
    ${comments.length ? comments.map(c => `
      <div class="post-card">
        <div class="p-head">
          <div style="flex:1;"><div class="p-who">${mmEsc(c.name)}</div></div>
          <button class="btn" style="width:auto; padding:0 12px; background:var(--danger-soft); color:var(--danger);" data-action="delete-landing-comment" data-id="${c.id}">${icon('trash',16)}</button>
        </div>
        <div class="p-body">${mmEsc(c.text)}</div>
      </div>`).join('') : `
      <div class="empty-state"><span class="emoji">💬</span>ولا تعليق وصل بعد.</div>`}
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
  if(state.view === 'roleChoice'){ app.innerHTML = viewRoleChoice(); return; }
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
  if(state.view === 'aboutStory'){ app.innerHTML = viewAboutStory() + studentNav(); return; }
  if(state.view === 'spaceJourney'){ app.innerHTML = viewSpaceJourney() + (state.profile ? studentNav() : ''); return; }
  if(state.view === 'spaceQuiz'){ app.innerHTML = viewSpaceQuiz() + (state.profile ? studentNav() : ''); return; }
  if(state.view === 'spaceQuizLeaderboard'){ app.innerHTML = viewSpaceQuizLeaderboard() + (state.profile ? studentNav() : ''); return; }
  if(state.view === 'studentsList'){ app.innerHTML = viewStudentsList() + studentNav(); return; }
  if(state.view === 'studentProfile'){ app.innerHTML = viewStudentProfile() + studentNav(); return; }
  if(state.view === 'teacherHome'){ app.innerHTML = viewTeacherHome() + teacherNav(); return; }
  if(state.view === 'teacherReview'){ app.innerHTML = viewTeacherReview() + teacherNav(); return; }
  if(state.view === 'teacherComments'){ app.innerHTML = viewTeacherComments() + teacherNav(); return; }
  if(state.view === 'spaceQuizAdmin'){ app.innerHTML = viewSpaceQuizAdmin() + teacherNav(); return; }
  if(state.view === 'teacherStats'){ app.innerHTML = viewTeacherStats() + teacherNav(); return; }
  app.innerHTML = viewLanding();
}

/* ---------- events ---------- */
document.addEventListener('change', (e) => {
  if(e.target.id === 'postLesson'){
    state.shareLessonId = e.target.value;
    if(mapDoc && mmSetDefaultTitle(mapDoc, lessonTitleById(e.target.value))) renderMapPreview();
  }
  if(e.target.id === 'photoInput' && e.target.files && e.target.files[0]){
    handlePhotoSelect(e.target.files[0]);
  }
  if(e.target.id === 'avatarUploadInput' && e.target.files && e.target.files[0]){
    handleAvatarUpload(e.target.files[0]);
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
    // "رجوع" من نموذج الدخول يرجّع لخطوة اختيار الدور (الخطوة اللي قبلها
    // مباشرة الآن بعد إضافة صفحة التعريف — مو لصفحة التعريف الطويلة).
    setState({view:'roleChoice', error:'', success:''});
  } else if(action === 'back-to-landing-intro'){
    setState({view:'landing'});
  } else if(action === 'nav-role-choice'){
    setState({view:'roleChoice'});
  } else if(action === 'set-mode'){
    setState({mode: el.dataset.mode, error:'', success:''});
  } else if(action === 'install-app'){
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(() => {
        deferredInstallPrompt = null;
        const b = document.querySelector('.install-banner');
        if(b) b.remove();
      });
    }
  } else if(action === 'dismiss-install'){
    try{ localStorage.setItem('peerup-install-dismissed', 'true'); }catch(_e){ /* تجاهل */ }
    const b = document.querySelector('.install-banner');
    if(b) b.remove();
  } else if(action === 'noop'){
    /* امتصاص الضغطة داخل بطاقة المودال حتى لا تغلقه (مثل الضغط على العنوان) */
  } else if(action === 'open-avatar-picker'){
    setState({avatarModalOpen: true});
  } else if(action === 'close-avatar-picker'){
    setState({avatarModalOpen: false});
  } else if(action === 'pick-avatar'){
    handleSetAvatar({avatarId: el.dataset.id, avatarUrl: null});
  } else if(action === 'use-default-avatar'){
    handleSetAvatar({avatarId: null, avatarUrl: null});
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
  } else if(action === 'nav-teacher-comments'){
    openTeacherComments();
  } else if(action === 'delete-landing-comment'){
    handleDeleteLandingComment(el.dataset.id);
  } else if(action === 'nav-space-quiz-admin'){
    openSpaceQuizAdmin();
  } else if(action === 'delete-space-quiz-result'){
    handleDeleteSpaceQuizResult(el.dataset.id);
  } else if(action === 'reset-space-quiz-results'){
    handleResetSpaceQuizResults();
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
    if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoBlob = null; photoPreviewUrl = null;
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
  } else if(action === 'discard-photo'){
    discardPhoto();
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
  } else if(action === 'nav-about-story'){
    navigate('aboutStory');
  } else if(action === 'nav-space-journey'){
    openSpaceJourney();
  } else if(action === 'nav-space-quiz'){
    openSpaceQuiz();
  } else if(action === 'start-space-quiz'){
    handleStartSpaceQuiz();
  } else if(action === 'answer-space-comp-quiz'){
    handleAnswerSpaceCompQuiz(Number(el.dataset.i));
  } else if(action === 'nav-space-quiz-leaderboard'){
    openSpaceQuizLeaderboard();
  } else if(action === 'answer-space-quiz'){
    handleSpaceQuizAnswer(Number(el.dataset.i));
  } else if(action === 'space-next-station'){
    handleSpaceNextStation();
  } else if(action === 'space-next-fact'){
    handleSpaceNextFact();
  } else if(action === 'submit-space-fact'){
    handleSubmitSpaceFact();
  } else if(action === 'nav-students-list'){
    openStudentsList();
  } else if(action === 'view-student-profile'){
    openStudentProfile(el.dataset.uid);
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
  if(e.target.id === 'landingCommentForm'){
    e.preventDefault();
    handleSubmitLandingComment();
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

/* ---------- حالة الاتصال: شريط هادئ يظهر فقط لما ينقطع الإنترنت، حتى
   لا توهم الطالبة إن أي تغيير اتحفظ وهو فعليًا ما وصل لـFirebase. ---------- */
function updateOfflineBanner(){
  const existing = document.querySelector('.offline-banner');
  if(navigator.onLine){
    if(existing) existing.remove();
    return;
  }
  if(existing) return;
  const bar = document.createElement('div');
  bar.className = 'offline-banner';
  bar.textContent = 'لا يوجد اتصال بالإنترنت — أي تغيير الآن لن يُحفظ حتى يرجع الاتصال';
  document.querySelector('.shell').appendChild(bar);
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);

/* ---------- تثبيت PWA: تنبيه بسيط مرة وحدة، غير مزعج ---------- */
let deferredInstallPrompt = null;
function isStandaloneApp(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isIOSDevice(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function maybeShowInstallBanner(){
  if(isStandaloneApp()) return;
  if(document.querySelector('.install-banner')) return;
  let dismissed = false;
  try{ dismissed = localStorage.getItem('peerup-install-dismissed') === 'true'; }catch(_e){ /* تجاهل */ }
  if(dismissed) return;
  const canPrompt = !!deferredInstallPrompt;
  const iosManual = !canPrompt && isIOSDevice();
  if(!canPrompt && !iosManual) return;
  const bar = document.createElement('div');
  bar.className = 'install-banner';
  bar.innerHTML = iosManual
    ? '<span>ثبّتي PeerUp على جهازك لتجربة أسرع: اضغطي زر المشاركة بأسفل الشاشة ثم «إضافة إلى الشاشة الرئيسية»</span><button type="button" class="pill-btn" data-action="dismiss-install">حسنًا</button>'
    : '<span>ثبّتي PeerUp على جهازك لتجربة أسرع</span><button type="button" class="pill-btn" data-action="install-app">تثبيت</button><button type="button" class="pill-btn" data-action="dismiss-install">إغلاق</button>';
  document.querySelector('.shell').appendChild(bar);
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  maybeShowInstallBanner();
});
window.addEventListener('appinstalled', () => {
  const b = document.querySelector('.install-banner');
  if(b) b.remove();
  try{ localStorage.setItem('peerup-install-dismissed', 'true'); }catch(_e){ /* تجاهل */ }
});

render();
updateOfflineBanner();
setTimeout(maybeShowInstallBanner, 4000);
