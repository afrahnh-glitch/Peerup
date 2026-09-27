import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
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
export async function createPost(db, {lessonId, subjectId, studentUid, studentName, type, title, content}){
  const docRef = await addDoc(collection(db, 'posts'), {
    lessonId, subjectId, studentUid, studentName, type, title, content,
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
export async function likePost(db, postId, uid){
  await setDoc(doc(db, 'interactions', `${postId}_${uid}`), {
    postId, studentUid: uid, createdAt: serverTimestamp(),
  });
}
export async function attachLikeInfo(db, posts, uid){
  return Promise.all(posts.map(async (p) => {
    const [likedByMe, likesCount] = await Promise.all([
      hasLiked(db, p.id, uid), getLikesCount(db, p.id),
    ]);
    return {...p, likedByMe, likesCount};
  }));
}

// نحسب PeerPoints مباشرة من البيانات الحقيقية بدل تخزينها كرقم قابل للتعديل:
// شرح معتمد = 10، إجابة = 5، كل "أفادني" استلمتها على شرح معتمد = 2.
export async function computeStudentPoints(db, uid){
  const [myPosts, myAnswers] = await Promise.all([
    fetchPostsByStudent(db, uid),
    fetchAnswersByStudent(db, uid),
  ]);
  const approvedPosts = myPosts.filter(p => p.status === 'approved');
  const likeCounts = await Promise.all(approvedPosts.map(p => getLikesCount(db, p.id)));
  const likesReceived = likeCounts.reduce((s, n) => s + n, 0);

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
    points: approvedPosts.length * 10 + myAnswers.length * 5 + likesReceived * 2,
    explanationsCount: approvedPosts.length,
    answersCount: myAnswers.length,
    likesReceived,
    helpedCount: helped.size,
  };
}

// لوحة المتصدرين: كل الطالبات مع نقاطهن، الأعلى أول. (تراكمية حاليًا،
// وليست بحساب أسبوعي منفصل — تبسيط مقصود بهذي المرحلة.)
export async function fetchLeaderboard(db, limitN){
  const q = query(collection(db, 'users'), where('role', '==', 'student'));
  const snap = await getDocs(q);
  const students = snap.docs.map(d => ({uid: d.id, displayName: d.data().displayName}));
  const withPoints = await Promise.all(students.map(async (s) => ({
    ...s, ...(await computeStudentPoints(db, s.uid)),
  })));
  return withPoints.sort((a, b) => b.points - a.points).slice(0, limitN || 5);
}
