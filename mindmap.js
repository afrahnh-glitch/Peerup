/* =====================================================================
   mindmap.js — محرر الخرائط الذهنية في PeerUp (بدون مكتبات خارجية)

   1) نموذج بيانات + تخطيط متوازن + تراجع/إعادة   (منطق صرف قابل للاختبار)
   2) معاينة SVG مصغّرة للعرض داخل بطاقات المشاركات
   3) MindMapEditor: محرر لمس/سحب بملء الشاشة (تكبير، تحريك، تحرير، حذف)

   شكل البيانات المخزّنة في Firestore (حقل mindMap داخل المشاركة):
   { v:1, nodes:[ {id, parentId, text, x, y, w, h}, ... ] }
   x,y = مركز العقدة بالنسبة لمركز الفكرة الرئيسية (0,0) — w,h = حجمها.
   ===================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';

export const MM_MAX_NODES = 40;      // سقف عدد العقد (يحمي حجم المستند)
export const MM_MAX_TEXT = 60;       // سقف طول نص العقدة
export const MM_ROOT_SIZE = 132;     // قطر "الكوكب" (العقدة الرئيسية)
const W1 = 150, W2 = 140;            // عرض بطاقة المستوى الأول / الأعمق
const GAP_X = 64, GAP_Y = 14;        // المسافة الأفقية بين المستويات / الرأسية بين الفروع
const MIN_K = 0.25, MAX_K = 2.5;
const COORD_LIMIT = 6000;

// لون لكل فرع رئيسي (بنفسجي، سماوي، نعناعي، خوخي) — نفس هوية PeerUp
export const MM_COLORS = [
  {c: '#7C5CFC', s: '#EFE8FF'},
  {c: '#65C7FF', s: '#E3F5FF'},
  {c: '#2FAF86', s: '#CFF7E7'},
  {c: '#E2924B', s: '#FFE9D2'},
];

/* ---------------------------------------------------------------- أدوات */
export function mmEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
}
function clean(t){ return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, MM_MAX_TEXT); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function widthFor(depth){ return depth === 0 ? MM_ROOT_SIZE : depth === 1 ? W1 : W2; }

// تقدير حجم البطاقة عند غياب القياس الحقيقي (اختبارات/عرض بلا DOM)
export function mmGuessSize(node, depth){
  if(depth === 0) return {w: MM_ROOT_SIZE, h: MM_ROOT_SIZE};
  const w = widthFor(depth);
  const perLine = Math.max(6, Math.floor((w - 26) / 7.2));
  const lines = Math.min(3, Math.max(1, Math.ceil(String(node.text || '').length / perLine)));
  return {w, h: 18 + lines * 19};
}

function depthMap(nodes){
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out = new Map();
  nodes.forEach(n => {
    let d = 0, cur = n, guard = 0;
    while(cur.parentId && guard++ < 100){ cur = byId.get(cur.parentId); d++; if(!cur) break; }
    out.set(n.id, d);
  });
  return out;
}

/* ------------------------------------------------------------- التخطيط
   تخطيط متوازن: الفكرة الرئيسية بالمنتصف، الفروع الرئيسية تتوزع يمينًا
   ويسارًا (الأول يمينًا احترامًا لاتجاه RTL) بحسب الارتفاع المتراكم،
   وكل فرع يأخذ "شريطًا" رأسيًا خاصًا به بحجم كل ذريته → لا تداخل.
   الإزاحات اليدوية (ox,oy) تُضاف فوق التخطيط وتورَّث للأبناء. */
export function mmLayout(doc, sizeOf){
  const nodes = doc.nodes;
  const root = nodes.find(n => !n.parentId);
  if(!root) return doc;
  const depth = depthMap(nodes);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const kids = new Map();
  nodes.forEach(n => { if(n.parentId){ if(!kids.has(n.parentId)) kids.set(n.parentId, []); kids.get(n.parentId).push(n); } });

  const size = new Map();
  nodes.forEach(n => {
    const d = depth.get(n.id);
    const s = d === 0 ? {w: MM_ROOT_SIZE, h: MM_ROOT_SIZE} : (sizeOf ? sizeOf(n, d) : mmGuessSize(n, d));
    size.set(n.id, {w: s.w || widthFor(d), h: s.h || 40});
  });

  const cache = new Map();
  const bandH = (n) => {
    if(cache.has(n.id)) return cache.get(n.id);
    const own = size.get(n.id).h;
    const ks = kids.get(n.id) || [];
    let v = own;
    if(ks.length){
      const tot = ks.reduce((a, k) => a + bandH(k), 0) + GAP_Y * (ks.length - 1);
      v = Math.max(own, tot);
    }
    cache.set(n.id, v);
    return v;
  };

  const pos = new Map();
  pos.set(root.id, {x: 0, y: 0});
  const place = (n, dir, edgeX, cy) => {
    const w = size.get(n.id).w;
    const cx = edgeX + dir * (GAP_X + w / 2);
    pos.set(n.id, {x: cx, y: cy});
    const ks = kids.get(n.id) || [];
    if(!ks.length) return;
    const tot = ks.reduce((a, k) => a + bandH(k), 0) + GAP_Y * (ks.length - 1);
    let y = cy - tot / 2;
    ks.forEach(k => { const H = bandH(k); place(k, dir, cx + dir * w / 2, y + H / 2); y += H + GAP_Y; });
  };

  const top = kids.get(root.id) || [];
  const right = [], left = [];
  let hR = 0, hL = 0;
  top.forEach(b => {
    const H = bandH(b);
    if(hR <= hL){ right.push(b); hR += H + GAP_Y; } else { left.push(b); hL += H + GAP_Y; }
  });
  const placeSide = (list, dir) => {
    if(!list.length) return;
    const tot = list.reduce((a, b) => a + bandH(b), 0) + GAP_Y * (list.length - 1);
    let y = -tot / 2;
    list.forEach(b => { const H = bandH(b); place(b, dir, dir * MM_ROOT_SIZE / 2, y + H / 2); y += H + GAP_Y; });
  };
  placeSide(right, 1);
  placeSide(left, -1);

  nodes.forEach(n => {
    let ox = 0, oy = 0, cur = n, guard = 0;
    while(cur && cur.parentId && guard++ < 100){ ox += cur.ox || 0; oy += cur.oy || 0; cur = byId.get(cur.parentId); }
    const p = pos.get(n.id) || {x: 0, y: 0};
    const s = size.get(n.id);
    n.x = p.x + ox; n.y = p.y + oy; n.w = s.w; n.h = s.h;
  });
  return doc;
}

