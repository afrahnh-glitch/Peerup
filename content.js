import {
  collection, doc, getDocs, getDoc, setDoc, addDoc, query, orderBy
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

// تُستخدم مرة واحدة فقط من لوحة المعلمة لتهيئة مادة الفيزياء ودروسها التجريبية.
// آمنة للتكرار: تكتب فوق نفس المستندات بنفس القيم إن استُدعيت أكثر من مرة.
export async function seedInitialContent(db){
  const subjects = [
    {id: 'physics', name: 'الفيزياء', emoji: '🧲', order: 1},
  ];
  const lessons = [
    {id: 'balance',  subjectId: 'physics', title: 'الاتزان ومركز الكتلة', order: 1},
    {id: 'torque',   subjectId: 'physics', title: 'العزم',                 order: 2},
    {id: 'rotation', subjectId: 'physics', title: 'الحركة الدورانية',      order: 3},
    {id: 'energy',   subjectId: 'physics', title: 'حفظ الطاقة',            order: 4},
  ];
  for(const s of subjects){ await setDoc(doc(db, 'subjects', s.id), s); }
  for(const l of lessons){ await setDoc(doc(db, 'lessons', l.id), l); }
  return {subjects: subjects.length, lessons: lessons.length};
}
