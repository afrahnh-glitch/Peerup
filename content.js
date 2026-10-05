import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, documentId
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function fetchSubjects(db){
  const snap = await getDocs(query(collection(db, 'subjects'), orderBy('order')));
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

export async function fetchLessons(db, subjectId){
  const snap = await getDocs(query(collection(db, 'lessons'), orderBy('order')));
  return snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .filter(l => l.subjectId === subjectId);
}

export async function fetchLesson(db, lessonId){
  const snap = await getDoc(doc(db, 'lessons', lessonId));
  return snap.exists() ? {id: snap.id, ...snap.data()} : null;
}

export async function addLesson(db, subjectId, title, existingLessons){
  const nextOrder = existingLessons.length
    ? Math.max(...existingLessons.map(l => l.order || 0)) + 1
    : 1;
  const docRef = await addDoc(collection(db, 'lessons'), {
    subjectId, title, order: nextOrder,
  });
  return {id: docRef.id, subjectId, title, order: nextOrder};
}

// تُستخدم من لوحة المعلمة لتهيئة مادة الفيزياء ودروسها.
// آمنة للتكرار: تكتب فوق نفس المستندات بنفس القيم إن استُدعيت أكثر من مرة.
export async function seedInitialContent(db){
  const subjects = [
    {id: 'physics', name: 'الفيزياء', emoji: '🧲', order: 1},
  ];
  const lessons = [
    {id: 'planetary-motion',        subjectId: 'physics', title: 'حركة الكواكب والجاذبية',                         order: 1},
    {id: 'gravitation-law',         subjectId: 'physics', title: 'قانون الجذب الكوني',                              order: 2},
    {id: 'rotational-motion-desc',  subjectId: 'physics', title: 'وصف الحركة الدورانية',                           order: 3},
    {id: 'rotational-dynamics',     subjectId: 'physics', title: 'ديناميكا الحركة الدورانية',                      order: 4},
    {id: 'equilibrium',             subjectId: 'physics', title: 'الاتزان',                                        order: 5},
    {id: 'impulse-momentum',        subjectId: 'physics', title: 'الدفع والزخم',                                   order: 6},
    {id: 'momentum-conservation',   subjectId: 'physics', title: 'حفظ الزخم',                                      order: 7},
    {id: 'energy-work',             subjectId: 'physics', title: 'الطاقة والشغل',                                  order: 8},
    {id: 'machines',                subjectId: 'physics', title: 'الآلات',                                         order: 9},
    {id: 'energy-forms',            subjectId: 'physics', title: 'الأشكال المتعددة للطاقة',                        order: 10},
    {id: 'energy-conservation',     subjectId: 'physics', title: 'حفظ الطاقة',                                     order: 11},
    {id: 'temperature-heat',        subjectId: 'physics', title: 'درجة الحرارة والطاقة الحرارية',                  order: 12},
    {id: 'thermodynamics-laws',     subjectId: 'physics', title: 'تغيرات حالة المادة وقوانين الديناميكا الحرارية', order: 13},
  ];
  for(const s of subjects){ await setDoc(doc(db, 'subjects', s.id), s); }
  for(const l of lessons){ await setDoc(doc(db, 'lessons', l.id), l); }
  return {subjects: subjects.length, lessons: lessons.length};
}

/* ================= المرحلة 3: الشروحات (posts) ================= */

// تنشئ مشاركة بحالة "قيد المراجعة" دايمًا — ما تظهر لبقية الطالبات
// إلا بعد اعتماد المعلمة (يُبنى بالمرحلة 4).
// mindMap: خريطة ذهنية اختيارية بشكل منظّم {v, nodes:[{id,parentId,text,x,y,w,h}]}
// voiceNote: تسجيل صوتي قصير اختياري {dataUrl, duration}
// كلاهما يُخزَّن داخل نفس المستند (بدون Storage)، وهما بديلان لبعض —
// مشاركة واحدة تحمل أحدهما أو ولا شي، مو الاثنين معًا.
export async function createPost(db, {lessonId, subjectId, studentUid, studentName, type, title, content, mindMap, voiceNote, imageUrl}){
  const docRef = await addDoc(collection(db, 'posts'), {
    lessonId, subjectId, studentUid, studentName, type: type || null, title, content,
    mindMap: (mindMap && mindMap.nodes && mindMap.nodes.length > 1) ? mindMap : null,
    voiceNote: (voiceNote && voiceNote.dataUrl) ? voiceNote : null,
    imageUrl: imageUrl || null,
    status: 'pending', likes: 0,
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
  return docRef.id;
}

// تُرجع فقط المشاركات المسموح للطالبة الحالية تشوفها: المعتمدة للجميع،
// ومشاركاتها الشخصية ولو لسه قيد المراجعة. مقسّمة لطلبين منفصلين متوافقين
// مع قواعد Firestore (طلب واحد فيه فلترين يفشل إذا وجدت مشاركات "قيد
// المراجعة" لطالبات أخريات بنفس الدرس).
export async function fetchPostsForLesson(db, lessonId, uid){
  const approvedQ = query(collection(db, 'posts'),
    where('lessonId', '==', lessonId), where('status', '==', 'approved'));
  const mineQ = query(collection(db, 'posts'),
    where('lessonId', '==', lessonId), where('studentUid', '==', uid));
  const [approvedSnap, mineSnap] = await Promise.all([getDocs(approvedQ), getDocs(mineQ)]);
  const map = new Map();
  approvedSnap.docs.forEach(d => map.set(d.id, {id: d.id, ...d.data()}));
  mineSnap.docs.forEach(d => map.set(d.id, {id: d.id, ...d.data()}));
  return [...map.values()].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

/* ================= المرحلة 3: الأسئلة والإجابات ================= */

export async function createQuestion(db, {lessonId, subjectId, studentUid, studentName, text}){
  const docRef = await addDoc(collection(db, 'questions'), {
    lessonId, subjectId, studentUid, studentName, text,
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
  return docRef.id;
}

export async function createAnswer(db, {questionId, studentUid, studentName, text}){
  const docRef = await addDoc(collection(db, 'answers'), {
    questionId, studentUid, studentName, text,
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
  return docRef.id;
}

export async function fetchAnswersForQuestion(db, questionId){
  const q = query(collection(db, 'answers'), where('questionId', '==', questionId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

// تُرجع الأسئلة (لدرس معيّن أو كل الدروس) مع إجاباتها مجمّعة مسبقًا.
export async function fetchQuestionsWithAnswers(db, lessonId){
  const base = collection(db, 'questions');
  const q = lessonId ? query(base, where('lessonId', '==', lessonId)) : query(base);
  const snap = await getDocs(q);
  const questions = snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  await Promise.all(questions.map(async (question) => {
    question.answers = await fetchAnswersForQuestion(db, question.id);
  }));
  return questions;
}

export async function fetchPostsByStudent(db, uid){
  const q = query(collection(db, 'posts'), where('studentUid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

export async function fetchAnswersByStudent(db, uid){
  const q = query(collection(db, 'answers'), where('studentUid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

/* ================= المرحلة 4: مراجعة المعلمة ================= */

// آمن للمعلمة: قاعدة الأمان تسمح لها بأي استعلام بفضل شرط isTeacher()
// المستقل عن بيانات المستند نفسه.
export async function fetchPendingPosts(db){
  const q = query(collection(db, 'posts'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)); // الأقدم أول (عدالة بالترتيب)
}

export async function approvePost(db, postId){
  await updateDoc(doc(db, 'posts', postId), {status: 'approved'});
}
export async function rejectPost(db, postId){
  await updateDoc(doc(db, 'posts', postId), {status: 'rejected'});
}
export async function deletePost(db, postId){
  await deleteDoc(doc(db, 'posts', postId));
}

/* ================= المرحلة 5: أفادني + PeerPoints ================= */

// نعتمد على مستند تفاعل ثابت المعرّف (postId_uid) بدل عدّاد قابل للتعديل،
// عشان تستحيل الطالبة تضغط "أفادني" أكثر من مرة على نفس المشاركة —
// حتى لو حاولت تتلاعب بالطلب مباشرة، قواعد Firestore ترفض إنشاء نفس المعرّف مرتين.
export async function hasLiked(db, postId, uid){
  const snap = await getDoc(doc(db, 'interactions', `${postId}_${uid}`));
  return snap.exists();
}
export async function getLikesCount(db, postId){
  const q = query(collection(db, 'interactions'), where('postId', '==', postId));
  const snap = await getDocs(q);
  return snap.size;
}
// بدل قراءة "أفادني" لكل مشاركة لحالها (كانت تعني N طلب شبكة لكل درس فيه
// N شرح، وهذا سبب بطء حقيقي لاحظته المعلمة) — نجيب كل تفاعلات مجموعة
// مشاركات معيّنة بطلب واحد فقط عبر عامل "in" (حده الأقصى 30 قيمة، يكفي
// بسهولة لدرس أو لشروحات طالبة وحدة)، ونحسب العدّاد والإعجاب الشخصي محليًا.
async function fetchLikeCountsAndMine(db, postIds, uid){
  if(!postIds.length) return {counts: {}, mine: new Set()};
  const ids = postIds.slice(0, 30);
  let docs = [];
  try{
    const snap = await getDocs(query(collection(db, 'interactions'), where('postId', 'in', ids)));
    docs = snap.docs;
  }catch(err){ /* تراجع آمن: تظهر المشاركات بدون عدّاد بدل ما تنكسر الصفحة */ }
  const counts = {}; const mine = new Set();
  docs.forEach(d => {
    const data = d.data();
    counts[data.postId] = (counts[data.postId] || 0) + 1;
    if(uid && data.studentUid === uid) mine.add(data.postId);
  });
  return {counts, mine};
}
export async function likePost(db, postId, uid){
  await setDoc(doc(db, 'interactions', `${postId}_${uid}`), {
    postId, studentUid: uid, createdAt: serverTimestamp(),
  });
}
export async function attachLikeInfo(db, posts, uid){
  if(!posts.length) return posts;
  const {counts, mine} = await fetchLikeCountsAndMine(db, posts.map(p => p.id), uid);
  return posts.map(p => ({...p, likedByMe: mine.has(p.id), likesCount: counts[p.id] || 0}));
}

// نحسب PeerPoints مباشرة من البيانات الحقيقية بدل تخزينها كرقم قابل للتعديل:
// شرح معتمد = 10، إجابة = 5، كل "أفادني" استلمتها على شرح معتمد = 2.
export async function computeStudentPoints(db, uid){
  const [myPosts, myAnswers, userSnap] = await Promise.all([
    fetchPostsByStudent(db, uid),
    fetchAnswersByStudent(db, uid),
    getDoc(doc(db, 'users', uid)).catch(() => null),
  ]);
  const spaceBonus = (userSnap && userSnap.exists() && userSnap.data().spaceWeekQuizCorrect) ? 5 : 0;
  const approvedPosts = myPosts.filter(p => p.status === 'approved');
  const {counts: likeCountsByPost} = await fetchLikeCountsAndMine(db, approvedPosts.map(p => p.id), null);
  const likesReceived = approvedPosts.reduce((s, p) => s + (likeCountsByPost[p.id] || 0), 0);

  const questionIds = [...new Set(myAnswers.map(a => a.questionId))];
  const questionSnaps = await Promise.all(questionIds.map(qid => getDoc(doc(db, 'questions', qid))));
  const helped = new Set();
  questionSnaps.forEach(snap => {
    if(snap.exists()){
      const q = snap.data();
      if(q.studentUid !== uid) helped.add(q.studentUid);
    }
  });

  return {
    points: approvedPosts.length * 10 + myAnswers.length * 5 + likesReceived * 2 + spaceBonus,
    explanationsCount: approvedPosts.length,
    answersCount: myAnswers.length,
    likesReceived,
    helpedCount: helped.size,
  };
}

// لوحة المتصدرين: كل الطالبات مع نقاطهن، الأعلى أول. (تراكمية حاليًا،
// وليست بحساب أسبوعي منفصل — تبسيط مقصود بهذي المرحلة.)
// لكل الشروحات المعتمدة (عبر كل الدروس) — تُستخدم للبحث بالعنوان/النص.
// فلتر مساواة واحد (status=='approved')، آمن لأي طالبة تطابق أول شرط بالقاعدة.
export async function fetchAllApprovedPosts(db){
  const q = query(collection(db, 'posts'), where('status', '==', 'approved'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

/* ================= تعليقات صفحة البداية (بدون تسجيل دخول) =================
   القاعدة بالأمن تتحقق من الشكل (طول الاسم/النص وحقول محدّدة بالضبط)،
   هنا نضيف تحديدًا مطابقًا من طرف العميل + تعقيم أساسي قبل الإرسال
   أصلًا (التعقيم عند العرض يصير بـauth.js عبر mmEsc الموجودة). ================= */
export async function submitLandingComment(db, {name, text}){
  await addDoc(collection(db, 'landingComments'), {
    name: String(name).trim().slice(0, 40),
    text: String(text).trim().slice(0, 300),
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
}
export async function fetchLandingComments(db, limitN = 12){
  const snap = await getDocs(collection(db, 'landingComments'));
  return snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, limitN);
}
export async function deleteLandingComment(db, id){
  await deleteDoc(doc(db, 'landingComments', id));
}

/* ================= أسبوع الفضاء: رحلة الاستكشاف (ميزة موسمية) =================
   أبسط تخزين ممكن: Boolean واحد لكل علامة على ملف الطالبة نفسه، بدل
   بناء نظام شارات/إنجازات جديد كامل. ================= */

// يُستدعى مرة لما تجاوب صح بالمحطة الأولى، ومرة ثانية لما تكمل الرحلة كاملة
export async function setSpaceProgress(db, uid, patch){
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function shareSpaceFact(db, {uid, studentName, text}){
  await addDoc(collection(db, 'spaceFacts'), {
    studentUid: uid, studentName, text: String(text).trim().slice(0, 300),
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
}
export async function fetchRecentSpaceFacts(db, limitN = 6){
  const snap = await getDocs(collection(db, 'spaceFacts'));
  return snap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, limitN);
}

/* ================= صورة الملف الشخصي (Avatar) ================= */

// avatarId: اختيار جاهز من المجموعة المدمجة بالمشروع (أو null لإلغائه).
// avatarUrl: رابط صورة مرفوعة من الجهاز (أو null). الاثنان متعارضان —
// تحديد أحدهما يمسح الآخر تلقائيًا.
export async function setAvatar(db, uid, {avatarId, avatarUrl}){
  await updateDoc(doc(db, 'users', uid), {
    avatarId: avatarId || null,
    avatarUrl: avatarUrl || null,
  });
}

// يجيب avatarId/avatarUrl لمجموعة طالبات دفعة وحدة (حد أقصى 30، يكفي
// بسهولة لقائمة شروحات أو أسئلة بصفحة واحدة) — نفس أسلوب الدُفعات
// المستخدم للإعجابات والمحفوظات، لضمان صورة محدّثة دائمًا بدل نسخة قديمة.
export async function fetchAvatarsFor(db, uids){
  const unique = [...new Set(uids)].filter(Boolean).slice(0, 30);
  if(!unique.length) return {};
  let docs = [];
  try{
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', unique)));
    docs = snap.docs;
  }catch(err){ /* تراجع آمن: تظهر الحروف الافتراضية بدل ما تنكسر الصفحة */ }
  const map = {};
  docs.forEach(d => { const v = d.data(); map[d.id] = {avatarId: v.avatarId || null, avatarUrl: v.avatarUrl || null}; });
  return map;
}
// يُطبِّق الخريطة فوق أي قائمة عناصر فيها studentUid (مشاركات/أسئلة)
export async function attachAvatarInfo(db, items, uidField = 'studentUid'){
  if(!items.length) return items;
  const map = await fetchAvatarsFor(db, items.map(i => i[uidField]));
  return items.map(i => ({...i, authorAvatarId: (map[i[uidField]]||{}).avatarId || null, authorAvatarUrl: (map[i[uidField]]||{}).avatarUrl || null}));
}

/* ================= المحفوظات: حفظ شروحات للرجوع لها لاحقًا ================= */

export async function hasBookmarked(db, postId, uid){
  const snap = await getDoc(doc(db, 'bookmarks', `${postId}_${uid}`));
  return snap.exists();
}
export async function addBookmark(db, postId, uid){
  await setDoc(doc(db, 'bookmarks', `${postId}_${uid}`), {
    postId, studentUid: uid, createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
}
export async function removeBookmark(db, postId, uid){
  await deleteDoc(doc(db, 'bookmarks', `${postId}_${uid}`));
}
// نفس فكرة fetchLikeCountsAndMine: طلب واحد يجيب كل مشاركات الطالبة
// المحفوظة (محصور بـstudentUid فقط، بدون فهرس مركّب)، بدل قراءة منفصلة
// لكل مشاركة على حدة.
export async function attachBookmarkInfo(db, posts, uid){
  if(!posts.length) return posts;
  let docs = [];
  try{
    const snap = await getDocs(query(collection(db, 'bookmarks'), where('studentUid', '==', uid)));
    docs = snap.docs;
  }catch(err){ /* تراجع آمن */ }
  const mine = new Set(docs.map(d => d.data().postId));
  return posts.map(p => ({...p, bookmarked: mine.has(p.id)}));
}
// تُرجع الشروحات المحفوظة الحقيقية مرتّبة بالأحدث حفظًا أولًا، وتتجاهل
// بصمت أي بوكمارك يشير لمشاركة اتحذفت لاحقًا.
export async function fetchBookmarkedPosts(db, uid){
  const q = query(collection(db, 'bookmarks'), where('studentUid', '==', uid));
  const snap = await getDocs(q);
  const marks = snap.docs
    .map(d => d.data())
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const posts = await Promise.all(marks.map(m => getDoc(doc(db, 'posts', m.postId))));
  return posts.filter(s => s.exists()).map(s => ({id: s.id, ...s.data(), bookmarked: true}));
}

/* ================= المرحلة 6: تحدي اليوم + إحصائيات المعلمة ================= */

// مستند واحد بمعرّف ثابت (current) — أي طالبة تقرأه، المعلمة فقط تكتبه.
export async function fetchChallenge(db){
  const snap = await getDoc(doc(db, 'challenge', 'current'));
  return snap.exists() ? snap.data() : null;
}
export async function setChallenge(db, text){
  await setDoc(doc(db, 'challenge', 'current'), {
    text: String(text).trim().slice(0, 200), updatedAt: serverTimestamp(),
  });
}

// آمن للمعلمة فقط: قاعدة الأمان تسمح لها بقراءة كل المشاركات بفضل
// isTeacher()، وهو شرط مستقل عن بيانات المستند فيصح مع أي استعلام.
export async function fetchAllPosts(db){
  const snap = await getDocs(collection(db, 'posts'));
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}
export async function fetchInteractionsCount(db){
  const snap = await getDocs(collection(db, 'interactions'));
  return snap.size;
}

export async function computeTeacherStats(db){
  const [allPosts, allQuestions, interactionsCount] = await Promise.all([
    fetchAllPosts(db),
    fetchQuestionsWithAnswers(db),
    fetchInteractionsCount(db).catch(() => 0),
  ]);
  const approvedPosts = allPosts.filter(p => p.status === 'approved');
  const studentsCount = new Set(allPosts.map(p => p.studentUid)).size;
  const answersCount = allQuestions.reduce((s, q) => s + (q.answers ? q.answers.length : 0), 0);

  // أكثر درس تفاعلًا = مجموع شروحاته المعتمدة + أسئلته
  const engagement = {};
  approvedPosts.forEach(p => { engagement[p.lessonId] = (engagement[p.lessonId] || 0) + 1; });
  allQuestions.forEach(q => { engagement[q.lessonId] = (engagement[q.lessonId] || 0) + 1; });
  let topLessonId = null, topLessonScore = 0;
  Object.entries(engagement).forEach(([lid, v]) => { if(v > topLessonScore){ topLessonScore = v; topLessonId = lid; } });

  // المفاهيم التي تحتاج دعمًا = الدروس اللي عليها أكثر أسئلة من الطالبات
  const byQuestions = {};
  allQuestions.forEach(q => { byQuestions[q.lessonId] = (byQuestions[q.lessonId] || 0) + 1; });
  const needsSupport = Object.entries(byQuestions)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([lessonId, count]) => ({lessonId, count}));

  return {
    studentsCount,
    explanationsCount: approvedPosts.length,
    questionsCount: allQuestions.length,
    answersCount,
    interactionsCount,
    topLessonId, topLessonScore,
    needsSupport,
  };
}

export async function fetchLeaderboard(db, limitN){
  const q = query(collection(db, 'users'), where('role', '==', 'student'));
  const snap = await getDocs(q);
  const students = snap.docs.map(d => ({uid: d.id, displayName: d.data().displayName, avatarId: d.data().avatarId || null, avatarUrl: d.data().avatarUrl || null}));
  const withPoints = await Promise.all(students.map(async (s) => ({
    ...s, ...(await computeStudentPoints(db, s.uid)),
  })));
  return withPoints.sort((a, b) => b.points - a.points).slice(0, limitN || 5);
}