/* -------------------------------------------------------------- النموذج */
export class MindMapModel {
  constructor(doc, opts = {}){
    this.doc = doc ? JSON.parse(JSON.stringify(doc)) : {
      v: 1, seq: 1, rootAuto: true,
      nodes: [{id: 'n1', parentId: null, text: clean(opts.defaultTitle) || 'الفكرة الرئيسية', ox: 0, oy: 0}],
    };
    this.fixed = !!opts.fixed;       // عرض فقط: الإحداثيات جاهزة ولا يُعاد التخطيط
    this.undoStack = [];
    this.redoStack = [];
  }
  static fromSerialized(data){
    const nodes = data.nodes.map(n => ({id: n.id, parentId: n.parentId || null, text: n.text, x: n.x, y: n.y, w: n.w, h: n.h, ox: 0, oy: 0}));
    return new MindMapModel({v: 1, seq: nodes.length, rootAuto: false, nodes}, {fixed: true});
  }
  get nodes(){ return this.doc.nodes; }
  rootId(){ return this.doc.nodes.find(n => !n.parentId).id; }
  byId(id){ return this.doc.nodes.find(n => n.id === id) || null; }
  children(id){ return this.doc.nodes.filter(n => n.parentId === id); }
  depth(id){ return depthMap(this.doc.nodes).get(id) || 0; }
  subtreeIds(id){
    const out = [id];
    for(let i = 0; i < out.length; i++) this.children(out[i]).forEach(k => out.push(k.id));
    return out;
  }
  // رقم الفرع الرئيسي الذي تنتمي له العقدة (لتحديد اللون)
  branchIndex(id){
    let n = this.byId(id), guard = 0;
    while(n && n.parentId && guard++ < 100){
      const p = this.byId(n.parentId);
      if(!p.parentId) return this.children(p.id).findIndex(k => k.id === n.id);
      n = p;
    }
    return 0;
  }

  /* التراجع/الإعادة: لقطة كاملة قبل كل تعديل */
  checkpoint(){
    this.undoStack.push(JSON.stringify(this.doc));
    if(this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  canUndo(){ return this.undoStack.length > 0; }
  canRedo(){ return this.redoStack.length > 0; }
  undo(){
    if(!this.undoStack.length) return false;
    this.redoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.undoStack.pop());
    return true;
  }
  redo(){
    if(!this.redoStack.length) return false;
    this.undoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.redoStack.pop());
    return true;
  }

  addChild(parentId, text){
    if(this.doc.nodes.length >= MM_MAX_NODES || !this.byId(parentId)) return null;
    this.checkpoint();
    const id = 'n' + (++this.doc.seq);
    const isTop = parentId === this.rootId();
    this.doc.nodes.push({id, parentId, text: clean(text) || (isTop ? 'فرع جديد' : 'فرع فرعي'), ox: 0, oy: 0});
    return id;
  }
  addSibling(id, text){
    const n = this.byId(id);
    if(!n || !n.parentId || this.doc.nodes.length >= MM_MAX_NODES) return null;
    this.checkpoint();
    const nid = 'n' + (++this.doc.seq);
    const isTop = n.parentId === this.rootId();
    const at = this.doc.nodes.findIndex(x => x.id === id);
    this.doc.nodes.splice(at + 1, 0, {id: nid, parentId: n.parentId, text: clean(text) || (isTop ? 'فرع جديد' : 'فرع فرعي'), ox: 0, oy: 0});
    return nid;
  }
  setText(id, text){
    const n = this.byId(id), t = clean(text);
    if(!n || !t || t === n.text) return false;
    this.checkpoint();
    n.text = t;
    if(!n.parentId) this.doc.rootAuto = false;   // الطالبة عدّلت العنوان بنفسها
    return true;
  }
  deleteNode(id){
    const n = this.byId(id);
    if(!n || !n.parentId) return 0;
    const ids = new Set(this.subtreeIds(id));
    this.checkpoint();
    this.doc.nodes = this.doc.nodes.filter(x => !ids.has(x.id));
    return ids.size;
  }
  moveBy(id, dx, dy){ const n = this.byId(id); if(n){ n.ox = (n.ox || 0) + dx; n.oy = (n.oy || 0) + dy; } }
  hasOffsets(){ return this.doc.nodes.some(n => Math.abs(n.ox || 0) > 0.5 || Math.abs(n.oy || 0) > 0.5); }
  resetOffsets(){
    if(!this.hasOffsets()) return false;
    this.checkpoint();
    this.doc.nodes.forEach(n => { n.ox = 0; n.oy = 0; });
    return true;
  }
  layoutAll(sizeOf){ if(!this.fixed) mmLayout(this.doc, sizeOf); }
  toJSON(){ return JSON.parse(JSON.stringify(this.doc)); }
  serialize(){ return mmSerialize(this.doc); }
}

export function mmNodeCount(doc){ return doc && doc.nodes ? doc.nodes.length : 0; }

export function mmSetDefaultTitle(doc, title){
  if(!doc || !doc.rootAuto) return false;
  const t = clean(title) || 'الفكرة الرئيسية';
  const root = doc.nodes.find(n => !n.parentId);
  if(!root || root.text === t) return false;
  root.text = t;
  return true;
}

// الشكل النهائي المخزَّن بـFirestore (أعداد صحيحة، بلا حقول داخلية)
export function mmSerialize(doc){
  const d = JSON.parse(JSON.stringify(doc));
  if(d.nodes.some(n => typeof n.x !== 'number')) mmLayout(d, null);
  return {
    v: 1,
    nodes: d.nodes.map(n => ({
      id: n.id, parentId: n.parentId || null, text: n.text,
      x: Math.round(n.x || 0), y: Math.round(n.y || 0), w: Math.round(n.w || 0), h: Math.round(n.h || 0),
    })),
  };
}

// تنظيف دفاعي لأي خريطة قادمة من Firestore قبل عرضها (لا نثق بالبيانات)
export function mmSanitize(data){
  if(!data || !Array.isArray(data.nodes)) return null;
  const num = v => (typeof v === 'number' && isFinite(v)) ? clamp(v, -COORD_LIMIT, COORD_LIMIT) : 0;
  const seen = new Set(), out = [];
  let rootFound = false;
  for(const n of data.nodes.slice(0, MM_MAX_NODES)){
    if(!n || typeof n.id !== 'string' || n.id.length > 24 || seen.has(n.id)) continue;
    const pid = (n.parentId == null) ? null : String(n.parentId);
    if(pid === null){ if(rootFound) continue; rootFound = true; }
    const isRoot = pid === null;
    out.push({
      id: n.id, parentId: pid, text: clean(n.text), x: num(n.x), y: num(n.y),
      w: isRoot ? MM_ROOT_SIZE : clamp(num(n.w) || W2, 40, 220),
      h: isRoot ? MM_ROOT_SIZE : clamp(num(n.h) || 40, 20, 220),
    });
    seen.add(n.id);
  }
  if(!rootFound) return null;
  const reach = new Set(out.filter(n => !n.parentId).map(n => n.id));
  let changed = true;
  while(changed){
    changed = false;
    out.forEach(n => { if(!reach.has(n.id) && n.parentId && reach.has(n.parentId)){ reach.add(n.id); changed = true; } });
  }
  return {v: 1, nodes: out.filter(n => reach.has(n.id))};
}


