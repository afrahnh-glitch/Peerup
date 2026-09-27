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

export async function createAnswer(db, {questionId, studentUid, studentName, text}){
  const docRef = await addDoc(collection(db, 'answers'), {
    questionId, studentUid, studentName, text,
    createdAt: serverTimestamp(), createdAtMs: Date.now(),
  });
  return docRef.id;
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
