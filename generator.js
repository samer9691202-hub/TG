/* Vaulty – password generator, strength estimator, weak/reused analysis. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.VaultyGen = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  let C = root.crypto;
  if ((!C || !C.getRandomValues) && typeof require === 'function') C = require('node:crypto').webcrypto;

  const SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/~'
  };
  const AMBIGUOUS = /[0O1lI|`'"]/g;

  // Unbiased random integer in [0, max) using rejection sampling.
  function randInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const a = new Uint32Array(1);
    do { C.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % max;
  }

  function generate(opts) {
    const o = Object.assign({ length: 16, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false }, opts);
    const pools = ['lower', 'upper', 'digits', 'symbols']
      .filter((k) => o[k])
      .map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
    if (!pools.length) throw new Error('NO_SET');
    const length = Math.max(pools.length, Math.min(128, Math.floor(o.length)));
    const all = pools.join('');
    const out = pools.map((p) => p[randInt(p.length)]);   // at least one char from every chosen set
    while (out.length < length) out.push(all[randInt(all.length)]);
    for (let i = out.length - 1; i > 0; i--) {              // Fisher–Yates shuffle
      const j = randInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
  }

  const COMMON = ['password', 'passw0rd', 'p@ssw0rd', '123456', '12345678', '123456789', 'qwerty', 'abc123', 'letmein',
    'admin', 'welcome', 'iloveyou', '111111', '000000', 'monkey', 'dragon', 'login', '1q2w3e', 'azerty', '123123', 'secret'];

  // Rough entropy estimate (bits) with penalties for repeats, sequences and common words.
  function strength(pw) {
    pw = String(pw || '');
    if (!pw) return { score: 0, bits: 0 };
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[ -/:-@[-`{-~]/.test(pw)) pool += 33;
    if (/[^\x00-\x7F]/.test(pw)) pool += 64;
    pool = pool || 1;
    const chars = Array.from(pw);
    const uniq = new Set(chars).size;
    let bits = uniq * Math.log2(pool) + (chars.length - uniq) * 1;
    let seq = 0;
    for (let i = 2; i < chars.length; i++) {
      const a = chars[i].charCodeAt(0), b = chars[i - 1].charCodeAt(0), c = chars[i - 2].charCodeAt(0);
      if (a - b === b - c && Math.abs(a - b) === 1) seq++;
    }
    bits -= seq * 3;
    const low = pw.toLowerCase();
    if (COMMON.includes(low)) bits = Math.min(bits, 10);
    else if (COMMON.some((w) => low.includes(w))) bits = Math.min(bits, 30);
    bits = Math.max(0, bits);
    const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { score, bits: Math.round(bits) };
  }

  // accounts: array of { id, password } → ids of weak and reused passwords.
  function analyze(accounts) {
    const weak = new Set();
    const reused = new Set();
    const byPw = new Map();
    for (const a of accounts) {
      if (!a.password) continue;
      if (strength(a.password).score < 2) weak.add(a.id);
      if (!byPw.has(a.password)) byPw.set(a.password, []);
      byPw.get(a.password).push(a.id);
    }
    for (const ids of byPw.values()) if (ids.length > 1) ids.forEach((id) => reused.add(id));
    return { weak, reused };
  }

  return { SETS, randInt, generate, strength, analyze };
});