// «عقدة / عقدتان / 3 عقد / 11 عقدة» بصيغة عربية سليمة
export function mmNodesLabel(n){
  if(n === 1) return 'عقدة واحدة';
  if(n === 2) return 'عقدتان';
  return n + (n >= 3 && n <= 10 ? ' عقد' : ' عقدة');
}

// يلتف النص على أسطر بدون كسر كلمات؛ يعيد {lines, broke} (broke=اضطررنا لكسر كلمة طويلة)
function wrapText(text, maxChars, maxLines){
  const words = String(text).split(' ').filter(Boolean);
  let lines = [], cur = '', broke = false;
  words.forEach(w => {
    if(!cur) cur = w;
    else if((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  });
  if(cur) lines.push(cur);
  const out = [];
  lines.forEach(l => { while(l.length > maxChars){ out.push(l.slice(0, maxChars)); l = l.slice(maxChars); broke = true; } out.push(l); });
  if(out.length > maxLines){
    const kept = out.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…';
    return {lines: kept, broke};
  }
  return {lines: out, broke};
}
// أكبر خط يتّسع فيه النص كاملًا (بدون كسر كلمة) داخل مساحة w×h؛ وإلا أصغر خط مع اقتطاع
export function mmFitText(text, w, h, fs0, fsMin, maxLines){
  let fs = fs0, res;
  for(let i = 0; i < 40; i++){
    const maxChars = Math.max(3, Math.floor(w / (fs * 0.56)));
    res = wrapText(text, maxChars, maxLines);
    if(!res.broke && res.lines.length * fs * 1.22 <= h && !String(res.lines[res.lines.length - 1]).endsWith('…')) return {lines: res.lines, fs};
    if(fs <= fsMin) break;
    fs = Math.max(fsMin, fs * 0.92);
  }
  const maxChars = Math.max(3, Math.floor(w / (fs * 0.56)));
  return {lines: wrapText(text, maxChars, maxLines).lines, fs};
}

/* ------------------------------------------------- هندسة العرض والخطوط */
export function mmBounds(nodes){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const w = n.w || 0, h = n.h || 0;
    minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2);
    minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h / 2);
  });
  const r = nodes.find(n => !n.parentId);          // حلقة الكوكب حول العقدة الرئيسية
  if(r){ minX = Math.min(minX, r.x - MM_ROOT_SIZE * 0.8); maxX = Math.max(maxX, r.x + MM_ROOT_SIZE * 0.8); }
  if(!isFinite(minX)) return {minX: -100, minY: -100, maxX: 100, maxY: 100};
  return {minX, minY, maxX, maxY};
}
export function mmFitView(b, vw, vh, pad = 36){
  const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
  const k = clamp(Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh, 1), MIN_K, MAX_K);
  return {k, x: vw / 2 - ((b.minX + b.maxX) / 2) * k, y: vh / 2 - ((b.minY + b.maxY) / 2) * k};
}
export function mmZoomAt(view, factor, px, py){
  const k = clamp(view.k * factor, MIN_K, MAX_K);
  const r = k / view.k;
  return {k, x: px - (px - view.x) * r, y: py - (py - view.y) * r};
}
// منحنى ناعم (Bézier) من حافة العقدة الأم إلى حافة العقدة الابن
export function mmEdgePath(p, c){
  const dir = c.x >= p.x ? 1 : -1;
  const sx = p.x + dir * p.w / 2, sy = p.y;
  const ex = c.x - dir * c.w / 2, ey = c.y;
  const dx = Math.max(24, Math.abs(ex - sx)) * 0.5 * dir;
  const f = v => Math.round(v * 10) / 10;
  return `M${f(sx)} ${f(sy)} C${f(sx + dx)} ${f(sy)} ${f(ex - dx)} ${f(ey)} ${f(ex)} ${f(ey)}`;
}
function branchColor(byId, n){
  let cur = n, guard = 0;
  while(cur.parentId && byId.get(cur.parentId).parentId && guard++ < 100) cur = byId.get(cur.parentId);
  if(!cur.parentId) return MM_COLORS[0];
  const siblings = [...byId.values()].filter(x => x.parentId === cur.parentId);
  return MM_COLORS[Math.max(0, siblings.findIndex(x => x.id === cur.id)) % MM_COLORS.length];
}

/* ------------------------------------------------ معاينة SVG مصغّرة (نص)
   تُستخدم داخل بطاقات المشاركات وبطاقة المراجعة عند المعلمة. */
export function mmThumbSvg(data){
  const d = mmSanitize(data);
  if(!d || d.nodes.length < 2) return '';
  const byId = new Map(d.nodes.map(n => [n.id, n]));
  const depth = depthMap(d.nodes);
  const b = mmBounds(d.nodes), pad = 30;
  const vw = b.maxX - b.minX + pad * 2, vh = b.maxY - b.minY + pad * 2;
  const sc = Math.max(1, vw / 420);
  const fs = Math.round(13 * sc * 10) / 10;
  const f = v => Math.round(v * 10) / 10;
  const fsMin = 13 * Math.max(1, sc * 0.5);
  // نص متعدد الأسطر مركزيًا حول (cx,cy)
  const txt = (lines, cx, cy, size, weight, fill) => {
    const lh = size * 1.2, y0 = cy - (lines.length - 1) * lh / 2;
    return `<text text-anchor="middle" font-size="${f(size)}" font-weight="${weight}" fill="${fill}">` +
      lines.map((l, i) => `<tspan x="${f(cx)}" y="${f(y0 + i * lh)}" dy=".35em">${mmEsc(l)}</tspan>`).join('') + '</text>';
  };

  // خط موحّد = أصغر خط تحتاجه أي بطاقة لتظهر نصوصها كاملة (تناسق بصري)
  let fsCard = fs;
  d.nodes.filter(n => n.parentId).forEach(n => { fsCard = Math.min(fsCard, mmFitText(n.text, n.w - 14, n.h - 4, fs, fsMin, 2).fs); });

  let s = `<svg class="mm-thumb" viewBox="${f(b.minX - pad)} ${f(b.minY - pad)} ${f(vw)} ${f(vh)}" preserveAspectRatio="xMidYMid meet" xmlns="${SVGNS}" role="img" aria-label="خريطة ذهنية">`;
  d.nodes.filter(n => n.parentId).forEach(n => {
    const col = branchColor(byId, n);
    const sw = (depth.get(n.id) === 1 ? 3 : 2.2) * sc;
    s += `<path d="${mmEdgePath(byId.get(n.parentId), n)}" fill="none" stroke="${col.c}" stroke-width="${f(sw)}" stroke-linecap="round" opacity=".85"/>`;
  });
  d.nodes.forEach(n => {
    if(!n.parentId){
      const R = MM_ROOT_SIZE / 2;
      s += `<ellipse cx="${n.x}" cy="${n.y}" rx="${f(R * 1.56)}" ry="${f(R * 0.34)}" transform="rotate(-14 ${n.x} ${n.y})" fill="none" stroke="#65C7FF" stroke-width="${f(1.6 * sc)}" opacity=".55"/>`;
      s += `<circle cx="${n.x}" cy="${n.y}" r="${R}" fill="#7C5CFC"/>`;
      const fit = mmFitText(n.text, R * 1.56, R * 1.22, fs * 1.08, fsMin, 3);
      s += txt(fit.lines, n.x, n.y, fit.fs, 800, '#fff');
    } else {
      const col = branchColor(byId, n), top = depth.get(n.id) === 1;
      s += `<rect x="${f(n.x - n.w / 2)}" y="${f(n.y - n.h / 2)}" width="${n.w}" height="${n.h}" rx="${f(12 * sc)}" fill="${top ? col.s : '#fff'}" stroke="${col.c}" stroke-width="${f(1.6 * sc)}"/>`;
      const fit = mmFitText(n.text, n.w - 14, n.h - 4, fsCard, fsCard, 2);   // خط موحّد لكل البطاقات
      s += txt(fit.lines, n.x, n.y, fsCard, top ? 700 : 500, '#172033');
    }
  });
  return s + '</svg>';
}


