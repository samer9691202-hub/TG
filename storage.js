/* Vaulty – storage backends. Only ciphertext and non-secret metadata are ever stored.
 * IDBStorage → IndexedDB (browser). MemoryStorage → tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.VaultyStorage = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  class MemoryStorage {
    constructor() { this.meta = null; this.records = new Map(); }
    async getMeta() { return this.meta ? JSON.parse(JSON.stringify(this.meta)) : null; }
    async setMeta(m) { this.meta = JSON.parse(JSON.stringify(m)); }
    async getRecords() { return Array.from(this.records.values(), (r) => Object.assign({}, r)); }
    async putRecord(r) { this.records.set(r.id, Object.assign({}, r)); }
    async deleteRecord(id) { this.records.delete(id); }
    async replaceAll(meta, recs) {
      this.meta = JSON.parse(JSON.stringify(meta));
      this.records = new Map(recs.map((r) => [r.id, Object.assign({}, r)]));
    }
    async wipe() { this.meta = null; this.records = new Map(); }
  }

  class IDBStorage {
    constructor(name) { this.name = name || 'vaulty'; this._open = null; }

    _db() {
      if (!this._open) {
        this._open = new Promise((resolve, reject) => {
          const req = root.indexedDB.open(this.name, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            db.createObjectStore('meta', { keyPath: 'k' });
            db.createObjectStore('records', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('DB_BLOCKED'));
        });
      }
      return this._open;
    }

    // Runs fn(tx) inside one transaction; resolves after the transaction commits.
    async _tx(stores, mode, fn) {
      const db = await this._db();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let out;
        tx.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('TX_ABORTED'));
        out = fn(tx);
      });
    }

    async getMeta() { const r = await this._tx('meta', 'readonly', (tx) => tx.objectStore('meta').get('main')); return r ? r.v : null; }
    setMeta(m) { return this._tx('meta', 'readwrite', (tx) => { tx.objectStore('meta').put({ k: 'main', v: m }); }); }
    getRecords() { return this._tx('records', 'readonly', (tx) => tx.objectStore('records').getAll()); }
    putRecord(r) { return this._tx('records', 'readwrite', (tx) => { tx.objectStore('records').put(r); }); }
    deleteRecord(id) { return this._tx('records', 'readwrite', (tx) => { tx.objectStore('records').delete(id); }); }
    replaceAll(meta, recs) {
      return this._tx(['meta', 'records'], 'readwrite', (tx) => {
        const rs = tx.objectStore('records');
        rs.clear();
        recs.forEach((r) => rs.put(r));
        tx.objectStore('meta').put({ k: 'main', v: meta });
      });
    }
    wipe() {
      return this._tx(['meta', 'records'], 'readwrite', (tx) => {
        tx.objectStore('meta').clear();
        tx.objectStore('records').clear();
      });
    }
  }

  return { MemoryStorage, IDBStorage };
});
