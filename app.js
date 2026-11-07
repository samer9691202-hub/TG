/* ==========================================================================
   Vaulty 1.0.5 — app.js
   - تشفير الخزنة بالكامل: PBKDF2-SHA256 + AES-256-GCM (Web Crypto API)
   - كلمة المرور الرئيسية لا تُخزَّن إطلاقاً؛ صحتها تُتحقق بفك التشفير
   - لا توجد أي اتصالات شبكية؛ كل شيء يعمل محلياً
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- الثوابت ---------- */
  const VAULT_KEY = 'vaulty_vault_v2';      // الخزنة المشفّرة
  const LEGACY_KEY = 'vaulty_items_v1';     // بيانات النسخة القديمة (نص صريح) — تُرحَّل ثم تُحذف
  const PBKDF2_ITERATIONS = 250000;
  const MIN_MASTER_LENGTH = 4;
  const MIN_RECOVERY_LENGTH = 8;
  const AUTO_LOCK_MS = 5 * 60 * 1000;       // قفل تلقائي بعد 5 دقائق خمول
  const REVEAL_MS = 15 * 1000;              // إخفاء كلمة المرور المعروضة تلقائياً
  const CATEGORIES = ['شخصي', 'عمل', 'تواصل اجتماعي', 'تسوق', 'مالي', 'أخرى'];
  const MASK = '••••••••••••';

  /* ---------- أدوات عامة ---------- */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const toB64 = buf => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  };
  const fromB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

  // معرّف فريد (لا يعتمد على crypto.randomUUID المتوفر في السياقات الآمنة فقط)
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

  /* ---------- الحالة ---------- */
  const state = {
    items: [],
    cryptoKey: null,
    recoveryKey: null,
    pendingRecovery: null,
    needsRecoveryRefresh: false,
    meta: null,            // { iter, salt }
    activeCat: 'الكل',
    locked: true,
    mode: 'unlock',        // 'unlock' | 'setup'
    busy: false,
    failedAttempts: 0,
    onConfirm: null,
    saveQueue: Promise.resolve(),
    idleTimer: null,
    revealTimers: new Map()
  };

  /* ---------- التخزين ---------- */
  function storageAvailable() {
    try {
      localStorage.setItem('__vaulty_test', '1');
      localStorage.removeItem('__vaulty_test');
      return true;
    } catch { return false; }
  }
  const cryptoAvailable = () => !!(window.crypto && crypto.subtle && crypto.getRandomValues);

  function readRecord() {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function validRecord(r) {
    return !!r && (r.v === 2 || r.v === 3) && typeof r.salt === 'string' && typeof r.iv === 'string' &&
      typeof r.data === 'string' && Number.isInteger(r.iter) && r.iter >= 10000 && r.iter <= 1000000 &&
      (r.v === 2 || (typeof r.recoverySalt === 'string' && typeof r.recoveryIv === 'string' && typeof r.recoveryData === 'string'));
  }

  function readLegacyItems() {
    try {
      const arr = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      return sanitizeItems(arr);
    } catch { return []; }
  }

  /* ---------- التشفير ---------- */
  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function persist() {
    const plain = enc.encode(JSON.stringify(state.items));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.cryptoKey, plain);
    const record = { v: 3, kdf: 'PBKDF2-SHA256', iter: state.meta.iter, salt: state.meta.salt, iv: toB64(iv), data: toB64(ct) };
    if (state.recoveryKey) {
      const recoveryIv = crypto.getRandomValues(new Uint8Array(12));
      const recoveryData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: recoveryIv }, state.recoveryKey, plain);
      Object.assign(record, { recoverySalt: state.meta.recoverySalt, recoveryIv: toB64(recoveryIv), recoveryData: toB64(recoveryData), recoveryCodeIssued: true, recoveryUserSet: true, recoveryStale: false });
      state.needsRecoveryRefresh = false;
    } else {
      // احتفظ بنسخة الاسترداد السابقة ولا تحذفها عند الحفظ بكلمة المرور الرئيسية فقط.
      // تُعلَّم النسخة بأنها قديمة، ويُنشأ رمز جديد بعد فتح الخزنة في المرة التالية.
      try {
        const previous = readRecord();
        if (previous && previous.recoverySalt && previous.recoveryIv && previous.recoveryData) {
          Object.assign(record, { recoverySalt: previous.recoverySalt, recoveryIv: previous.recoveryIv, recoveryData: previous.recoveryData, recoveryCodeIssued: !!previous.recoveryCodeIssued, recoveryUserSet: !!previous.recoveryUserSet, recoveryStale: true });
        }
      } catch {}
    }
    localStorage.setItem(VAULT_KEY, JSON.stringify(record));
  }

  // الحفظ يُنفَّذ بالتسلسل لمنع تداخل عمليات الكتابة
  function queueSave() {
    state.saveQueue = state.saveQueue.then(persist);
    return state.saveQueue.catch(() => { toast('تعذر حفظ البيانات — تحقق من مساحة التخزين'); state.saveQueue = Promise.resolve(); });
  }

  function sanitizeItems(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr
      .filter(x => x && typeof x === 'object' && typeof x.password === 'string')
      .map(x => {
        let id = typeof x.id === 'string' && /^[\w-]{1,64}$/.test(x.id) ? x.id : uid();
        if (seen.has(id)) id = uid();
        seen.add(id);
        return {
          id,
          name: String(x.name ?? '').slice(0, 60) || 'بدون اسم',
          category: CATEGORIES.includes(x.category) ? x.category : 'أخرى',
          website: String(x.website ?? '').slice(0, 200),
          username: String(x.username ?? '').slice(0, 120),
          password: x.password.slice(0, 256),
          notes: String(x.notes ?? '').slice(0, 300)
        };
      });
  }

  /* ---------- واجهة: تنبيه ونسخ ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // بديل للمتصفحات/السياقات التي تمنع Clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- قوة كلمة المرور (نفس المعيار الأصلي) ---------- */
  function strength(p) {
    let n = 0;
    if (p.length >= 12) n++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
    if (/\d/.test(p)) n++;
    if (/[^a-zA-Z0-9]/.test(p)) n++;
    return n;
  }

  function updateStrengthHint(value, target) {
    if (!target) return;
    // لا تعرض تحذير قوة كلمة المرور أثناء تسجيل الدخول؛ يظهر فقط عند إنشاء/تغيير كلمة المرور.
    if (target.id === 'setupPasswordStrength' && state.mode !== 'setup') {
      target.textContent = '';
      target.className = 'strength-hint';
      return;
    }
    if (!value) { target.textContent = ''; target.className = 'strength-hint'; return; }
    const score = strength(value);
    target.textContent = value.length < 8 || score <= 1
      ? 'تنبيه: كلمة المرور ضعيفة. يمكنك المتابعة، لكن يُنصح باستخدام 8 أحرف أو أكثر مع أرقام ورموز.'
      : score === 2 ? 'قوة كلمة المرور: متوسطة. يمكنك تقويتها بمزيد من التنوع والطول.'
      : 'قوة كلمة المرور: جيدة.';
    target.className = 'strength-hint ' + (value.length < 8 || score <= 1 ? 'weak' : score === 2 ? 'medium' : 'good');
  }

  /* ---------- مولّد كلمات المرور ---------- */
  const SETS = {
    lower: 'abcdefghijkmnopqrstuvwxyz',
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    digit: '23456789',
    symbol: '!@#$%&*+-_?'
  };

  // عدد عشوائي منتظم بدون انحياز (rejection sampling)
  function randInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % max;
  }

  function makePassword(len = 18) {
    const sets = Object.values(SETS);
    const all = sets.join('');
    const out = sets.map(s => s[randInt(s.length)]);          // حرف واحد على الأقل من كل نوع
    while (out.length < len) out.push(all[randInt(all.length)]);
    for (let i = out.length - 1; i > 0; i--) {                // خلط Fisher–Yates
      const j = randInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
  }

  function generate() {
    $('#generated').textContent = makePassword(+$('#lengthRange').value);
  }

  /* ---------- العرض ---------- */
  function clearRevealTimers() {
    state.revealTimers.forEach(t => clearTimeout(t));
    state.revealTimers.clear();
  }

  function render() {
    clearRevealTimers();
    const q = $('#searchInput').value.trim().toLowerCase();
    const items = state.items;
    const shown = items.filter(x =>
      (state.activeCat === 'الكل' || x.category === state.activeCat) &&
      [x.name, x.website, x.username, x.notes].join(' ').toLowerCase().includes(q)
    );

    $('#totalCount').innerHTML = items.length + ' <small>عنصر</small>';
    $('#strongCount').textContent = items.filter(x => strength(x.password) >= 3).length;
    $('#categoryCount').textContent = new Set(items.map(x => x.category)).size;

    $('#vaultGrid').innerHTML = shown.length ? shown.map(x => `<article class="item">
  <div class="item-top"><div class="site-icon">${esc((x.name || '?').trim().slice(0, 1).toUpperCase())}</div><div class="item-title"><strong>${esc(x.name)}</strong><span>${esc(x.website || 'بدون موقع')}</span></div><button type="button" class="more" aria-label="تعديل العنصر" title="تعديل" data-edit="${x.id}">···</button></div>
  <div class="item-meta"><span class="tag">${esc(x.category)}</span><span>${strength(x.password) >= 3 ? '● كلمة قوية' : '○ كلمة مرور'}</span></div>
  <div class="credential"><span class="masked" id="pw-${x.id}">${MASK}</span><div class="mini-actions">
    <button type="button" title="إظهار / إخفاء" aria-label="إظهار أو إخفاء كلمة المرور" data-reveal="${x.id}">◉</button>
    <button type="button" title="نسخ كلمة المرور" aria-label="نسخ كلمة المرور" data-copy="${x.id}">▢</button>
    ${x.username ? `<button type="button" title="نسخ اسم المستخدم" aria-label="نسخ اسم المستخدم" data-copyuser="${x.id}">@</button>` : ''}
    <button type="button" title="حذف العنصر" aria-label="حذف العنصر" data-delete="${x.id}">⌫</button>
  </div></div>
</article>`).join('') : `<div class="empty"><div class="empty-icon">◇</div><b>${items.length ? 'لا توجد نتائج مطابقة' : 'خزنتك تبدأ من هنا'}</b><span>${items.length ? 'جرّب كلمة بحث أو فئة مختلفة.' : 'أضف أول حساب واحفظ بياناته في مكان مرتب.'}</span>${!items.length ? '<br><button type="button" class="primary-btn" data-action="add">＋ إضافة أول عنصر</button>' : ''}</div>`;
  }

  /* ---------- النوافذ ---------- */
  const openOverlay = id => $('#' + id).classList.add('show');
  const closeOverlay = id => $('#' + id).classList.remove('show');
  const closeAllOverlays = () => $$('.overlay.show').forEach(o => o.classList.remove('show'));

  function setPasswordVisible(visible) {
    $('#password').type = visible ? 'text' : 'password';
  }

  function openForm(item) {
    $('#itemForm').reset();
    setPasswordVisible(false);
    $('#itemId').value = item?.id || '';
    $('#formTitle').textContent = item ? 'تعديل العنصر' : 'إضافة إلى الخزنة';
    if (item) {
      $('#name').value = item.name;
      $('#category').value = item.category;
      $('#website').value = item.website || '';
      $('#username').value = item.username || '';
      $('#password').value = item.password;
      $('#notes').value = item.notes || '';
    }
    openOverlay('itemOverlay');
    $('#name').focus();
  }

  function askConfirm({ title, text, label, danger = true, onConfirm }) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    const ok = $('#confirmOk');
    ok.textContent = label;
    ok.classList.toggle('btn-danger', danger);
    state.onConfirm = onConfirm;
    openOverlay('confirmOverlay');
  }

  /* ---------- عمليات العناصر ---------- */
  async function onItemSubmit(e) {
    e.preventDefault();
    const name = $('#name').value.trim();
    const password = $('#password').value;
    if (!name || !password) { toast('الاسم وكلمة المرور مطلوبان'); return; }
    const id = $('#itemId').value || uid();
    const obj = {
      id, name,
      category: $('#category').value,
      website: $('#website').value.trim(),
      username: $('#username').value.trim(),
      password,
      notes: $('#notes').value.trim()
    };
    const i = state.items.findIndex(x => x.id === id);
    if (i >= 0) state.items[i] = obj; else state.items.unshift(obj);
    render();
    closeOverlay('itemOverlay');
    $('#itemForm').reset();
    setPasswordVisible(false);
    await queueSave();
    toast('تم حفظ العنصر');
  }

  async function onGridClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action === 'add') { openForm(); return; }
    const d = b.dataset;
    const id = d.edit || d.reveal || d.copy || d.copyuser || d.delete;
    const x = state.items.find(z => z.id === id);
    if (!x) return;

    if (d.edit) openForm(x);

    if (d.reveal) {
      const el = $('#pw-' + id);
      const open = el.dataset.open === '1';
      clearTimeout(state.revealTimers.get(id));
      if (open) {
        el.textContent = MASK; el.dataset.open = '0';
      } else {
        el.textContent = x.password; el.dataset.open = '1';
        state.revealTimers.set(id, setTimeout(() => { el.textContent = MASK; el.dataset.open = '0'; }, REVEAL_MS));
      }
    }

    if (d.copy) toast(await copyText(x.password) ? 'تم نسخ كلمة المرور' : 'تعذر النسخ في هذا المتصفح');
    if (d.copyuser) toast(await copyText(x.username) ? 'تم نسخ اسم المستخدم' : 'تعذر النسخ في هذا المتصفح');

    if (d.delete) {
      askConfirm({
        title: 'حذف العنصر؟',
        text: 'سيتم حذف هذا العنصر من الخزنة. لا يمكن التراجع عن هذه الخطوة.',
        label: 'حذف نهائياً',
        onConfirm: async () => {
          state.items = state.items.filter(z => z.id !== id);
          render();
          await queueSave();
          toast('تم حذف العنصر');
        }
      });
    }
  }

  /* ---------- النسخ الاحتياطي ---------- */
  async function exportBackup() {
    await state.saveQueue.catch(() => {});
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) { toast('لا توجد بيانات للتصدير'); return; }
    const name = `vaulty-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([raw], { type: 'application/json' });
    // على الجوال / داخل التطبيقات: نافذة المشاركة إن كانت مدعومة
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Vaulty backup' });
        toast('تم تصدير نسخة مشفّرة');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // ألغى المستخدم المشاركة
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('تم تصدير نسخة مشفّرة');
  }

  async function onImportFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('الملف كبير جداً'); return; }
    let record;
    try {
      record = JSON.parse(await file.text());
    } catch { toast('الملف غير صالح'); return; }
    if (!validRecord(record)) { toast('هذا ليس ملف نسخة احتياطية صالحاً لـ Vaulty'); return; }
    askConfirm({
      title: 'استبدال الخزنة الحالية؟',
      text: 'سيتم استبدال جميع بيانات الخزنة الحالية بمحتوى النسخة الاحتياطية، وستحتاج إلى كلمة المرور الرئيسية الخاصة بتلك النسخة. صدّر نسخة من خزنتك الحالية أولاً إن كنت تريد الاحتفاظ بها.',
      label: 'استبدال',
      onConfirm: async () => {
        await state.saveQueue.catch(() => {});
        try {
          const clean = { ...record, v: record.v === 3 ? 3 : 2, kdf: 'PBKDF2-SHA256' };
          localStorage.setItem(VAULT_KEY, JSON.stringify(clean));
        } catch { toast('تعذر حفظ النسخة المستوردة'); return; }
        lockVault('تم استيراد النسخة. أدخل كلمة المرور الرئيسية الخاصة بها لفتحها.');
      }
    });
  }

  /* ---------- القفل وإنشاء الخزنة ---------- */
  function setLockError(msg) { $('#lockError').textContent = msg || ''; }

  function setBusy(b) {
    state.busy = b;
    $('#unlockBtn').disabled = b;
    $('#unlockBtn').textContent = b ? 'جارٍ المعالجة…' : (state.mode === 'setup' ? 'إنشاء الخزنة' : 'فتح الخزنة');
  }

  function refreshLockMode() {
    const hasVault = !!localStorage.getItem(VAULT_KEY);
    state.mode = hasVault ? 'unlock' : 'setup';
    // أظهر رابط استرداد الخزنة على شاشة القفل عند وجود خزنة محفوظة.
    // كان الزر مخفياً في HTML ولم تتم إزالة hidden عند وضع فتح الخزنة.
    $('#recoverVaultBtn').hidden = !hasVault;
    const legacyCount = hasVault ? 0 : readLegacyItems().length;
    $('#confirmPassword').hidden = hasVault;
    if (hasVault) { $('#setupPasswordStrength').textContent = ''; $('#setupPasswordStrength').className = 'strength-hint'; }
    $('#unlockPassword').autocomplete = hasVault ? 'current-password' : 'new-password';
    if (hasVault) {
      $('#lockTitle').textContent = 'خزنتك مقفلة';
      $('#lockText').innerHTML = 'أدخل كلمة المرور الرئيسية للمتابعة.<br>ستبقى بياناتك على هذا الجهاز.';
    } else {
      $('#lockTitle').textContent = 'إنشاء خزنتك';
      $('#lockText').innerHTML = 'اختر كلمة مرور رئيسية (4 أحرف على الأقل)، واكتب رمز الاسترداد بنفسك. ستُشفَّر به نسخة استرداد منفصلة من بياناتك.' +
        (legacyCount ? `<br>تم العثور على ${legacyCount} عنصر محفوظ سابقاً وسيتم تشفيرها ونقلها تلقائياً.` : '');
    }
    setBusy(false);
  }

  function showLockScreen() {
    $('#lockScreen').classList.add('show');
    $('#app').classList.add('is-locked');
    refreshLockMode();
    setTimeout(() => $('#unlockPassword').focus(), 0);
  }

  function lockVault(message) {
    state.locked = true;
    state.items = [];
    state.cryptoKey = null;
    state.recoveryKey = null;
    state.meta = null;
    state.onConfirm = null;
    clearTimeout(state.idleTimer);
    clearRevealTimers();
    closeAllOverlays();
    $('#itemForm').reset();
    setPasswordVisible(false);
    $('#itemId').value = '';
    $('#generated').textContent = '—';
    $('#searchInput').value = '';
    $('#vaultGrid').innerHTML = '';
    $('#unlockPassword').value = '';
    $('#confirmPassword').value = '';
    setLockError('');
    showLockScreen();
    if (message) setLockError(message);
  }

  function enterApp() {
    state.locked = false;
    state.failedAttempts = 0;
    $('#unlockPassword').value = '';
    $('#confirmPassword').value = '';
    setLockError('');
    $('#lockScreen').classList.remove('show');
    $('#app').classList.remove('is-locked');
    render();
    resetIdle();
  }

  async function createVault(password, recoveryCode) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    state.cryptoKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    state.meta = { iter: PBKDF2_ITERATIONS, salt: toB64(salt) };
    const recoverySalt = crypto.getRandomValues(new Uint8Array(16));
    state.recoveryKey = await deriveKey(normalizeRecoveryCode(recoveryCode), recoverySalt, 600000);
    state.meta.recoverySalt = toB64(recoverySalt);
    state.items = readLegacyItems();                 // ترحيل البيانات القديمة إن وُجدت
    await persist();
    localStorage.removeItem(LEGACY_KEY);
    return recoveryCode;             // حذف النسخة النصية بعد نجاح التشفير
  }

  async function openVault(password) {
    let rec;
    try { rec = readRecord(); } catch { rec = null; }
    if (!validRecord(rec)) throw new Error('corrupt');
    const key = await deriveKey(password, fromB64(rec.salt), rec.iter);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.data));
    } catch { throw new Error('wrong'); }
    state.items = sanitizeItems(JSON.parse(dec.decode(plain)));
    state.cryptoKey = key;
    state.meta = { iter: rec.iter, salt: rec.salt, recoverySalt: rec.recoverySalt || null };
    // كلمة المرور الرئيسية وحدها تفتح الخزنة. لا نطلب رمز الاسترداد عند كل دخول.
    // الإصدارات السابقة لم تسجل تأكيد عرض الرمز؛ لذلك نولّد رمزاً جديداً مرة واحدة
    // بعد أول فتح ناجح، ثم نحدّث نسخة الاسترداد عند الحاجة بعد تعديل البيانات.
    state.recoveryKey = null;
    state.needsRecoveryRefresh = !rec.recoveryUserSet || !rec.recoveryCodeIssued || !!rec.recoveryStale || !rec.recoveryData;
  }

  async function onLockSubmit(e) {
    e.preventDefault();
    if (state.busy) return;
    const pw = $('#unlockPassword').value;
    setLockError('');

    if (state.mode === 'setup') {
      const recoveryCode = $('#setupRecoveryCode').value;
      if (pw.length < MIN_MASTER_LENGTH) { setLockError(`كلمة المرور الرئيسية يجب ألا تقل عن ${MIN_MASTER_LENGTH} أحرف.`); return; }
      if (pw !== $('#confirmPassword').value) { setLockError('كلمتا المرور غير متطابقتين.'); return; }
      if (normalizeRecoveryCode(recoveryCode).length < MIN_RECOVERY_LENGTH) { setLockError(`رمز الاسترداد الذي تختاره يجب أن يكون ${MIN_RECOVERY_LENGTH} أحرف على الأقل.`); return; }
      if (recoveryCode !== $('#confirmSetupRecoveryCode').value) { setLockError('رمزا الاسترداد غير متطابقين.'); return; }
      setBusy(true);
      try {
        await createVault(pw, recoveryCode);
        enterApp();
        $('#setupRecoveryCode').value = '';
        $('#confirmSetupRecoveryCode').value = '';
        toast('تم إنشاء الخزنة وتشفيرها. احتفظ برمز الاسترداد الذي اخترته.');
      } catch {
        state.cryptoKey = null; state.items = [];
        setLockError('تعذر إنشاء الخزنة. تأكد من أن التخزين المحلي متاح في المتصفح.');
        setBusy(false);
      }
      return;
    }

    if (!pw) { setLockError('أدخل كلمة المرور الرئيسية.'); return; }
    setBusy(true);
    try {
      await openVault(pw);
      const needsRecoverySetup = state.needsRecoveryRefresh;
      enterApp();
      toast('تم فتح الخزنة');
      if (needsRecoverySetup) {
        openOverlay('recoverySettingsOverlay');
        $('#recoverySettingsHint').textContent = 'هذه الخزنة لا تملك رمز استرداد مؤكداً. أنشئ رمزاً من اختيارك الآن حتى تتمكن من استعادتها لاحقاً.';
      }
    } catch (err) {
      state.failedAttempts++;
      await sleep(Math.min(state.failedAttempts * 400, 4000));   // إبطاء المحاولات المتكررة
      setLockError(err.message === 'corrupt'
        ? 'بيانات الخزنة تالفة. استورد نسخة احتياطية إن توفرت.'
        : err.message === 'recovery-required' ? 'رمز الاسترداد مطلوب للمتابعة بأمان.'
        : err.message === 'recovery-invalid' ? 'رمز الاسترداد غير صحيح.'
        : 'كلمة المرور الرئيسية غير صحيحة.');
      $('#unlockPassword').select();
      setBusy(false);
    }
  }

  function showRecoveryCode(code) {
    const box = $('#recoveryCodeBox');
    box.textContent = code;
    openOverlay('recoveryCodeOverlay');
  }

  function normalizeRecoveryCode(code) { return String(code || '').normalize('NFC').trim(); }

  async function enableRecovery(code) {
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length < MIN_RECOVERY_LENGTH) throw new Error('recovery-short');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nextKey = await deriveKey(normalized, salt, 600000);
    const oldKey = state.recoveryKey;
    const oldMeta = { ...state.meta };
    state.recoveryKey = nextKey;
    state.meta.recoverySalt = toB64(salt);
    try {
      await state.saveQueue.catch(() => {});
      await persist();
      state.saveQueue = Promise.resolve();
      state.needsRecoveryRefresh = false;
    } catch (err) {
      state.recoveryKey = oldKey;
      state.meta = oldMeta;
      throw err;
    }
  }

  async function saveRecoverySettings(e) {
    if (e) e.preventDefault();
    const code = $('#newRecoveryCode').value;
    const confirm = $('#confirmNewRecoveryCode').value;
    const error = $('#recoverySettingsError');
    error.textContent = '';
    if (normalizeRecoveryCode(code).length < MIN_RECOVERY_LENGTH) {
      error.textContent = `رمز الاسترداد يجب أن يحتوي على ${MIN_RECOVERY_LENGTH} أحرف على الأقل.`; return;
    }
    if (code !== confirm) { error.textContent = 'رمزا الاسترداد غير متطابقين.'; return; }
    const btn = $('#saveRecoveryCodeBtn');
    btn.disabled = true; btn.textContent = 'جارٍ حفظ الرمز…';
    try {
      await enableRecovery(code);
      $('#recoverySettingsForm').reset();
      closeOverlay('recoverySettingsOverlay');
      toast('تم حفظ رمز الاسترداد الجديد. الرمز السابق لم يعد صالحاً.');
    } catch {
      error.textContent = 'تعذر حفظ رمز الاسترداد. لم يتم تأكيد أي تغيير.';
    } finally { btn.disabled = false; btn.textContent = 'حفظ رمز الاسترداد'; }
  }

  async function changeMasterPassword(e) {
    e.preventDefault();
    const current = $('#currentMasterPassword').value;
    const next = $('#newMasterPassword').value;
    const confirm = $('#confirmNewMasterPassword').value;
    const error = $('#passwordChangeError');
    error.textContent = '';
    if (next.length < MIN_MASTER_LENGTH) { error.textContent = `كلمة المرور الجديدة يجب ألا تقل عن ${MIN_MASTER_LENGTH} أحرف.`; return; }
    if (next !== confirm) { error.textContent = 'كلمتا المرور الجديدتان غير متطابقتين.'; return; }
    const button = $('#saveMasterPasswordBtn');
    button.disabled = true;
    button.textContent = 'جارٍ التحديث…';
    try {
      const rec = readRecord();
      const checkKey = await deriveKey(current, fromB64(state.meta.salt), state.meta.iter);
      // تحقق من كلمة المرور الحالية بفك تشفير السجل قبل تغيير أي شيء.
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, checkKey, fromB64(rec.data));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const nextKey = await deriveKey(next, salt, PBKDF2_ITERATIONS);
      const oldKey = state.cryptoKey;
      const oldMeta = { ...state.meta };
      state.cryptoKey = nextKey;
      state.meta.iter = PBKDF2_ITERATIONS;
      state.meta.salt = toB64(salt);
      // لا نعلن نجاح التغيير إلا بعد كتابة السجل المشفّر فعلياً.
      try {
        await state.saveQueue.catch(() => {});
        await persist();
        state.saveQueue = Promise.resolve();
      } catch (saveError) {
        state.cryptoKey = oldKey;
        state.meta = oldMeta;
        throw saveError;
      }
      $('#changeMasterForm').reset();
      closeOverlay('passwordSettingsOverlay');
      toast('تم تغيير كلمة المرور مع الحفاظ على بيانات الخزنة');
    } catch {
      error.textContent = 'كلمة المرور الحالية غير صحيحة، لم يتم إجراء أي تغيير.';
    } finally {
      button.disabled = false;
      button.textContent = 'حفظ كلمة المرور الجديدة';
    }
  }

  async function recoverVault() {
    const code = normalizeRecoveryCode($('#recoveryInput').value);
    if (code.length < MIN_RECOVERY_LENGTH) { setLockError(`أدخل رمز الاسترداد الذي اخترته (لا يقل عن ${MIN_RECOVERY_LENGTH} أحرف).`); return; }
    setBusy(true);
    try {
      const rec = readRecord();
      if (!validRecord(rec) || rec.v !== 3) throw new Error('bad');
      const key = await deriveKey(code, fromB64(rec.recoverySalt), 600000);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.recoveryIv) }, key, fromB64(rec.recoveryData));
      const recoveredItems = sanitizeItems(JSON.parse(dec.decode(plain)));
      state.pendingRecovery = { items: recoveredItems, key, record: rec };
      $('#recoveryPanel').hidden = true;
      $('#recoveryPasswordForm').reset();
      $('#recoveryPasswordError').textContent = '';
      $('#recoveryPasswordStrength').textContent = '';
      setBusy(false);
      openOverlay('recoveryPasswordOverlay');
      $('#recoveryNewPassword').focus();
    } catch {
      setLockError('رمز الاسترداد غير صحيح أو لا توجد نسخة استرداد صالحة.');
      setBusy(false);
    }
  }

  async function saveRecoveredPassword(e) {
    e.preventDefault();
    const password = $('#recoveryNewPassword').value;
    const confirmation = $('#recoveryConfirmPassword').value;
    const error = $('#recoveryPasswordError');
    error.textContent = '';
    if (password.length < MIN_MASTER_LENGTH) { error.textContent = `كلمة المرور يجب ألا تقل عن ${MIN_MASTER_LENGTH} أحرف.`; return; }
    if (password !== confirmation) { error.textContent = 'كلمتا المرور غير متطابقتين.'; return; }
    if (!state.pendingRecovery) { error.textContent = 'انتهت جلسة الاسترداد. أعد إدخال رمز الاسترداد.'; return; }
    const button = $('#saveRecoveredPasswordBtn');
    button.disabled = true;
    button.textContent = 'جارٍ حفظ كلمة المرور…';
    const previous = { items: state.items, cryptoKey: state.cryptoKey, recoveryKey: state.recoveryKey, meta: state.meta };
    try {
      const pending = state.pendingRecovery;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      state.items = pending.items;
      state.cryptoKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);
      state.meta = { iter: PBKDF2_ITERATIONS, salt: toB64(salt), recoverySalt: pending.record.recoverySalt };
      state.recoveryKey = pending.key;
      await persist();
      state.pendingRecovery = null;
      $('#recoveryInput').value = '';
      $('#recoveryPasswordForm').reset();
      closeOverlay('recoveryPasswordOverlay');
      enterApp();
      toast('تم استرداد الخزنة وتغيير كلمة المرور دون فقدان البيانات');
    } catch {
      state.items = previous.items;
      state.cryptoKey = previous.cryptoKey;
      state.recoveryKey = previous.recoveryKey;
      state.meta = previous.meta;
      error.textContent = 'تعذر حفظ كلمة المرور الجديدة. لم يتم اعتماد التغيير؛ حاول مرة أخرى.';
    } finally {
      button.disabled = false;
      button.textContent = 'حفظ كلمة المرور';
    }
  }

  /* ---------- القفل التلقائي ---------- */
  function resetIdle() {
    clearTimeout(state.idleTimer);
    if (state.locked) return;
    state.idleTimer = setTimeout(() => lockVault('تم قفل الخزنة تلقائياً بسبب عدم النشاط.'), AUTO_LOCK_MS);
  }

  /* ---------- ربط الأحداث ---------- */
  function bindEvents() {
    $('#addBtn').addEventListener('click', () => openForm());
    $('#makePassword').addEventListener('click', () => { $('#password').value = makePassword(); setPasswordVisible(true); });
    $('#togglePassword').addEventListener('click', () => setPasswordVisible($('#password').type === 'password'));
    $('#itemForm').addEventListener('submit', onItemSubmit);

    $('#vaultGrid').addEventListener('click', onGridClick);
    $('#vaultGrid').addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      const card = e.target.closest('.item');
      const editBtn = card && card.querySelector('[data-edit]');
      const x = editBtn && state.items.find(z => z.id === editBtn.dataset.edit);
      if (x) openForm(x);
    });

    $('#searchInput').addEventListener('input', render);
    $('#filters').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      state.activeCat = b.dataset.cat;
      $$('.filter').forEach(x => x.classList.toggle('active', x === b));
      render();
    });

    $$('[data-close]').forEach(b => b.addEventListener('click', () => closeOverlay(b.dataset.close)));
    $$('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); }));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = $$('.overlay.show');
      if (open.length) open[open.length - 1].classList.remove('show');
    });

    $('#generatorBtn').addEventListener('click', () => { openOverlay('generatorOverlay'); generate(); });
    $('#lengthRange').addEventListener('input', e => { $('#lengthValue').textContent = e.target.value; generate(); });
    $('#regenerate').addEventListener('click', generate);
    $('#copyGenerated').addEventListener('click', async () => {
      toast(await copyText($('#generated').textContent) ? 'تم نسخ كلمة المرور' : 'تعذر النسخ');
    });

    $('#confirmOk').addEventListener('click', () => {
      const fn = state.onConfirm;
      state.onConfirm = null;
      closeOverlay('confirmOverlay');
      if (fn) fn();
    });

    $('#lockBtn').addEventListener('click', () => lockVault());
    $('#lockForm').addEventListener('submit', onLockSubmit);
    $('#unlockPassword').addEventListener('input', () => {
      if (state.mode === 'setup') updateStrengthHint($('#unlockPassword').value, $('#setupPasswordStrength'));
      else { $('#setupPasswordStrength').textContent = ''; $('#setupPasswordStrength').className = 'strength-hint'; }
    });
    $('#newMasterPassword').addEventListener('input', () => updateStrengthHint($('#newMasterPassword').value, $('#changePasswordStrength')));
    $('#recoverVaultBtn').addEventListener('click', () => {
      const rec = readRecord();
      if (!rec || rec.v !== 3 || !rec.recoverySalt || !rec.recoveryIv || !rec.recoveryData) {
        setLockError('لا توجد نسخة استرداد صالحة لهذه الخزنة. افتحها بكلمة المرور ثم أنشئ رمز استرداد من الإعدادات.');
        return;
      }
      $('#recoveryPanel').hidden = false;
      $('#lockScreen').classList.add('recovery-mode');
      setLockError('');
      $('#recoveryInput').focus();
    });
    $('#cancelRecoveryBtn').addEventListener('click', () => { $('#recoveryPanel').hidden = true; $('#lockScreen').classList.remove('recovery-mode'); $('#recoveryInput').value = ''; setLockError(''); });
    $('#recoverSubmitBtn').addEventListener('click', recoverVault);
    $('#recoveryPasswordForm').addEventListener('submit', saveRecoveredPassword);
    $('#recoveryNewPassword').addEventListener('input', () => updateStrengthHint($('#recoveryNewPassword').value, $('#recoveryPasswordStrength')));
    $('#cancelRecoveryPassword').addEventListener('click', () => { state.pendingRecovery = null; $('#recoveryPasswordForm').reset(); closeOverlay('recoveryPasswordOverlay'); setLockError(''); $('#recoveryPanel').hidden = false; });
    $('#copyRecoveryCode').addEventListener('click', async () => toast(await copyText($('#recoveryCodeBox').textContent) ? 'تم نسخ رمز الاسترداد' : 'تعذر النسخ'));
    $('#closeRecoveryCode').addEventListener('click', () => closeOverlay('recoveryCodeOverlay'));

    $('#settingsBtn').addEventListener('click', () => openOverlay('settingsOverlay'));
    $('#changeMasterBtn').addEventListener('click', () => {
      $('#changeMasterForm').reset();
      $('#passwordChangeError').textContent = '';
      closeOverlay('settingsOverlay');
      openOverlay('passwordSettingsOverlay');
      $('#currentMasterPassword').focus();
    });
    $('#changeMasterForm').addEventListener('submit', changeMasterPassword);
    $('#newRecoveryBtn').addEventListener('click', () => {
      $('#recoverySettingsForm').reset();
      $('#recoverySettingsError').textContent = '';
      $('#recoverySettingsHint').textContent = 'اختر رمزاً لا يقل عن 8 أحرف. تذكّر أن الرمز حساس لحالة الأحرف، ولا يمكن استعادته إذا نسيته.';
      closeOverlay('settingsOverlay');
      openOverlay('recoverySettingsOverlay');
      $('#newRecoveryCode').focus();
    });
    $('#recoverySettingsForm').addEventListener('submit', saveRecoverySettings);

    $('#exportBtn').addEventListener('click', exportBackup);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', onImportFile);

    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
      document.addEventListener(ev, resetIdle, { passive: true, capture: true }));

    // تعديل الخزنة من تبويب آخر: قفل هذا التبويب لتجنب الكتابة فوق البيانات
    window.addEventListener('storage', e => {
      if (e.key !== VAULT_KEY && e.key !== null) return;
      if (state.locked) refreshLockMode();
      else lockVault('تم تعديل الخزنة من نافذة أخرى. أعد إدخال كلمة المرور.');
    });
  }

  /* ---------- التشغيل ---------- */
  function init() {
    bindEvents();
    if (!cryptoAvailable()) {
      setLockError('المتصفح لا يدعم التشفير المطلوب. افتح Vaulty في متصفح حديث (عبر https أو من ملف محلي).');
      $('#unlockBtn').disabled = true;
      return;
    }
    if (!storageAvailable()) {
      setLockError('التخزين المحلي غير متاح (ربما بسبب التصفح الخاص أو إعدادات المتصفح)، لذا لا يمكن استخدام الخزنة.');
      $('#unlockBtn').disabled = true;
      return;
    }
    refreshLockMode();
    $('#unlockPassword').focus();
  }

  init();

  // تسجيل عامل الخدمة (يعمل على http/https فقط، ويُتجاهل عند الفتح كملف محلي)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