/* ==================================================================
   تنسيق المحرر: يُحقَن من هذا الملف نفسه كي لا يعتمد على styles.css
   (تحديث/كاش ملف آخر كان يجعل المحرر يظهر خامًا أسفل الصفحة).
   ألوان PeerUp مكتوبة صراحة، و --shell-w يُؤخذ من التطبيق مع قيمة بديلة.
   ================================================================== */
const MM_CSS = `
body.mm-open{overflow:hidden;}

/* --- معاينة داخل النموذج وبطاقات المشاركات --- */
.mm-preview{display:flex; flex-direction:column; gap:10px;}
.mm-preview-card{
  background:radial-gradient(260px 160px at 80% 0%, rgba(101,199,255,.14), transparent 70%), #FAFAFC;
  border:1.5px solid #EAE7F7; border-radius:18px; padding:8px 8px 0; margin:10px 0 4px;
  overflow:hidden; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease;
}
.mm-preview .mm-preview-card{margin:0;}
.mm-preview-card:hover{transform:translateY(-1px); box-shadow:0 12px 26px -16px rgba(124,92,252,.4);}
.mm-thumb{display:block; width:100%; height:auto; max-height:230px;}
.mm-thumb text{font-family:'Tajawal',sans-serif; direction:rtl;}
.mm-preview-cap{margin:6px -8px 0; padding:9px 12px; text-align:center; font-size:12px; font-weight:700; color:#7C5CFC; background:#E9D5FF;}
.mm-preview-actions{display:flex; gap:8px; align-items:center;}
.mm-preview-actions .btn{flex:1;}
.mm-empty{
  display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center;
  padding:18px 14px; border:1.6px dashed #EAE7F7; border-radius:18px; color:#7B8190; font-size:12.8px; line-height:1.7;
  background:radial-gradient(200px 110px at 50% 0%, rgba(124,92,252,.07), transparent 70%);
}
.mm-empty-planet{font-size:30px; line-height:1;}

/* --- المحرر: طبقة فوق التطبيق، بعرض حاوية التطبيق (.shell) وليس النافذة كلها --- */
.mm-root{
  position:fixed; top:0; bottom:0; left:0; right:0; margin:0 auto;
  width:100%; max-width:var(--shell-w,440px); box-sizing:border-box; z-index:300;
  display:flex; flex-direction:column; overflow:hidden;
  background:radial-gradient(700px 420px at 85% -5%, rgba(101,199,255,.16), transparent 62%),
             radial-gradient(560px 360px at -8% 12%, rgba(233,213,255,.55), transparent 62%), #FAFAFC;
  color:#172033; font-family:'Tajawal',-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;
  padding-top:env(safe-area-inset-top);
}
@media(min-width:700px){
  /* يطابق إطار التطبيق على الآيباد/الكمبيوتر (هامش 24px + زوايا مدوّرة) */
  .mm-root{top:24px; bottom:24px; padding-top:0; border-radius:26px; border:1px solid #EAE7F7; box-shadow:0 24px 60px -24px rgba(23,37,84,.35);}
}
.mm-root *{box-sizing:border-box;}
.mm-root [hidden]{display:none !important;}
.mm-topbar{display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(255,255,255,.92); border-bottom:1px solid #EAE7F7;}
.mm-title{flex:1; min-width:0; font-family:'El Messiri','Tajawal',sans-serif; font-weight:700; font-size:16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.mm-tools{display:flex; flex-wrap:wrap; justify-content:center; gap:6px; padding:8px 10px; background:rgba(255,255,255,.72); border-bottom:1px solid #EAE7F7;}
.mm-btn{
  flex-shrink:0; min-width:42px; height:40px; padding:0 12px; border-radius:12px; font-family:inherit;
  border:1.5px solid #EAE7F7; background:#fff; color:#172033; font-weight:700; font-size:13px; white-space:nowrap;
  cursor:pointer; transition:transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.mm-btn:active{transform:scale(.97);}
.mm-btn:disabled{opacity:.38; pointer-events:none;}
.mm-btn.mm-primary{background:linear-gradient(120deg,#7C5CFC 0%,#8F72FD 100%); color:#fff; border-color:transparent; box-shadow:0 8px 18px -10px rgba(124,92,252,.6);}
.mm-btn.mm-back{width:40px; padding:0; font-size:18px;}
.mm-btn.mm-danger{color:#C6553D; border-color:#F1CFC7; background:#FBEAE4;}
.mm-btn.mm-danger-solid{background:#C6553D; color:#fff; border-color:transparent;}

/* مساحة الرسم: تملأ المتبقي من ارتفاع المحرر (لا أبعاد ثابتة) */
.mm-viewport{
  position:relative; flex:1 1 auto; min-height:0; width:100%; overflow:hidden; touch-action:none; cursor:grab;
  user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;
}
.mm-viewport:active{cursor:grabbing;}
.mm-world{position:absolute; left:0; top:0; width:0; height:0; transform-origin:0 0; direction:ltr; will-change:transform;}
.mm-edges{position:absolute; left:0; top:0; overflow:visible; pointer-events:none;}
.mm-edge{opacity:.9;}

.mm-node{
  position:absolute; transform:translate(-50%,-50%); box-sizing:border-box; display:flex;
  align-items:center; justify-content:center; text-align:center; direction:rtl;
  padding:8px 12px; font-size:13px; line-height:1.45; cursor:pointer; transition:box-shadow .15s ease;
}
.mm-text{pointer-events:none; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word;}
/* الفكرة الرئيسية: كوكب واضح بحلقة مدارية خلفه */
.mm-rootnode{width:132px; height:132px; border-radius:50%; padding:16px; isolation:isolate; font-weight:800; color:#fff; box-shadow:0 18px 38px -14px rgba(124,92,252,.65);}
.mm-rootnode .mm-text{-webkit-line-clamp:5;}
.mm-rootnode::after{content:""; position:absolute; top:0; right:0; bottom:0; left:0; border-radius:50%; z-index:-1; pointer-events:none; background:radial-gradient(circle at 32% 26%, #B9A2FF 0%, #7C5CFC 58%, #5B3FD8 100%);}
.mm-rootnode::before{content:""; position:absolute; left:50%; top:50%; width:156%; height:34%; z-index:-2; pointer-events:none; transform:translate(-50%,-50%) rotate(-14deg); border:2px solid rgba(101,199,255,.55); border-radius:50%;}
/* الفروع: بطاقات أنيقة بلون فرعها */
.mm-l1{width:150px; border-radius:16px; background:var(--s,#EFE8FF); border:1.6px solid var(--c,#7C5CFC); font-weight:700; box-shadow:0 8px 18px -12px rgba(23,37,84,.4);}
.mm-l2{width:140px; border-radius:14px; background:#fff; border:1.4px solid var(--c,#7C5CFC); font-weight:500; box-shadow:0 6px 14px -10px rgba(23,37,84,.3);}
.mm-node.selected{box-shadow:0 0 0 3px rgba(124,92,252,.38), 0 10px 22px -12px rgba(23,37,84,.45);}
.mm-rootnode.selected{box-shadow:0 0 0 4px rgba(124,92,252,.35), 0 18px 38px -14px rgba(124,92,252,.65);}

.mm-editbox{
  position:absolute; z-index:5; height:44px; padding:0 12px; text-align:center; direction:rtl;
  font-family:inherit; font-size:16px; font-weight:700; color:#172033;
  border:2px solid #7C5CFC; border-radius:14px; background:#fff; box-shadow:0 12px 28px -12px rgba(124,92,252,.55); outline:none;
}
.mm-hint{position:absolute; left:16px; right:16px; bottom:14px; text-align:center; font-size:12.5px; line-height:1.7; color:#7B8190; pointer-events:none;}

/* شريط أدوات التحرير داخل المحرر: 3 أزرار بالصف على الهاتف، وصف واحد على الشاشات الأوسع */
.mm-bottombar{
  display:flex; flex-wrap:wrap; gap:8px; padding:10px 12px calc(10px + env(safe-area-inset-bottom));
  background:rgba(255,255,255,.95); border-top:1px solid #EAE7F7; box-shadow:0 -10px 24px -18px rgba(23,37,84,.3);
}
.mm-bottombar .mm-btn{flex:1 1 calc(33.333% - 8px); height:auto; min-height:46px; padding:8px 6px; font-size:13.5px;}
@media(min-width:560px){ .mm-bottombar .mm-btn{flex:1 1 0;} }
.mm-confirm{position:absolute; top:0; right:0; bottom:0; left:0; z-index:10; display:flex; align-items:center; justify-content:center; padding:22px; background:rgba(23,32,51,.45);}
.mm-confirm-box{width:100%; max-width:340px; background:#fff; border-radius:22px; padding:20px 18px 16px; box-shadow:0 24px 50px -18px rgba(0,0,0,.45);}
.mm-confirm-msg{font-size:14px; font-weight:700; line-height:1.8; margin-bottom:16px; text-align:center;}
.mm-confirm-row{display:flex; gap:10px;}
.mm-confirm-row .mm-btn{flex:1;}
.mm-toast{position:absolute; left:50%; bottom:96px; transform:translateX(-50%); z-index:12; background:#172554; color:#fff; padding:10px 16px; border-radius:14px; font-size:12.5px; font-weight:600; max-width:88%; text-align:center; box-shadow:0 14px 28px -12px rgba(0,0,0,.5);}
@media(prefers-reduced-motion:reduce){.mm-btn,.mm-node,.mm-preview-card{transition:none;}}
`;

