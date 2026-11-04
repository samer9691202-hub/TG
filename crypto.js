/* Vaulty – crypto primitives. No dependencies. Uses the browser's Web Crypto API.
 * UMD: window.VaultyCrypto in the browser, module.exports in Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.VaultyCrypto = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  let C = root.crypto;
  if ((!C || !C.subtle) && typeof require === 'function') C = require('node:crypto').webcrypto;
  const available = !!(C && C.subtle);

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // PBKDF2-HMAC-SHA256 at 600,000 iterations (OWASP 2023 recommendation).
  // Parameters are stored next to the data, so they can be raised in the future.
  const KDF_DEFAULT = { name: 'PBKDF2-SHA256', iterations: 600000 };
  const MIN_ITER = 100000;
  const MAX_ITER = 5000000;

  function fail(code) { const e = new Error(code); e.code = code; return e; }

  function b64e(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64d(str) {
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function randomBytes(n) { const b = new Uint8Array(n); C.getRandomValues(b); return b; }

  function validateKdf(kdf) {
    if (!kdf || kdf.name !== KDF_DEFAULT.name || !Number.isInteger(kdf.iterations) ||
        kdf.iterations < MIN_ITER || kdf.iterations > MAX_ITER) throw fail('BAD_FORMAT');
  }

  // Derives a non-extractable AES-256-GCM key from a password.
  async function deriveKey(password, salt, kdf) {
    validateKdf(kdf);
    const base = await C.subtle.importKey('raw', enc.encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return C.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: kdf.iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Every encryption uses a fresh random 96-bit IV. `aad` binds the ciphertext to its context
  // (e.g. the record id) so encrypted records can't be swapped or moved undetected.
  async function encryptBytes(key, bytes, aad) {
    const iv = randomBytes(12);
    const ct = await C.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, bytes);
    return { iv: b64e(iv), ct: b64e(ct) };
  }
  async function decryptBytes(key, box, aad) {
    const pt = await C.subtle.decrypt({ name: 'AES-GCM', iv: b64d(box.iv), additionalData: enc.encode(aad) }, key, b64d(box.ct));
    return new Uint8Array(pt);
  }
  const encryptJSON = (key, obj, aad) => encryptBytes(key, enc.encode(JSON.stringify(obj)), aad);
  async function decryptJSON(key, box, aad) { return JSON.parse(dec.decode(await decryptBytes(key, box, aad))); }

  // ---- Encrypted backup file ------------------------------------------------
  const headerAAD = (h) => 'vaulty|' + h.format + '|' + h.kdf.name + '|' + h.kdf.iterations + '|' + h.salt;

  async function createBackup(password, payload, kdf) {
    kdf = kdf || KDF_DEFAULT;
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, kdf);
    const header = { app: 'vaulty', format: 1, kdf: { name: kdf.name, iterations: kdf.iterations }, salt: b64e(salt), created: new Date().toISOString() };
    const box = await encryptJSON(key, payload, headerAAD(header));
    return Object.assign({}, header, box);
  }

  // Throws BAD_FORMAT for a file that isn't a Vaulty backup, BAD_PASSWORD when the
  // authentication tag fails (wrong password OR modified/corrupted file).
  async function openBackup(password, file) {
    if (!file || typeof file !== 'object' || file.app !== 'vaulty' || file.format !== 1 ||
        typeof file.salt !== 'string' || typeof file.iv !== 'string' || typeof file.ct !== 'string') throw fail('BAD_FORMAT');
    validateKdf(file.kdf);
    let salt;
    try { salt = b64d(file.salt); } catch (e) { throw fail('BAD_FORMAT'); }
    if (salt.length < 16) throw fail('BAD_FORMAT');
    const key = await deriveKey(password, salt, file.kdf);
    try { return await decryptJSON(key, file, headerAAD(file)); } catch (e) { throw fail('BAD_PASSWORD'); }
  }

  return { available, KDF_DEFAULT, MIN_ITER, MAX_ITER, fail, b64e, b64d, randomBytes, validateKdf, deriveKey,
           encryptBytes, decryptBytes, encryptJSON, decryptJSON, createBackup, openBackup };
});
