/* Run with:  node tests/run.js   (Node 18+). No dependencies. */
'use strict';
const assert = require('node:assert/strict');
const VC = require('../js/crypto.js');
const VG = require('../js/generator.js');
const { Vault } = require('../js/vault.js');
const { MemoryStorage } = require('../js/storage.js');

const FAST = { name: 'PBKDF2-SHA256', iterations: VC.MIN_ITER }; // fast for tests; production uses 600k
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const mk = () => new Vault(new MemoryStorage(), { kdf: FAST });
const acct = (o) => Object.assign({ name: 'Site', username: 'u', email: 'u@example.test', password: 'Zq8#kLm2!vXp', url: 'example.test', category: 'other', notes: '' }, o);

test('production KDF parameters', () => {
  assert.equal(VC.KDF_DEFAULT.name, 'PBKDF2-SHA256');
  assert.ok(VC.KDF_DEFAULT.iterations >= 600000);
});

test('create → lock → unlock → data survives', async () => {
  const v = mk();
  await v.create('correct horse battery');
  const a = await v.saveAccount(acct({ name: 'Mail', password: 'secret-1-Abc!' }));
  v.lock();
  assert.equal(v.isUnlocked(), false);
  assert.equal(v.list().length, 0);
  await v.unlock('correct horse battery');
  assert.equal(v.list().length, 1);
  assert.equal(v.accounts.get(a.id).password, 'secret-1-Abc!');
});

test('wrong master password is rejected', async () => {
  const v = mk();
  await v.create('correct horse battery');
  v.lock();
  await assert.rejects(() => v.unlock('wrong password!!'), (e) => e.code === 'BAD_PASSWORD');
  assert.equal(v.isUnlocked(), false);
});

test('nothing readable is stored (no plaintext, no master password)', async () => {
  const st = new MemoryStorage();
  const v = new Vault(st, { kdf: FAST });
  await v.create('master-pass-XYZ-123');
  await v.saveAccount(acct({ name: 'UniqueSiteName', password: 'UniquePw-98765!', notes: 'UniqueNote' }));
  const dump = JSON.stringify({ m: st.meta, r: Array.from(st.records.values()) });
  for (const s of ['UniqueSiteName', 'UniquePw-98765!', 'UniqueNote', 'master-pass-XYZ-123', 'u@example.test']) {
    assert.ok(!dump.includes(s), 'leaked: ' + s);
  }
});

