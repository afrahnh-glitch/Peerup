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
