/* Vaulty – UI. Builds the DOM with createElement/textContent only (no innerHTML),
 * so stored data can never be interpreted as markup. */
(function () {
  'use strict';

  const VC = window.VaultyCrypto, VG = window.VaultyGen, VS = window.VaultyStorage, I = window.VaultyI18n;
  const { Vault, BUILTIN } = window.VaultyVault;
  const t = (k, v) => I.t(k, v);

  const VERSION = '1.0.0';
  const PREF_KEY = 'vaulty.prefs';
  const FAIL_KEY = 'vaulty.fails';
  const LOCK_OPTIONS = [1, 2, 5, 10, 15, 30, 60];
  const CLIP_OPTIONS = [10, 20, 30, 60];
  const REVEAL_MS = 30000;
  const MIN_MASTER = 10;

  // ------------------------------------------------------------------ prefs
  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { p = {}; }
    const o = Object.assign({
      lang: (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en',
      theme: 'auto', autoLockMin: 5, clipboardSec: 20, lastBackup: null
    }, p);
    if (o.lang !== 'ar' && o.lang !== 'en') o.lang = 'en';
    if (!['auto', 'light', 'dark'].includes(o.theme)) o.theme = 'auto';
    if (!LOCK_OPTIONS.includes(o.autoLockMin)) o.autoLockMin = 5;
    if (!CLIP_OPTIONS.includes(o.clipboardSec)) o.clipboardSec = 20;
    return o;
  }
  let prefs = loadPrefs();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  function applyPrefs() {
    I.setLang(prefs.lang);
    const de = document.documentElement;
    de.lang = prefs.lang;
    de.dir = prefs.lang === 'ar' ? 'rtl' : 'ltr';
    de.dataset.theme = prefs.theme;
    document.title = prefs.lang === 'ar' ? 'Vaulty – خزنتي' : 'Vaulty';
  }

  // ------------------------------------------------------------------ DOM helpers
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'line', 'rect']);

  function h(tag, attrs) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    let value;
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'value') value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    if (value !== undefined) el.value = value;
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach((k) => append(el, k));
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }

  const ICONS = {
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', ['circle', { cx: 12, cy: 12, r: 3 }]],
    eyeOff: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', ['circle', { cx: 12, cy: 12, r: 3 }], 'M3 3l18 18'],
    copy: [['rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }], 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    link: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
    edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13 7l4 4'],
    trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    star: ['M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z'],
    plus: ['M12 5v14', 'M5 12h14'],
    search: [['circle', { cx: 11, cy: 11, r: 7 }], 'M21 21l-4.3-4.3'],
    lock: [['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }], 'M8 11V8a4 4 0 0 1 8 0v3'],
    vault: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 3 }], ['circle', { cx: 12, cy: 12, r: 4 }], 'M12 8v1.5', 'M12 14.5V16', 'M8 12h1.5', 'M14.5 12H16'],
    key: [['circle', { cx: 8, cy: 15, r: 4 }], 'M11 12l9-9', 'M16 7l3 3'],
    sliders: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', ['circle', { cx: 15, cy: 6, r: 2 }], ['circle', { cx: 9, cy: 12, r: 2 }], ['circle', { cx: 17, cy: 18, r: 2 }]],
    refresh: ['M20 11a8 8 0 0 0-14.9-3', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.9 3', 'M20 20v-4h-4'],
    download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
    upload: ['M12 16V5', 'M7 9l5-5 5 5', 'M5 20h14'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
    alert: ['M12 3l10 18H2L12 3z', 'M12 10v5', 'M12 18h.01']
  };
  function icon(name, extra) {
    const svg = h('svg', { viewBox: '0 0 24 24', class: 'icon' + (extra ? ' ' + extra : ''), 'aria-hidden': 'true', width: 20, height: 20 });
    for (const part of ICONS[name]) {
      if (typeof part === 'string') svg.append(h('path', { d: part }));
      else svg.append(h(part[0], part[1]));
    }
    return svg;
  }
  const iconBtn = (name, label, onClick, cls) =>
    h('button', { type: 'button', class: 'iconbtn' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label, onClick }, icon(name));

  // ------------------------------------------------------------------ toast + clipboard
  let toastBox;
  function toast(msg, kind) {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
    const el = h('div', { class: 'toast' + (kind ? ' ' + kind : '') }, msg);
    toastBox.append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 5000 : 3200);
  }

  let clipTimer = null;
  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const ta = h('textarea', { class: 'offscreen', readonly: '' });
      ta.value = text; document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  async function clearClipboardNow() {
    if (clipTimer) { clearTimeout(clipTimer); clipTimer = null; }
    try { await navigator.clipboard.writeText(''); } catch (e) { /* may be unfocused */ }
  }
  async function copySecret(text, whatKey) {
    if (!text) { toast(t('acc.nothingToCopy')); return; }
    if (!(await writeClipboard(text))) { toast(t('acc.nothingToCopy'), 'error'); return; }
    toast(t('acc.copied', { what: t(whatKey), s: prefs.clipboardSec }));
    if (clipTimer) clearTimeout(clipTimer);
    clipTimer = setTimeout(() => { clipTimer = null; navigator.clipboard.writeText('').catch(() => {}); }, prefs.clipboardSec * 1000);
  }

  const fmtDate = (ts) => new Intl.DateTimeFormat(prefs.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { dateStyle: 'medium' }).format(new Date(ts));

  function safeUrl(u) {
    if (!u) return null;
    const s = /^[a-z][a-z0-9+.-]*:/i.test(u.trim()) ? u.trim() : 'https://' + u.trim();
    try { const x = new URL(s); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; }
  }
  function hostOf(u) { const s = safeUrl(u); try { return s ? new URL(s).hostname : ''; } catch (e) { return ''; } }

  // ------------------------------------------------------------------ state
  const root = document.getElementById('app');
  let vault = null;
  let hasVault = false;
  const S = { tab: 'home', q: '', filter: 'all', cat: 'all', revealed: new Map() };
  let listEl = null;
  let lastActivity = Date.now();

  const catName = (id) => {
    if (BUILTIN.includes(id)) return t('cat.' + id);
    const c = vault.categories.find((x) => x.id === id);
    return c ? c.name : t('cat.other');
  };
  const allCats = () => BUILTIN.map((id) => ({ id, name: t('cat.' + id) })).concat(vault.categories);
  const hueOf = (s) => { let n = 0; for (const ch of s) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n % 6; };

  // ------------------------------------------------------------------ strength meter
  function meter() {
    const bars = [0, 1, 2, 3, 4].map(() => h('i'));
    const label = h('span', { class: 'meter-label' });
    const el = h('div', { class: 'meter', 'aria-live': 'polite' }, h('div', { class: 'bars' }, bars), label);
    return {
      el,
      update(pw) {
        const r = VG.strength(pw);
        bars.forEach((b, i) => { b.className = pw && i <= r.score ? 's' + r.score : ''; });
        label.textContent = pw ? t('str.' + r.score) : t('str.none');
        return r;
      }
    };
  }

  // password input with a show/hide toggle
  function passwordInput(opts) {
    const input = h('input', Object.assign({ type: 'password', class: 'input ltr', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }, opts));
    const btn = h('button', { type: 'button', class: 'iconbtn inside', 'aria-label': t('g.show'), title: t('g.show') }, icon('eye'));
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
      const l = t(show ? 'g.hide' : 'g.show');
      btn.setAttribute('aria-label', l); btn.title = l;
    });
    return { input, wrap: h('div', { class: 'pwwrap' }, input, btn) };
  }
  const field = (label, control, extra) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), control, extra);

  // ------------------------------------------------------------------ modals
  const modals = [];
  function openModal(title, body, actions) {
    const prev = document.activeElement;
    const overlay = h('div', { class: 'overlay' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'modal-head' }, h('h2', {}, title), iconBtn('x', t('g.close'), () => m.close())),
      h('div', { class: 'modal-body' }, body),
      actions && actions.length ? h('footer', { class: 'modal-foot' }, actions) : null);
    overlay.append(box);
    document.body.append(overlay);
    document.body.classList.add('modal-open');
    const m = {
      box,
      close() {
        overlay.remove();
        const i = modals.indexOf(m); if (i >= 0) modals.splice(i, 1);
        if (!modals.length) document.body.classList.remove('modal-open');
        if (prev && prev.isConnected && prev.focus) prev.focus();
      }
    };
    modals.push(m);
    const first = box.querySelector('input:not([type=file]),select,textarea');
    (first || box.querySelector('.modal-foot button') || box).focus();
    return m;
  }
  function closeAllModals() { modals.slice().forEach((m) => m.close()); }

  // One document-level handler so Escape and Tab-trapping keep working even if focus was lost
  // (e.g. a button was disabled while an async action ran).
  document.addEventListener('keydown', (e) => {
    const top = modals[modals.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); top.close(); return; }
    if (e.key === 'Tab') {
      const f = Array.from(top.box.querySelectorAll('button,input,select,textarea,a[href]')).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], active = document.activeElement;
      if (!top.box.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  });

  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } m.close(); };
      const ok = h('button', { type: 'button', class: 'btn ' + (danger ? 'danger-fill' : 'primary'), onClick: () => finish(true) }, okLabel);
      const no = h('button', { type: 'button', class: 'btn', onClick: () => finish(false) }, t('acc.cancel'));
      const m = openModal(title, h('p', {}, text), [no, ok]);
      m.box.parentElement.addEventListener('click', (e) => { if (e.target === m.box.parentElement) finish(false); });
      no.focus();
    });
  }

  // ------------------------------------------------------------------ lock / unlock
  function lockVault(auto) {
    vault.lock();
    S.revealed.forEach((tm) => clearTimeout(tm));
    S.revealed.clear();
    S.q = ''; S.filter = 'all'; S.cat = 'all'; S.tab = 'home';
    closeAllModals();
    clearClipboardNow();
    render();
    if (auto) toast(t('lock.autoLocked'));
  }

  function failState() { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setFailState(o) { try { localStorage.setItem(FAIL_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }

  function dial() {
    const ring = h('g', { class: 'dial-ring' });
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180, major = i % 5 === 0, r1 = major ? 45 : 49, r2 = 55;
      ring.append(h('line', { x1: (60 + r1 * Math.sin(a)).toFixed(2), y1: (60 - r1 * Math.cos(a)).toFixed(2), x2: (60 + r2 * Math.sin(a)).toFixed(2), y2: (60 - r2 * Math.cos(a)).toFixed(2), class: major ? 'tick major' : 'tick' }));
    }
    const svg = h('svg', { viewBox: '0 0 120 120', class: 'dial', 'aria-hidden': 'true' },
      ring, h('circle', { cx: 60, cy: 60, r: 38, class: 'dial-face' }), h('path', { d: 'M60 2l5 9H55z', class: 'dial-pointer' }),
      h('rect', { x: 50, y: 56, width: 20, height: 15, rx: 3, class: 'dial-lock' }),
      h('path', { d: 'M54 56v-4a6 6 0 0 1 12 0v4', class: 'dial-shackle' }));
    return { svg, ring };
  }

  function renderLock() {
    const setup = !hasVault;
    const d = dial();
    const pw = passwordInput({ placeholder: t('lock.master'), 'aria-label': t('lock.master'), autocomplete: 'off' });
    const pw2 = setup ? passwordInput({ placeholder: t('lock.confirm'), 'aria-label': t('lock.confirm') }) : null;
    const m = setup ? meter() : null;
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { type: 'button', class: 'btn primary wide' }, setup ? t('lock.create') : t('lock.unlock'));
    let busy = false;

    const turn = () => { d.ring.style.transform = 'rotate(' + (pw.input.value.length * 6) + 'deg)'; };
    pw.input.addEventListener('input', () => { turn(); if (m) m.update(pw.input.value); err.textContent = ''; });
    if (m) m.update('');

    async function submit() {
      if (busy) return;
      err.textContent = '';
      const v = pw.input.value;
      if (setup) {
        if (v.length < MIN_MASTER) { err.textContent = t('lock.errShort'); return; }
        if (VG.strength(v).score < 2) { err.textContent = t('lock.errWeak'); return; }
        if (v !== pw2.input.value) { err.textContent = t('lock.errMatch'); return; }
      } else {
        const fs = failState();
        const wait = Math.ceil(((fs.until || 0) - Date.now()) / 1000);
        if (wait > 0) { err.textContent = t('lock.errWait', { s: wait }); return; }
      }
      busy = true; btn.disabled = true; btn.textContent = t('lock.working');
      try {
        if (setup) { await vault.create(v); hasVault = true; }
        else { await vault.unlock(v); setFailState({}); }
        pw.input.value = ''; if (pw2) pw2.input.value = '';
        d.ring.style.transform = 'rotate(300deg)';
        d.svg.classList.add('open');
        await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450));
        lastActivity = Date.now();
        render();
        if (vault.corrupt) toast(t('lock.errCorrupt', { n: vault.corrupt }), 'error');
      } catch (e) {
        busy = false; btn.disabled = false; btn.textContent = setup ? t('lock.create') : t('lock.unlock');
        if (e && e.code === 'BAD_PASSWORD') {
          const fs = failState(); const n = (fs.n || 0) + 1;
          setFailState({ n, until: n >= 3 ? Date.now() + Math.min(30, Math.pow(2, n - 3)) * 1000 : 0 });
          err.textContent = t('lock.errWrong');
          d.svg.classList.remove('shake'); void d.svg.getBoundingClientRect(); d.svg.classList.add('shake');
        } else { err.textContent = t('lock.noDb'); }
      }
    }
    btn.addEventListener('click', submit);
    [pw.input, pw2 && pw2.input].forEach((i) => i && i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));

    root.append(h('main', { class: 'lockscreen' },
      h('div', { class: 'lock-tools' }, langButton(), themeButton()),
      h('section', { class: 'lock-card' },
        d.svg,
        h('h1', {}, 'Vaulty', h('span', { class: 'sub' }, ' ' + (prefs.lang === 'ar' ? 'خزنتي' : ''))),
        h('p', { class: 'tagline' }, t('app.tagline')),
        h('h2', {}, setup ? t('lock.setupTitle') : t('lock.unlockTitle')),
        setup ? h('p', { class: 'hint' }, t('lock.setupHint')) : null,
        pw.wrap, pw2 ? pw2.wrap : null, m ? m.el : null, err, btn)));
    setTimeout(() => pw.input.focus(), 0);
  }

  function langButton() {
    return h('button', { type: 'button', class: 'btn small', onClick: () => { prefs.lang = prefs.lang === 'ar' ? 'en' : 'ar'; savePrefs(); render(); } }, prefs.lang === 'ar' ? 'English' : 'العربية');
  }
  function themeButton() {
    const order = ['auto', 'light', 'dark'];
    return h('button', { type: 'button', class: 'btn small', onClick: () => { prefs.theme = order[(order.indexOf(prefs.theme) + 1) % 3]; savePrefs(); render(); } }, t('theme.' + prefs.theme));
  }

  // ------------------------------------------------------------------ main shell
  function render() {
    applyPrefs();
    root.replaceChildren();
    listEl = null;
    if (!VC.available) { root.append(h('main', { class: 'lockscreen' }, h('section', { class: 'lock-card' }, h('h1', {}, 'Vaulty'), h('p', { class: 'error' }, t('lock.noCrypto'))))); return; }
    if (!vault.isUnlocked()) renderLock(); else renderMain();
  }

  function renderMain() {
    const tabs = [['home', 'vault', 'nav.home'], ['generator', 'key', 'nav.generator'], ['settings', 'sliders', 'nav.settings']];
    const navBtn = (cls) => ([id, ic, key]) => h('button', { type: 'button', class: cls + (S.tab === id ? ' active' : ''), 'aria-current': S.tab === id ? 'page' : null, onClick: () => { S.tab = id; renderMain2(); } }, icon(ic), h('span', {}, t(key)));
    const view = h('section', { class: 'view' });
    root.replaceChildren(h('div', { class: 'shell' },
      h('aside', { class: 'rail' },
        h('div', { class: 'brand' }, icon('vault', 'brand-icon'), h('strong', {}, 'Vaulty'), h('span', {}, prefs.lang === 'ar' ? 'خزنتي' : '')),
        h('nav', { class: 'rail-nav', 'aria-label': 'Main' }, tabs.map(navBtn('railbtn'))),
        h('button', { type: 'button', class: 'btn wide', onClick: () => lockVault(false) }, icon('lock'), t('act.lock'))),
      h('main', { class: 'main' },
        h('header', { class: 'top' },
          h('h1', {}, t(tabs.find((x) => x[0] === S.tab)[2])),
          h('div', { class: 'top-actions' },
            S.tab === 'home' ? iconBtn('eyeOff', t('act.hideAll'), hideAll) : null,
            iconBtn('lock', t('act.lock'), () => lockVault(false), 'mobile-only'))),
        view),
      h('nav', { class: 'tabbar', 'aria-label': 'Main' }, tabs.map(navBtn('tab'))),
      S.tab === 'home' ? h('button', { type: 'button', class: 'fab', 'aria-label': t('act.add'), title: t('act.add'), onClick: () => openAccountForm(null) }, icon('plus')) : null));
    if (S.tab === 'home') viewHome(view);
    else if (S.tab === 'generator') viewGenerator(view);
    else viewSettings(view);
  }
  const renderMain2 = renderMain;

  function hideAll() {
    S.revealed.forEach((tm) => clearTimeout(tm));
    S.revealed.clear();
    refreshList();
  }

  // ------------------------------------------------------------------ home
  function viewHome(view) {
    const accounts = vault.list();
    const info = VG.analyze(accounts);
    const tile = (id, label, n) => h('button', { type: 'button', class: 'tile' + (S.filter === id ? ' active' : '') + (id === 'weak' && n ? ' warn' : ''), 'aria-pressed': S.filter === id ? 'true' : 'false',
      onClick: () => { S.filter = S.filter === id && id !== 'all' ? 'all' : id; renderMain(); } },
      h('strong', {}, n), h('span', {}, label));
    const search = h('input', { type: 'search', class: 'input search', placeholder: t('home.search'), 'aria-label': t('home.search'), value: S.q, autocomplete: 'off' });
    search.addEventListener('input', () => { S.q = search.value; refreshList(); });
    const cats = [{ id: 'all', name: t('home.catAll') }].concat(allCats());
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('f.category') },
      cats.map((c) => h('button', { type: 'button', class: 'chip' + (S.cat === c.id ? ' active' : ''), 'aria-pressed': S.cat === c.id ? 'true' : 'false', onClick: () => { S.cat = c.id; renderMain(); } }, c.name)));
    const recent = accounts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

    view.append(
      h('div', { class: 'tiles' }, tile('all', t('home.all'), accounts.length), tile('fav', t('home.fav'), accounts.filter((a) => a.favorite).length),
        tile('weak', t('home.weak'), info.weak.size), tile('reused', t('home.reused'), info.reused.size)),
      h('div', { class: 'searchwrap' }, icon('search', 'search-icon'), search),
      chips,
      accounts.length > 1 && !S.q && S.filter === 'all' && S.cat === 'all'
        ? h('div', { class: 'recent' }, h('h2', {}, t('home.recent')), h('div', { class: 'recent-row' },
          recent.map((a) => h('button', { type: 'button', class: 'recent-item', onClick: () => openAccountForm(a) },
            h('span', { class: 'avatar sm hue' + hueOf(a.name) }, Array.from(a.name)[0].toUpperCase()), h('span', { class: 'rname' }, a.name), h('time', {}, fmtDate(a.createdAt)))))) : null);
    listEl = h('div', { class: 'cards' });
    view.append(listEl);
    refreshList();
  }

  function refreshList() {
    if (!listEl) return;
    const accounts = vault.list();
    const info = VG.analyze(accounts);
    const q = S.q.trim().toLowerCase();
    let items = accounts.filter((a) => {
      if (S.cat !== 'all' && a.category !== S.cat) return false;
      if (S.filter === 'fav' && !a.favorite) return false;
      if (S.filter === 'weak' && !info.weak.has(a.id)) return false;
      if (S.filter === 'reused' && !info.reused.has(a.id)) return false;
      if (!q) return true;
      return [a.name, a.email, a.username, a.url].some((s) => s && s.toLowerCase().includes(q));
    });
    const cmp = new Intl.Collator(prefs.lang === 'ar' ? 'ar' : 'en', { sensitivity: 'base' }).compare;
    items.sort((a, b) => (b.favorite - a.favorite) || cmp(a.name, b.name));
    listEl.replaceChildren();
    if (!accounts.length) {
      listEl.append(h('div', { class: 'empty' }, icon('vault', 'empty-icon'), h('h2', {}, t('home.emptyTitle')), h('p', {}, t('home.emptyText')),
        h('button', { type: 'button', class: 'btn primary', onClick: () => openAccountForm(null) }, icon('plus'), t('act.add'))));
      return;
    }
    if (!items.length) { listEl.append(h('p', { class: 'empty-line' }, t('home.noResults'))); return; }
    items.forEach((a) => listEl.append(accountCard(a, info)));
  }

  function setRevealed(id, on) {
    if (S.revealed.has(id)) { clearTimeout(S.revealed.get(id)); S.revealed.delete(id); }
    if (on) S.revealed.set(id, setTimeout(() => { S.revealed.delete(id); refreshList(); }, REVEAL_MS));
    refreshList();
  }

  function accountCard(a, info) {
    const shown = S.revealed.has(a.id);
    const ident = a.username || a.email;
    const url = safeUrl(a.url);
    return h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'avatar hue' + hueOf(a.name), 'aria-hidden': 'true' }, Array.from(a.name)[0].toUpperCase()),
        h('div', { class: 'card-title' }, h('h3', { dir: 'auto' }, a.name), h('p', { class: 'ident', dir: 'auto' }, ident || t('acc.noUser'))),
        iconBtn('star', t(a.favorite ? 'acc.unfav' : 'acc.fav'), async () => { await vault.saveAccount(Object.assign({}, a, { favorite: !a.favorite })); refreshList(); }, a.favorite ? 'fav on' : 'fav')),
      h('div', { class: 'badges' },
        h('span', { class: 'badge cat' }, catName(a.category)),
        info.weak.has(a.id) ? h('span', { class: 'badge warn' }, icon('alert'), t('acc.weakBadge')) : null,
        info.reused.has(a.id) ? h('span', { class: 'badge warn' }, icon('alert'), t('acc.reusedBadge')) : null,
        url ? h('span', { class: 'badge host', dir: 'ltr' }, hostOf(a.url)) : null),
      h('div', { class: 'pw-row' },
        h('span', { class: 'pw-text ltr', 'aria-live': 'off' }, a.password ? (shown ? a.password : '••••••••••') : '—'),
        a.password ? iconBtn(shown ? 'eyeOff' : 'eye', t(shown ? 'acc.hide' : 'acc.show'), () => setRevealed(a.id, !shown)) : null),
      h('div', { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn small', onClick: () => copySecret(a.username || a.email, 'acc.whatUser') }, icon('copy'), t('acc.copyUser')),
        h('button', { type: 'button', class: 'btn small', onClick: () => copySecret(a.password, 'acc.whatPass') }, icon('copy'), t('acc.copyPass')),
        a.url ? iconBtn('link', t('acc.open'), () => { const u = safeUrl(a.url); if (u) window.open(u, '_blank', 'noopener,noreferrer'); else toast(t('acc.badUrl'), 'error'); }) : null,
        iconBtn('edit', t('acc.edit1'), () => openAccountForm(a)),
        iconBtn('trash', t('acc.delete'), async () => {
          if (await confirmDialog(t('acc.deleteTitle'), t('acc.deleteText', { name: a.name }), t('acc.delete'), true)) {
            await vault.deleteAccount(a.id); setRevealed(a.id, false); toast(t('acc.deleted')); renderMain();
          }
        }, 'danger-text')));
  }

  // ------------------------------------------------------------------ account form
  function openAccountForm(existing) {
    const a = existing ? Object.assign({}, existing) : { name: '', username: '', email: '', password: '', url: '', category: 'other', notes: '', favorite: false };
    const name = h('input', { type: 'text', class: 'input', value: a.name, maxlength: 200, autocomplete: 'off', dir: 'auto' });
    const username = h('input', { type: 'text', class: 'input ltr', value: a.username, maxlength: 200, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const email = h('input', { type: 'email', class: 'input ltr', value: a.email, maxlength: 254, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const pw = passwordInput({ value: a.password, maxlength: 1024 });
    const url = h('input', { type: 'text', class: 'input ltr', value: a.url, maxlength: 2048, autocomplete: 'off', autocapitalize: 'off', inputmode: 'url', placeholder: 'example.com' });
    const cat = h('select', { class: 'input' }, allCats().map((c) => h('option', { value: c.id }, c.name)));
    cat.value = allCats().some((c) => c.id === a.category) ? a.category : 'other';
    const notes = h('textarea', { class: 'input', rows: 4, maxlength: 10000, dir: 'auto' }); notes.value = a.notes;
    const m = meter(); m.update(a.password);
    pw.input.addEventListener('input', () => m.update(pw.input.value));
    const gen = h('button', { type: 'button', class: 'btn small', onClick: () => {
      pw.input.value = VG.generate({ length: 20 }); pw.input.type = 'text'; m.update(pw.input.value);
    } }, icon('refresh'), t('acc.generate'));
    const err = h('p', { class: 'error', role: 'alert' });

    const save = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
      err.textContent = '';
      if (!name.value.trim()) { err.textContent = t('acc.nameRequired'); name.focus(); return; }
      if (url.value.trim() && !safeUrl(url.value)) { err.textContent = t('acc.badUrl'); url.focus(); return; }
      save.disabled = true;
      try {
        await vault.saveAccount(Object.assign({}, a, { name: name.value.trim(), username: username.value.trim(), email: email.value.trim(), password: pw.input.value,
          url: url.value.trim(), category: cat.value, notes: notes.value }));
        mod.close(); toast(t('acc.saved')); renderMain();
      } catch (e) { save.disabled = false; err.textContent = t('acc.saveFailed'); }
    } }, t('acc.save'));
    const cancel = h('button', { type: 'button', class: 'btn', onClick: () => mod.close() }, t('acc.cancel'));

    const body = h('div', { class: 'form' },
      field(t('f.name'), name), field(t('f.username'), username), field(t('f.email'), email),
      field(t('f.password'), pw.wrap, h('div', { class: 'pw-tools' }, m.el, gen)),
      field(t('f.url'), url), field(t('f.category'), cat), field(t('f.notes'), notes),
      existing ? h('p', { class: 'meta' }, t('f.created', { d: fmtDate(a.createdAt) })) : null, err);
    const mod = openModal(existing ? t('acc.edit') : t('acc.add'), body, [cancel, save]);
    if (existing) name.blur();
  }

  // ------------------------------------------------------------------ generator
  function viewGenerator(view) {
    const o = { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false };
    const out = h('output', { class: 'gen-out ltr', 'aria-label': t('gen.output') });
    const m = meter();
    const err = h('p', { class: 'error', role: 'alert' });
    const lenLabel = h('span', { class: 'label' });
    const range = h('input', { type: 'range', min: 8, max: 64, value: o.length, class: 'range', 'aria-label': t('gen.length', { n: '' }) });
    let current = '';
    function make() {
      err.textContent = '';
      try { current = VG.generate(o); } catch (e) { current = ''; err.textContent = t('gen.needOne'); }
      out.textContent = current; m.update(current);
      lenLabel.textContent = t('gen.length', { n: o.length });
    }
    range.addEventListener('input', () => { o.length = +range.value; make(); });
    const check = (key, label) => {
      const cb = h('input', { type: 'checkbox', checked: o[key] });
      cb.addEventListener('change', () => { o[key] = cb.checked; make(); });
      return h('label', { class: 'check' }, cb, h('span', {}, label));
    };
    view.append(h('div', { class: 'panel gen' },
      out, m.el,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onClick: make }, icon('refresh'), t('gen.new')),
        h('button', { type: 'button', class: 'btn', onClick: () => copySecret(current, 'acc.whatGen') }, icon('copy'), t('gen.copy'))),
      h('div', { class: 'range-row' }, lenLabel, range),
      h('div', { class: 'checks' }, check('lower', t('gen.lower')), check('upper', t('gen.upper')), check('digits', t('gen.digits')), check('symbols', t('gen.symbols')), check('avoidAmbiguous', t('gen.ambiguous'))),
      err));
    make();
  }

  // ------------------------------------------------------------------ settings
  function select(options, value, onChange, label) {
    const s = h('select', { class: 'input', 'aria-label': label }, options.map(([v, l]) => h('option', { value: v }, l)));
    s.value = String(value);
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  const row = (label, control) => h('div', { class: 'setrow' }, h('span', {}, label), control);

  function viewSettings(view) {
    const catInput = h('input', { type: 'text', class: 'input', maxlength: 40, placeholder: t('set.catName'), 'aria-label': t('set.catName') });
    const addCat = async () => { const n = catInput.value.trim(); if (!n) return; await vault.addCategory(n); renderMain(); };
    catInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCat(); });

    view.append(
      h('section', { class: 'panel' }, h('h2', {}, t('set.appearance')),
        row(t('set.theme'), select([['auto', t('theme.auto')], ['light', t('theme.light')], ['dark', t('theme.dark')]], prefs.theme, (v) => { prefs.theme = v; savePrefs(); applyPrefs(); }, t('set.theme'))),
        row(t('set.language'), select([['ar', 'العربية'], ['en', 'English']], prefs.lang, (v) => { prefs.lang = v; savePrefs(); render(); }, t('set.language')))),
      h('section', { class: 'panel' }, h('h2', {}, t('set.security')),
        row(t('set.autolock'), select(LOCK_OPTIONS.map((n) => [n, t('set.minutes', { n })]), prefs.autoLockMin, (v) => { prefs.autoLockMin = +v; savePrefs(); }, t('set.autolock'))),
        row(t('set.clip'), select(CLIP_OPTIONS.map((n) => [n, t('set.seconds', { n })]), prefs.clipboardSec, (v) => { prefs.clipboardSec = +v; savePrefs(); }, t('set.clip'))),
        h('button', { type: 'button', class: 'btn', onClick: openChangeMaster }, icon('key'), t('set.changeMaster'))),
      h('section', { class: 'panel' }, h('h2', {}, t('set.categories')),
        vault.categories.length ? h('ul', { class: 'catlist' }, vault.categories.map((c) => h('li', {}, h('span', { dir: 'auto' }, c.name),
          iconBtn('trash', t('set.catDelete'), async () => {
            if (await confirmDialog(t('set.catDeleteTitle'), t('set.catDeleteText', { name: c.name }), t('acc.delete'), true)) { await vault.deleteCategory(c.id); if (S.cat === c.id) S.cat = 'all'; renderMain(); }
          }, 'danger-text')))) : h('p', { class: 'meta' }, t('set.catNone')),
        h('div', { class: 'row' }, catInput, h('button', { type: 'button', class: 'btn', onClick: addCat }, icon('plus'), t('set.catAdd')))),
      h('section', { class: 'panel' }, h('h2', {}, t('set.backup')),
        h('p', { class: 'meta' }, prefs.lastBackup ? t('set.lastBackup', { d: fmtDate(prefs.lastBackup) }) : t('set.noBackup')),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onClick: openExport }, icon('download'), t('set.export')),
          h('button', { type: 'button', class: 'btn', onClick: openImport }, icon('upload'), t('set.import')))),
      h('section', { class: 'panel danger' }, h('h2', {}, t('set.danger')),
        h('button', { type: 'button', class: 'btn danger', onClick: openWipe }, icon('trash'), t('set.wipe'))),
      h('section', { class: 'panel' }, h('h2', {}, t('set.about')),
        h('p', {}, 'Vaulty – خزنتي · ' + t('set.version', { v: VERSION })), h('p', { class: 'meta' }, t('set.aboutText'))));
  }

  function openChangeMaster() {
    const cur = passwordInput({ 'aria-label': t('mm.current') });
    const nw = passwordInput({ 'aria-label': t('mm.new') });
    const nw2 = passwordInput({ 'aria-label': t('mm.confirm') });
    const m = meter(); m.update('');
    nw.input.addEventListener('input', () => m.update(nw.input.value));
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
      err.textContent = '';
      if (nw.input.value.length < MIN_MASTER) { err.textContent = t('lock.errShort'); return; }
      if (VG.strength(nw.input.value).score < 2) { err.textContent = t('lock.errWeak'); return; }
      if (nw.input.value !== nw2.input.value) { err.textContent = t('lock.errMatch'); return; }
      go.disabled = true; go.textContent = t('g.working');
      try { await vault.changeMaster(cur.input.value, nw.input.value); mod.close(); toast(t('mm.changed')); }
      catch (e) { go.disabled = false; go.textContent = t('mm.change'); err.textContent = e.code === 'BAD_PASSWORD' ? t('lock.errWrong') : t('acc.saveFailed'); }
    } }, t('mm.change'));
    const mod = openModal(t('mm.title'), h('div', { class: 'form' }, field(t('mm.current'), cur.wrap), field(t('mm.new'), nw.wrap, m.el), field(t('mm.confirm'), nw2.wrap), err),
      [h('button', { type: 'button', class: 'btn', onClick: () => mod.close() }, t('acc.cancel')), go]);
  }

  function openExport() {
    const p1 = passwordInput({ 'aria-label': t('bk.password') });
    const p2 = passwordInput({ 'aria-label': t('bk.confirm') });
    const m = meter(); m.update('');
    p1.input.addEventListener('input', () => m.update(p1.input.value));
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
      err.textContent = '';
      if (p1.input.value.length < MIN_MASTER) { err.textContent = t('bk.short'); return; }
      if (p1.input.value !== p2.input.value) { err.textContent = t('lock.errMatch'); return; }
      go.disabled = true; go.textContent = t('g.working');
      try {
        const payload = vault.exportPayload();
        const file = await VC.createBackup(p1.input.value, payload);
        const blob = new Blob([JSON.stringify(file)], { type: 'application/octet-stream' });
        const href = URL.createObjectURL(blob);
        const a = h('a', { href, download: 'vaulty-backup-' + new Date().toISOString().slice(0, 10) + '.vaulty', class: 'offscreen' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
        prefs.lastBackup = Date.now(); savePrefs();
        mod.close(); toast(t('bk.done', { n: payload.accounts.length })); if (S.tab === 'settings') renderMain();
      } catch (e) { go.disabled = false; go.textContent = t('bk.export'); err.textContent = t('acc.saveFailed'); }
    } }, t('bk.export'));
    const mod = openModal(t('bk.title'), h('div', { class: 'form' }, h('p', { class: 'hint' }, t('bk.text')), field(t('bk.password'), p1.wrap, m.el), field(t('bk.confirm'), p2.wrap), err),
      [h('button', { type: 'button', class: 'btn', onClick: () => mod.close() }, t('acc.cancel')), go]);
  }

  function openImport() {
    const file = h('input', { type: 'file', class: 'input', accept: '.vaulty,.json,application/json,application/octet-stream' });
    const pw = passwordInput({ 'aria-label': t('im.password') });
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
      err.textContent = '';
      const f = file.files && file.files[0];
      if (!f) { err.textContent = t('im.noFile'); return; }
      go.disabled = true; go.textContent = t('g.working');
      const reset = () => { go.disabled = false; go.textContent = t('im.restore'); };
      let parsed;
      try { if (f.size > 30 * 1024 * 1024) throw new Error('big'); parsed = JSON.parse(await f.text()); } catch (e) { reset(); err.textContent = t('im.badFile'); return; }
      try {
        const payload = await VC.openBackup(pw.input.value, parsed);   // integrity + password check
        const r = await vault.importPayload(payload);
        mod.close(); toast(t('im.result', { a: r.added, u: r.updated, s: r.skipped })); renderMain();
      } catch (e) {
        reset(); err.textContent = e.code === 'BAD_PASSWORD' ? t('im.badPass') : t('im.badFile');
      }
    } }, t('im.restore'));
    const mod = openModal(t('im.title'), h('div', { class: 'form' }, h('p', { class: 'hint' }, t('im.text')), field(t('im.file'), file), field(t('im.password'), pw.wrap), err),
      [h('button', { type: 'button', class: 'btn', onClick: () => mod.close() }, t('acc.cancel')), go]);
  }

  function openWipe() {
    const pw = passwordInput({ 'aria-label': t('lock.master') });
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { type: 'button', class: 'btn danger-fill', onClick: async () => {
      err.textContent = '';
      go.disabled = true;
      if (!(await vault.verify(pw.input.value))) { go.disabled = false; err.textContent = t('lock.errWrong'); return; }
      await vault.wipe(); hasVault = false; setFailState({}); mod.close(); S.tab = 'home'; render(); toast(t('wipe.done'));
    } }, t('wipe.ok'));
    const mod = openModal(t('wipe.title'), h('div', { class: 'form' }, h('p', {}, t('wipe.text')), field(t('lock.master'), pw.wrap), err),
      [h('button', { type: 'button', class: 'btn', onClick: () => mod.close() }, t('acc.cancel')), go]);
  }

  // ------------------------------------------------------------------ auto-lock
  function touch() { lastActivity = Date.now(); }
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'input'].forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
  const idleExceeded = () => vault && vault.isUnlocked() && Date.now() - lastActivity > prefs.autoLockMin * 60000;
  setInterval(() => { if (idleExceeded()) lockVault(true); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && idleExceeded()) lockVault(true); });

  // ------------------------------------------------------------------ boot
  async function boot() {
    applyPrefs();
    if (!VC.available) { vault = { isUnlocked: () => false }; render(); return; }
    try {
      vault = new Vault(new VS.IDBStorage('vaulty'));
      hasVault = await vault.exists();
    } catch (e) {
      vault = { isUnlocked: () => false };
      root.append(h('main', { class: 'lockscreen' }, h('section', { class: 'lock-card' }, h('h1', {}, 'Vaulty'), h('p', { class: 'error' }, t('lock.noDb')))));
      return;
    }
    render();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
