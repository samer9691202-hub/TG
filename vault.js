/* Vaulty – vault core. Encrypts every record (AES-256-GCM) before it reaches storage.
 * The master password is never stored; only a salt, KDF parameters and an encrypted
 * verifier are kept. UMD: window.VaultyVault / module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crypto.js'));
  else root.VaultyVault = factory(root.VaultyCrypto);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (VC) {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const VERIFY_TEXT = 'vaulty-verify-v1';
  const BUILTIN = ['email', 'social', 'bank', 'shopping', 'work', 'games', 'services', 'other'];
  const FIELDS = ['name', 'username', 'email', 'password', 'url', 'category', 'notes'];
  const MAXLEN = { name: 200, username: 200, email: 254, password: 1024, url: 2048, category: 64, notes: 10000 };
  const MAX_ACCOUNTS = 20000;

  const fail = VC.fail;
  const newId = () => Array.from(VC.randomBytes(12), (b) => b.toString(16).padStart(2, '0')).join('');

  function cleanAccount(a) {
    if (!a || typeof a !== 'object') return null;
    const o = {};
    for (const f of FIELDS) o[f] = typeof a[f] === 'string' ? a[f].slice(0, MAXLEN[f]) : '';
    if (!o.name.trim()) return null;
    o.id = typeof a.id === 'string' && /^[a-z0-9_-]{8,64}$/i.test(a.id) ? a.id : newId();
    o.favorite = !!a.favorite;
    const now = Date.now();
    o.createdAt = Number.isFinite(a.createdAt) ? a.createdAt : now;
    o.updatedAt = Number.isFinite(a.updatedAt) ? a.updatedAt : o.createdAt;
    if (!o.category) o.category = 'other';
    return o;
  }

  function cleanCategory(c) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string') return null;
    const name = c.name.trim().slice(0, 40);
    if (!name) return null;
    const id = typeof c.id === 'string' && /^c_[a-z0-9]{6,32}$/.test(c.id) ? c.id : 'c_' + newId().slice(0, 12);
    return { id, name };
  }

  class Vault {
    constructor(storage, opts) {
      this.storage = storage;
      this.kdf = (opts && opts.kdf) || VC.KDF_DEFAULT;
      this.key = null;
      this.meta = null;
      this.accounts = new Map();
      this.categories = [];
      this.corrupt = 0;
    }

    isUnlocked() { return !!this.key; }
    async exists() { return !!(await this.storage.getMeta()); }

    async create(master) {
      if (await this.exists()) throw fail('EXISTS');
      const salt = VC.randomBytes(16);
      const key = await VC.deriveKey(master, salt, this.kdf);
      const verifier = await VC.encryptBytes(key, enc.encode(VERIFY_TEXT), 'verifier');
      const meta = { version: 1, kdf: { name: this.kdf.name, iterations: this.kdf.iterations }, salt: VC.b64e(salt), verifier, created: Date.now() };
      await this.storage.setMeta(meta);
      this.key = key; this.meta = meta; this.accounts = new Map(); this.categories = []; this.corrupt = 0;
    }

    async _derive(master, meta) {
      VC.validateKdf(meta.kdf);
      const key = await VC.deriveKey(master, VC.b64d(meta.salt), meta.kdf);
      try {
        const p = await VC.decryptBytes(key, meta.verifier, 'verifier');
        if (dec.decode(p) !== VERIFY_TEXT) throw new Error('x');
      } catch (e) { throw fail('BAD_PASSWORD'); }
      return key;
    }

    async verify(master) {
      try { await this._derive(master, this.meta || (await this.storage.getMeta())); return true; }
      catch (e) { if (e.code === 'BAD_PASSWORD') return false; throw e; }
    }

    async unlock(master) {
      const meta = await this.storage.getMeta();
      if (!meta) throw fail('NO_VAULT');
      const key = await this._derive(master, meta);
      const accounts = new Map();
      let categories = [];
      let corrupt = 0;
      for (const rec of await this.storage.getRecords()) {
        try {
          if (rec.kind === 'acc') {
            const a = cleanAccount(await VC.decryptJSON(key, rec, 'acc:' + rec.id));
            if (a && a.id === rec.id) accounts.set(a.id, a); else corrupt++;
          } else if (rec.kind === 'cats') {
            const o = await VC.decryptJSON(key, rec, 'cats');
            categories = Array.isArray(o) ? o.map(cleanCategory).filter(Boolean) : [];
          }
        } catch (e) { corrupt++; }
      }
      this.key = key; this.meta = meta; this.accounts = accounts; this.categories = categories; this.corrupt = corrupt;
    }

    lock() { this.key = null; this.meta = null; this.accounts = new Map(); this.categories = []; this.corrupt = 0; }

    list() { return Array.from(this.accounts.values()); }

    _need() { if (!this.key) throw fail('LOCKED'); }

    async _putAccount(acc) {
      const box = await VC.encryptJSON(this.key, acc, 'acc:' + acc.id);
      await this.storage.putRecord({ id: acc.id, kind: 'acc', iv: box.iv, ct: box.ct });
      this.accounts.set(acc.id, acc);
    }

    async saveAccount(input) {
      this._need();
      const a = cleanAccount(input);
      if (!a) throw fail('INVALID');
      const prev = this.accounts.get(a.id);
      a.createdAt = prev ? prev.createdAt : (Number.isFinite(input.createdAt) ? input.createdAt : Date.now());
      a.updatedAt = Date.now();
      await this._putAccount(a);
      return a;
    }

    async deleteAccount(id) {
      this._need();
      await this.storage.deleteRecord(id);
      this.accounts.delete(id);
    }

    async _saveCategories() {
      const box = await VC.encryptJSON(this.key, this.categories, 'cats');
      await this.storage.putRecord({ id: '__categories', kind: 'cats', iv: box.iv, ct: box.ct });
    }

    async addCategory(name) {
      this._need();
      const c = cleanCategory({ name });
      if (!c) throw fail('INVALID');
      this.categories.push(c);
      await this._saveCategories();
      return c;
    }

    async deleteCategory(id) {
      this._need();
      this.categories = this.categories.filter((c) => c.id !== id);
      await this._saveCategories();
      for (const a of this.accounts.values()) {
        if (a.category === id) await this._putAccount(Object.assign({}, a, { category: 'other', updatedAt: Date.now() }));
      }
    }

    // Re-encrypts everything under a new salt + key in ONE atomic storage transaction.
    async changeMaster(oldPw, newPw) {
      this._need();
      if (!(await this.verify(oldPw))) throw fail('BAD_PASSWORD');
      const salt = VC.randomBytes(16);
      const key = await VC.deriveKey(newPw, salt, this.kdf);
      const verifier = await VC.encryptBytes(key, enc.encode(VERIFY_TEXT), 'verifier');
      const meta = { version: 1, kdf: { name: this.kdf.name, iterations: this.kdf.iterations }, salt: VC.b64e(salt), verifier, created: this.meta.created };
      const records = [];
      for (const a of this.accounts.values()) {
        const box = await VC.encryptJSON(key, a, 'acc:' + a.id);
        records.push({ id: a.id, kind: 'acc', iv: box.iv, ct: box.ct });
      }
      const cb = await VC.encryptJSON(key, this.categories, 'cats');
      records.push({ id: '__categories', kind: 'cats', iv: cb.iv, ct: cb.ct });
      await this.storage.replaceAll(meta, records);
      this.key = key; this.meta = meta;
    }

    exportPayload() {
      this._need();
      return { version: 1, exportedAt: new Date().toISOString(), accounts: this.list(), categories: this.categories.slice() };
    }

    // Merges a (already decrypted) backup payload. Nothing existing is deleted;
    // a record is only replaced when the imported copy is newer.
    async importPayload(payload) {
      this._need();
      if (!payload || !Array.isArray(payload.accounts) || payload.accounts.length > MAX_ACCOUNTS) throw fail('BAD_FORMAT');
      let added = 0, updated = 0, skipped = 0;
      if (Array.isArray(payload.categories)) {
        for (const raw of payload.categories) {
          const c = cleanCategory(raw);
          if (c && !this.categories.some((x) => x.id === c.id)) this.categories.push(c);
        }
        await this._saveCategories();
      }
      const known = new Set(BUILTIN.concat(this.categories.map((c) => c.id)));
      for (const raw of payload.accounts) {
        const a = cleanAccount(raw);
        if (!a) { skipped++; continue; }
        if (!known.has(a.category)) a.category = 'other';
        const cur = this.accounts.get(a.id);
        if (!cur) { await this._putAccount(a); added++; }
        else if (a.updatedAt > cur.updatedAt) { await this._putAccount(a); updated++; }
        else skipped++;
      }
      return { added, updated, skipped };
    }

    async wipe() {
      await this.storage.wipe();
      this.lock();
    }
  }

  return { Vault, cleanAccount, cleanCategory, BUILTIN };
});