test('each encryption uses a fresh IV', async () => {
  const key = await VC.deriveKey('pw', VC.randomBytes(16), FAST);
  const a = await VC.encryptJSON(key, { x: 1 }, 'ctx');
  const b = await VC.encryptJSON(key, { x: 1 }, 'ctx');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('tampered ciphertext is detected and skipped', async () => {
  const st = new MemoryStorage();
  const v = new Vault(st, { kdf: FAST });
  await v.create('master-pass-123456');
  const a = await v.saveAccount(acct({ name: 'A' }));
  await v.saveAccount(acct({ name: 'B' }));
  const rec = st.records.get(a.id);
  const bytes = VC.b64d(rec.ct); bytes[0] ^= 1; rec.ct = VC.b64e(bytes);
  v.lock();
  await v.unlock('master-pass-123456');
  assert.equal(v.list().length, 1);
  assert.equal(v.corrupt, 1);
});

test('records cannot be swapped between ids (AAD binding)', async () => {
  const st = new MemoryStorage();
  const v = new Vault(st, { kdf: FAST });
  await v.create('master-pass-123456');
  const a = await v.saveAccount(acct({ name: 'A' }));
  const b = await v.saveAccount(acct({ name: 'B' }));
  const ra = st.records.get(a.id), rb = st.records.get(b.id);
  st.records.set(a.id, Object.assign({}, rb, { id: a.id }));
  v.lock();
  await v.unlock('master-pass-123456');
  assert.equal(v.corrupt, 1);
  assert.ok(!v.accounts.has(a.id) && v.accounts.has(b.id));
  assert.ok(ra && rb);
});

test('add / edit / delete / favorite', async () => {
  const v = mk();
  await v.create('master-pass-123456');
  const a = await v.saveAccount(acct({ name: 'Bank', category: 'bank' }));
  const e = await v.saveAccount(Object.assign({}, a, { name: 'Bank 2', favorite: true }));
  assert.equal(e.id, a.id);
  assert.equal(e.createdAt, a.createdAt);
  assert.equal(v.list().length, 1);
  v.lock(); await v.unlock('master-pass-123456');
  assert.equal(v.list()[0].name, 'Bank 2');
  assert.equal(v.list()[0].favorite, true);
  await v.deleteAccount(a.id);
  v.lock(); await v.unlock('master-pass-123456');
  assert.equal(v.list().length, 0);
  await assert.rejects(() => v.saveAccount({ name: '   ' }), (x) => x.code === 'INVALID');
});

test('custom categories; deleting one moves accounts to "other"', async () => {
  const v = mk();
  await v.create('master-pass-123456');
  const c = await v.addCategory('Family');
  const a = await v.saveAccount(acct({ category: c.id }));
  await v.deleteCategory(c.id);
  v.lock(); await v.unlock('master-pass-123456');
  assert.equal(v.categories.length, 0);
  assert.equal(v.accounts.get(a.id).category, 'other');
});

test('change master password re-encrypts everything', async () => {
  const st = new MemoryStorage();
  const v = new Vault(st, { kdf: FAST });
  await v.create('old-master-pass-1');
  await v.saveAccount(acct({ name: 'X', password: 'Pw-for-X-123!' }));
  await v.addCategory('Mine');
  const oldSalt = st.meta.salt;
  await assert.rejects(() => v.changeMaster('not-the-old-one', 'new-master-pass-2'), (e) => e.code === 'BAD_PASSWORD');
  await v.changeMaster('old-master-pass-1', 'new-master-pass-2');
  assert.notEqual(st.meta.salt, oldSalt);
  v.lock();
  await assert.rejects(() => v.unlock('old-master-pass-1'), (e) => e.code === 'BAD_PASSWORD');
  await v.unlock('new-master-pass-2');
  assert.equal(v.list()[0].password, 'Pw-for-X-123!');
  assert.equal(v.categories.length, 1);
  assert.equal(v.corrupt, 0);
});

test('encrypted backup: export → import into a fresh vault', async () => {
  const v1 = mk();
  await v1.create('master-pass-123456');
  const c = await v1.addCategory('Kids');
  await v1.saveAccount(acct({ name: 'One', category: c.id, password: 'P1-xyz-987!' }));
  await v1.saveAccount(acct({ name: 'Two', favorite: true }));
  const file = await VC.createBackup('backup-pass-ABC', v1.exportPayload(), FAST);
  const text = JSON.stringify(file);
  for (const s of ['One', 'Two', 'P1-xyz-987!', 'Kids']) assert.ok(!text.includes(s), 'backup leaks ' + s);

  const v2 = mk();
  await v2.create('another-master-pass');
  const payload = await VC.openBackup('backup-pass-ABC', JSON.parse(text));
  const r = await v2.importPayload(payload);
  assert.deepEqual(r, { added: 2, updated: 0, skipped: 0 });
  assert.equal(v2.categories.length, 1);
  assert.equal(v2.list().find((a) => a.name === 'One').password, 'P1-xyz-987!');
  const again = await v2.importPayload(payload);          // merge is idempotent
  assert.deepEqual(again, { added: 0, updated: 0, skipped: 2 });
});

test('backup integrity: wrong password, tampering, header edits, bad files', async () => {
  const v = mk();
  await v.create('master-pass-123456');
  await v.saveAccount(acct());
  const file = await VC.createBackup('backup-pass-ABC', v.exportPayload(), FAST);
  await assert.rejects(() => VC.openBackup('nope', file), (e) => e.code === 'BAD_PASSWORD');
  const t1 = Object.assign({}, file); const b = VC.b64d(t1.ct); b[3] ^= 1; t1.ct = VC.b64e(b);
  await assert.rejects(() => VC.openBackup('backup-pass-ABC', t1), (e) => e.code === 'BAD_PASSWORD');
  const t2 = JSON.parse(JSON.stringify(file)); t2.kdf.iterations += 1;
  await assert.rejects(() => VC.openBackup('backup-pass-ABC', t2), (e) => e.code === 'BAD_PASSWORD');
  await assert.rejects(() => VC.openBackup('x', { hello: 'world' }), (e) => e.code === 'BAD_FORMAT');
  await assert.rejects(() => VC.openBackup('x', null), (e) => e.code === 'BAD_FORMAT');
  const t3 = JSON.parse(JSON.stringify(file)); t3.kdf.iterations = 1;
  await assert.rejects(() => VC.openBackup('backup-pass-ABC', t3), (e) => e.code === 'BAD_FORMAT');
  await assert.rejects(() => v.importPayload({ accounts: 'nope' }), (e) => e.code === 'BAD_FORMAT');
});

test('import keeps the newer copy and sanitizes junk', async () => {
  const v = mk();
  await v.create('master-pass-123456');
  const a = await v.saveAccount(acct({ name: 'Local' }));
  const r = await v.importPayload({ accounts: [
    Object.assign({}, a, { name: 'Older', updatedAt: a.updatedAt - 1000 }),
    Object.assign({}, a, { name: 'Newer', updatedAt: a.updatedAt + 1000 }),
    { name: '' }, null, 5, { name: 'Odd', category: 'does-not-exist', password: 12345 }
  ] });
  assert.equal(r.updated, 1);
  assert.equal(r.added, 1);
  assert.equal(v.accounts.get(a.id).name, 'Newer');
  const odd = v.list().find((x) => x.name === 'Odd');
  assert.equal(odd.category, 'other');
  assert.equal(odd.password, '');
});

test('wipe removes everything', async () => {
  const st = new MemoryStorage();
  const v = new Vault(st, { kdf: FAST });
  await v.create('master-pass-123456');
  await v.saveAccount(acct());
  await v.wipe();
  assert.equal(await v.exists(), false);
  assert.equal(st.records.size, 0);
});

test('generator: length, character sets, randomness', () => {
  for (let i = 0; i < 300; i++) {
    const p = VG.generate({ length: 12 });
    assert.equal(p.length, 12);
    assert.ok(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p));
  }
  assert.ok(/^[0-9]+$/.test(VG.generate({ length: 20, lower: false, upper: false, symbols: false })));
  assert.ok(!/[0O1lI|`'"]/.test(VG.generate({ length: 64, avoidAmbiguous: true, symbols: false })));
  assert.notEqual(VG.generate({ length: 24 }), VG.generate({ length: 24 }));
  assert.throws(() => VG.generate({ lower: false, upper: false, digits: false, symbols: false }));
  assert.equal(VG.generate({ length: 3 }).length, 4); // never shorter than the number of chosen sets
});

test('generator: unbiased randInt', () => {
  const n = 7, counts = new Array(n).fill(0), N = 70000;
  for (let i = 0; i < N; i++) counts[VG.randInt(n)]++;
  for (const c of counts) assert.ok(Math.abs(c - N / n) < N / n * 0.06, 'biased: ' + counts);
});

test('strength meter', () => {
  assert.equal(VG.strength('').score, 0);
  assert.equal(VG.strength('password').score, 0);
  assert.equal(VG.strength('Password123').score <= 1, true);
  assert.equal(VG.strength('abcdefgh').score <= 1, true);
  assert.equal(VG.strength('aaaaaaaaaaaa').score <= 1, true);
  assert.ok(VG.strength('k7#Qm!x2Lp9$').score >= 3);
  assert.equal(VG.strength(VG.generate({ length: 24 })).score, 4);
});

test('weak / reused detection', () => {
  const r = VG.analyze([
    { id: 'a', password: '123456' }, { id: 'b', password: 'Zq8#kLm2!vXpRt' },
    { id: 'c', password: 'Zq8#kLm2!vXpRt' }, { id: 'd', password: '' }, { id: 'e', password: 'Unique-Strong-9$kQ' }
  ]);
  assert.deepEqual([...r.weak], ['a']);
  assert.deepEqual([...r.reused].sort(), ['b', 'c']);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
  }
  console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