let mmStylesDone = false;
export function mmEnsureStyles(){
  if(mmStylesDone || typeof document === 'undefined' || !document.createElement) return;
  if(document.querySelector && document.querySelector('style#mm-styles')){ mmStylesDone = true; return; }
  const st = document.createElement('style');
  st.setAttribute('id', 'mm-styles');
  st.textContent = MM_CSS;
  (document.head || document.documentElement || document.body).appendChild(st);
  mmStylesDone = true;
}

/* ================================================================ المحرر */
function h(tag, props, kids){
  const e = document.createElement(tag);
  if(props){
    for(const k in props){
      const v = props[k];
      if(k === 'class') e.className = v;
      else if(k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
  }
  (kids || []).forEach(c => { if(c) e.appendChild(c); });
  return e;
}

export class MindMapEditor {
  /* opts: {doc?, data?, defaultTitle?, title?, readOnly?, onChange(doc), onClose(doc)} */
  constructor(opts){
    this.o = opts || {};
    this.readOnly = !!this.o.readOnly;
    if(this.readOnly){
      const d = mmSanitize(this.o.data) || {v: 1, nodes: [{id: 'n1', parentId: null, text: '', x: 0, y: 0, w: MM_ROOT_SIZE, h: MM_ROOT_SIZE}]};
      this.model = MindMapModel.fromSerialized(d);
    } else {
      this.model = new MindMapModel(this.o.doc || null, {defaultTitle: this.o.defaultTitle});
      if(this.o.defaultTitle) mmSetDefaultTitle(this.model.doc, this.o.defaultTitle);
    }
    this.view = {x: 0, y: 0, k: 1};
    this.autoFit = true;
    this.selectedId = this.model.rootId();
    this.editingId = null;
    this.pointers = new Map();
    this.gesture = null;
    this.tap = null;
    this.tapTimer = null;
    this.pendingDelete = null;
    this.nodeEls = new Map();
    this.edgeEls = new Map();
    this.destroyed = false;
    this._build();
    this._bind();
    this.render();
    this.fit();
    if(typeof document !== 'undefined' && document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => { if(!this.destroyed){ this.render(); if(this.autoFit) this.fit(); } }).catch(() => {});
    }
  }

  /* ------------------------------------------------------------- البناء */
  _mk(key, label, cls, aria){
    const b = h('button', {type: 'button', class: 'mm-btn' + (cls ? ' ' + cls : ''), text: label});
    if(aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => this._action(key));
    this.btns[key] = b;
    return b;
  }
  _build(){
    const ro = this.readOnly;
    this.btns = {};
    this.root = h('div', {class: 'mm-root', dir: 'rtl'});
    const top = h('div', {class: 'mm-topbar'}, [
      this._mk('back', '←', 'mm-back', 'رجوع'),
      h('div', {class: 'mm-title', text: this.o.title || 'الخريطة الذهنية'}),
      this._mk('close', ro ? 'إغلاق' : 'تم ✓', 'mm-primary'),
    ]);
    const tools = h('div', {class: 'mm-tools'}, [
      ro ? null : this._mk('undo', '↩️ تراجع'),
      ro ? null : this._mk('redo', '↪️ إعادة'),
      this._mk('zoomout', '−', '', 'تصغير'),
      this._mk('zoomin', '+', '', 'تكبير'),
      this._mk('fit', '🎯 إعادة تمركز'),
      ro ? null : this._mk('layout', '✨ تخطيط تلقائي'),
    ]);
    this.vp = h('div', {class: 'mm-viewport'});
    this.world = h('div', {class: 'mm-world'});
    this.edges = document.createElementNS(SVGNS, 'svg');
    this.edges.setAttribute('class', 'mm-edges');
    this.edges.setAttribute('width', '1');
    this.edges.setAttribute('height', '1');
    this.edges.appendChild(this._deco());
    this.world.appendChild(this.edges);
    this.vp.appendChild(this.world);
    this.editBox = h('input', {class: 'mm-editbox', type: 'text', maxlength: String(MM_MAX_TEXT), dir: 'rtl', 'aria-label': 'نص العقدة'});
    this.editBox.hidden = true;
    this.hint = h('div', {class: 'mm-hint', text: 'اضغطي «فرع رئيسي» لإضافة أول فرع، ثم اختاري أي عقدة واضغطي «فرع فرعي».'});
    this.hint.hidden = true;
    this.vp.appendChild(this.editBox);
    this.vp.appendChild(this.hint);

    const parts = [top, tools, this.vp];
    if(!ro){
      parts.push(h('div', {class: 'mm-bottombar'}, [
        this._mk('add-main', '➕ فرع رئيسي', 'mm-primary'),
        this._mk('add-child', '➕ فرع فرعي', 'mm-primary'),
        this._mk('add-sibling', '➕ فرع مجاور'),
        this._mk('edit', '✏️ تعديل النص'),
        this._mk('delete', '🗑️ حذف', 'mm-danger'),
      ]));
    }
    this.confirmMsg = h('div', {class: 'mm-confirm-msg'});
    const cancel = this._mk('cancel-delete', 'إلغاء');
    const ok = this._mk('confirm-delete', 'حذف', 'mm-danger-solid');
    this.confirmEl = h('div', {class: 'mm-confirm'}, [
      h('div', {class: 'mm-confirm-box'}, [this.confirmMsg, h('div', {class: 'mm-confirm-row'}, [cancel, ok])]),
    ]);
    this.confirmEl.hidden = true;
    this.toastEl = h('div', {class: 'mm-toast'});
    this.toastEl.hidden = true;
    parts.push(this.confirmEl, this.toastEl);
    parts.forEach(p => this.root.appendChild(p));
    mmEnsureStyles();
    // داخل حاوية التطبيق (.shell) لا على body، فيبقى ضمن حدود PeerUp
    const host = (document.querySelector && document.querySelector('.shell')) || document.body;
    host.appendChild(this.root);
    document.body.classList.add('mm-open');
  }
  _deco(){
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'mm-deco');
    [[150, '#CDBBFF', '.55'], [238, '#A9DCFA', '.45']].forEach(([r, c, o]) => {
      const ci = document.createElementNS(SVGNS, 'circle');
      ci.setAttribute('cx', '0'); ci.setAttribute('cy', '0'); ci.setAttribute('r', String(r));
      ci.setAttribute('fill', 'none'); ci.setAttribute('stroke', c); ci.setAttribute('stroke-width', '1.3');
      ci.setAttribute('stroke-dasharray', '3 7'); ci.setAttribute('opacity', o);
      g.appendChild(ci);
    });
    [[-340, -200, 7, '#65C7FF'], [310, -240, 5, '#B79BFF'], [-280, 230, 6, '#B79BFF'], [350, 190, 7, '#65C7FF'], [30, -310, 5, '#7DDBB8']]
      .forEach(([x, y, sz, c]) => {
        const p = document.createElementNS(SVGNS, 'path'), k = sz * 0.28;
        p.setAttribute('d', `M0 ${-sz} L${k} ${-k} L${sz} 0 L${k} ${k} L0 ${sz} L${-k} ${k} L${-sz} 0 L${-k} ${-k}Z`);
        p.setAttribute('transform', `translate(${x} ${y})`); p.setAttribute('fill', c); p.setAttribute('opacity', '.85');
        g.appendChild(p);
      });
    return g;
  }
  _bind(){
    const vp = this.vp;
    vp.addEventListener('pointerdown', e => this._down(e));
    vp.addEventListener('pointermove', e => this._move(e));
    vp.addEventListener('pointerup', e => this._up(e, false));
    vp.addEventListener('pointercancel', e => this._up(e, true));
    vp.addEventListener('click', () => this._click());
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.view = mmZoomAt(this.view, Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
      this.autoFit = false;
      this._applyView();
    }, {passive: false});
    this.editBox.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); this._commitEdit(); }
      else if(e.key === 'Escape'){ e.preventDefault(); this._cancelEdit(); }
    });
    this.editBox.addEventListener('blur', () => this._commitEdit());
    // يتابع حجم الحاوية (دوران الآيباد، تغيّر الشريط...) ويعيد التمركز تلقائيًا
    if(typeof ResizeObserver !== 'undefined'){
      this._ro = new ResizeObserver(() => {
        if(this.destroyed) return;
        if(this.autoFit) this.fit(); else this._applyView();
      });
      this._ro.observe(this.vp);
    }
    this._kd = e => this._onKey(e);
    this._rs = () => { if(this.autoFit && !this.destroyed) this.fit(); };
    document.addEventListener('keydown', this._kd);
    if(typeof window !== 'undefined') window.addEventListener('resize', this._rs);
  }

  /* ------------------------------------------------------------ الرسم */
  _relayout(measure){
    if(this.model.fixed) return;
    this.model.layoutAll((n, depth) => {
      if(measure){
        const el = this.nodeEls.get(n.id);
        if(el && el.offsetWidth) return {w: el.offsetWidth, h: el.offsetHeight};
      } else if(n.w && n.h){
        return {w: n.w, h: n.h};
      }
      return mmGuessSize(n, depth);
    });
  }
  render(){
    const nodes = this.model.nodes;
    this.nodeEls.forEach(el => el.remove());
    this.edgeEls.forEach(el => el.remove());
    this.nodeEls.clear();
    this.edgeEls.clear();
    nodes.forEach(n => {
      const d = this.model.depth(n.id);
      const span = h('span', {class: 'mm-text', text: n.text});
      const el = h('div', {class: 'mm-node ' + (d === 0 ? 'mm-rootnode' : d === 1 ? 'mm-l1' : 'mm-l2')}, [span]);
      el.dataset.id = n.id;
      if(d === 0){
        const len = n.text.length;
        span.style.fontSize = (len <= 14 ? 15 : len <= 30 ? 13 : 11.5) + 'px';
      } else {
        const col = MM_COLORS[this.model.branchIndex(n.id) % MM_COLORS.length];
        el.style.setProperty('--c', col.c);
        el.style.setProperty('--s', col.s);
      }
      this.world.appendChild(el);
      this.nodeEls.set(n.id, el);
      if(n.parentId){
        const col = MM_COLORS[this.model.branchIndex(n.id) % MM_COLORS.length];
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'mm-edge');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', col.c);
        path.setAttribute('stroke-width', d === 1 ? '3.4' : d === 2 ? '2.6' : '2');
        path.setAttribute('stroke-linecap', 'round');
        this.edges.appendChild(path);
        this.edgeEls.set(n.id, path);
      }
    });
    this._relayout(true);
    this._applyPositions();
    this._updateSelection();
    this._updateBar();
  }
  _applyPositions(){
    const byId = new Map(this.model.nodes.map(n => [n.id, n]));
    this.model.nodes.forEach(n => {
      const el = this.nodeEls.get(n.id);
      if(el){ el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      const p = this.edgeEls.get(n.id);
      if(p) p.setAttribute('d', mmEdgePath(byId.get(n.parentId), n));
    });
    this._positionEditBox();
  }
  _applyView(){
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.k})`;
    this._positionEditBox();
  }
  fit(){
    const r = this.vp.getBoundingClientRect();
    this.view = mmFitView(mmBounds(this.model.nodes), r.width, r.height);
    this.autoFit = true;
    this._applyView();
  }
  _zoom(f){
    const r = this.vp.getBoundingClientRect();
    this.view = mmZoomAt(this.view, f, r.width / 2, r.height / 2);
    this.autoFit = false;
    this._applyView();
  }
  _ensureVisible(id){
    const n = this.model.byId(id);
    if(!n) return;
    const r = this.vp.getBoundingClientRect(), k = this.view.k;
    const sx = n.x * k + this.view.x, sy = n.y * k + this.view.y;
    const mx = n.w * k / 2 + 16, my = n.h * k / 2 + 16;
    let dx = 0, dy = 0;
    if(sx - mx < 0) dx = -(sx - mx); else if(sx + mx > r.width) dx = r.width - (sx + mx);
    if(sy - my < 0) dy = -(sy - my); else if(sy + my > r.height) dy = r.height - (sy + my);
    if(dx || dy){ this.view = {k, x: this.view.x + dx, y: this.view.y + dy}; this._applyView(); }
  }
  _updateSelection(){
    this.nodeEls.forEach((el, id) => el.classList.toggle('selected', id === this.selectedId));
  }
  _updateBar(){
    if(this.readOnly) return;
    const isRoot = this.selectedId === this.model.rootId();
    const full = this.model.nodes.length >= MM_MAX_NODES;
    this.btns['add-main'].disabled = full;
    this.btns['add-child'].disabled = full;
    this.btns['add-sibling'].disabled = isRoot || full;
    this.btns['delete'].disabled = isRoot;
    this.btns.undo.disabled = !this.model.canUndo();
    this.btns.redo.disabled = !this.model.canRedo();
    this.hint.hidden = this.model.nodes.length > 1;
  }
  _toast(msg){
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, 2200);
  }
  _changed(){ if(this.o.onChange) this.o.onChange(this.model.toJSON()); }
  _sync(){
    this.render();
    if(this.autoFit) this.fit();
    this._changed();
  }

  /* --------------------------------------------------------- الإجراءات */
  _action(key){
    if(this.destroyed) return;
    switch(key){
      case 'back':
      case 'close': return this._close();
      case 'zoomin': return this._zoom(1.25);
      case 'zoomout': return this._zoom(0.8);
      case 'fit': return this.fit();
      case 'undo': return this._history(this.model.undo());
      case 'redo': return this._history(this.model.redo());
      case 'layout': return this._autoLayout();
      case 'add-main': return this._add('main');
      case 'add-child': return this._add('child');
      case 'add-sibling': return this._add('sibling');
      case 'edit': return this.startEdit(this.selectedId);
      case 'delete': return this._askDelete();
      case 'cancel-delete': this.confirmEl.hidden = true; this.pendingDelete = null; return;
      case 'confirm-delete': return this._confirmDelete();
    }
  }
  _close(){
    this.destroy();
    if(this.o.onClose) this.o.onClose(this.readOnly ? null : this.model.toJSON());
  }
  _history(ok){
    if(!ok) return;
    if(!this.model.byId(this.selectedId)) this.selectedId = this.model.rootId();
    this._sync();
  }
  _autoLayout(){
    if(this.model.resetOffsets()){ this._sync(); this._toast('تم ترتيب الخريطة تلقائيًا'); }
    else this._toast('الخريطة مرتبة بالفعل');
    this.fit();
  }
  // main: فرع رئيسي من الفكرة الرئيسية دائمًا | child: فرع من العقدة المحددة | sibling: بجوارها
  _add(mode){
    if(this.model.nodes.length >= MM_MAX_NODES){ this._toast(`وصلتِ للحد الأقصى (${MM_MAX_NODES} عقدة).`); return; }
    const id = mode === 'sibling' ? this.model.addSibling(this.selectedId)
             : this.model.addChild(mode === 'main' ? this.model.rootId() : this.selectedId);
    if(!id) return;
    this.selectedId = id;
    this._sync();
    if(!this.autoFit) this._ensureVisible(id);
    this.startEdit(id);
  }
  _askDelete(){
    const id = this.selectedId, n = this.model.byId(id);
    if(!n) return;
    if(!n.parentId){ this._toast('لا يمكن حذف الفكرة الرئيسية.'); return; }
    const cnt = this.model.subtreeIds(id).length - 1;
    this.pendingDelete = id;
    this.confirmMsg.textContent = cnt > 0
      ? `سيتم حذف «${n.text}» مع ${cnt} من الفروع التابعة لها. هل أنتِ متأكدة؟`
      : `سيتم حذف «${n.text}». هل أنتِ متأكدة؟`;
    this.confirmEl.hidden = false;
  }
  _confirmDelete(){
    const id = this.pendingDelete;
    this.confirmEl.hidden = true;
    this.pendingDelete = null;
    const n = id && this.model.byId(id);
    if(!n) return;
    const parent = n.parentId;
    if(this.model.deleteNode(id)){ this.selectedId = parent; this._sync(); }
  }

  /* ------------------------------------------------------ تحرير النص */
  startEdit(id){
    if(this.readOnly) return;
    const n = this.model.byId(id);
    if(!n) return;
    this.selectedId = id;
    this._updateSelection();
    this._updateBar();
    this._ensureVisible(id);
    // نرفع العقدة للثلث العلوي كي لا تختفي خلف لوحة المفاتيح
    const r = this.vp.getBoundingClientRect();
    const sy = n.y * this.view.k + this.view.y, target = r.height * 0.3;
    if(sy > target){ this.view = {k: this.view.k, x: this.view.x, y: this.view.y - (sy - target)}; this.autoFit = false; this._applyView(); }
    this.editingId = id;
    this.editBox.value = n.text;
    this.editBox.hidden = false;
    this._positionEditBox();
    this.editBox.focus();
    if(this.editBox.select) this.editBox.select();
  }
  _positionEditBox(){
    if(!this.editingId) return;
    const n = this.model.byId(this.editingId);
    if(!n) return;
    const k = this.view.k, w = Math.max(160, n.w * k);
    this.editBox.style.width = w + 'px';
    this.editBox.style.left = (n.x * k + this.view.x - w / 2) + 'px';
    this.editBox.style.top = (n.y * k + this.view.y - 22) + 'px';
  }
  _commitEdit(){
    if(!this.editingId) return;
    const id = this.editingId;
    this.editingId = null;
    const val = this.editBox.value;
    this.editBox.hidden = true;
    if(this.model.setText(id, val)) this._sync();
  }
  _cancelEdit(){
    this.editingId = null;
    this.editBox.hidden = true;
  }

  /* ------------------------------------------- اللمس / السحب / القرص */
  _down(e){
    if(e.target === this.editBox) return;
    if(this.editingId) this._commitEdit();
    try{ this.vp.setPointerCapture(e.pointerId); }catch(_){ /* غير مدعوم */ }
    this.pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    this.tap = null;
    if(this.pointers.size === 2){ this._startPinch(); return; }
    if(this.pointers.size > 2) return;
    const nodeEl = e.target && e.target.closest ? e.target.closest('.mm-node') : null;
    const id = nodeEl ? nodeEl.dataset.id : null;
    const draggable = id && !this.readOnly && id !== this.model.rootId();
    this.gesture = draggable
      ? {type: 'drag', id, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, ck: false}
      : {type: 'pan', id, sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false};
  }
  _move(e){
    const p = this.pointers.get(e.pointerId);
    if(!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const g = this.gesture;
    if(!g) return;
    if(g.type === 'pinch'){ this._pinchMove(); return; }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if(!g.moved){ if(Math.hypot(dx, dy) < 7) return; g.moved = true; }
    if(g.type === 'pan'){
      this.view = {k: this.view.k, x: g.vx + dx, y: g.vy + dy};
      this.autoFit = false;
      this._applyView();
    } else {
      if(!g.ck){
        this.model.checkpoint();
        g.ck = true;
        this.selectedId = g.id;
        this._updateSelection();
        this._updateBar();
      }
      this.model.moveBy(g.id, (e.clientX - g.lx) / this.view.k, (e.clientY - g.ly) / this.view.k);
      g.lx = e.clientX; g.ly = e.clientY;
      this._relayout(false);
      this._applyPositions();
    }
  }
  _up(e, cancelled){
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if(this.pointers.size === 0){
      if(g && g.type !== 'pinch' && !g.moved && !cancelled){
        this.tap = {id: g.id || null};
        // احتياط: لو لم يصل حدث click خلال لحظات نعالج النقرة بأي حال
        clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => this._click(), 350);
      }
      if(g && g.type === 'drag' && g.moved){ this._updateBar(); this._changed(); }
      this.gesture = null;
    } else if(g && g.type === 'pinch'){
      this.gesture = null;
    }
  }
  _click(){
    clearTimeout(this.tapTimer);
    const t = this.tap;
    this.tap = null;
    if(!t || this.destroyed) return;
    this._onTap(t.id);
  }
  // النقرة الأولى تحدد العقدة، والنقرة على العقدة المحددة تفتح تحرير نصها
  _onTap(id){
    if(!id || this.readOnly) return;
    if(this.selectedId === id) this.startEdit(id);
    else { this.selectedId = id; this._updateSelection(); this._updateBar(); }
  }
  _startPinch(){
    const [a, b] = [...this.pointers.values()];
    const r = this.vp.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    this.gesture = {
      type: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), k0: this.view.k,
      wx: (mx - this.view.x) / this.view.k, wy: (my - this.view.y) / this.view.k,
    };
    this.autoFit = false;
  }
  _pinchMove(){
    const g = this.gesture, pts = [...this.pointers.values()];
    if(pts.length < 2) return;
    const [a, b] = pts, r = this.vp.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const k = clamp(g.k0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, MIN_K, MAX_K);
    this.view = {k, x: mx - g.wx * k, y: my - g.wy * k};
    this._applyView();
  }
  _onKey(e){
    if(this.editingId || !this.confirmEl.hidden) return;
    const mod = e.ctrlKey || e.metaKey, key = (e.key || '').toLowerCase();
    if(mod && key === 'z'){ e.preventDefault(); if(!this.readOnly) this._history(e.shiftKey ? this.model.redo() : this.model.undo()); }
    else if(mod && key === 'y'){ e.preventDefault(); if(!this.readOnly) this._history(this.model.redo()); }
    else if(!this.readOnly && (e.key === 'Delete' || e.key === 'Backspace')){ e.preventDefault(); this._askDelete(); }
    else if(!this.readOnly && e.key === 'Enter'){ e.preventDefault(); this.startEdit(this.selectedId); }
  }

  destroy(){
    if(this.destroyed) return;
    if(this.editingId) this._commitEdit();
    this.destroyed = true;
    clearTimeout(this.tapTimer);
    clearTimeout(this.toastTimer);
    if(this._ro) this._ro.disconnect();
    document.removeEventListener('keydown', this._kd);
    if(typeof window !== 'undefined') window.removeEventListener('resize', this._rs);
    this.root.remove();
    document.body.classList.remove('mm-open');
  }
}

mmEnsureStyles();
