"""End-to-end test in real Chromium.  Run:  python3 tests/e2e.py
Needs: pip install playwright && playwright install chromium   (dev-only; the app itself needs nothing)."""
import http.server, threading, functools, os, sys, json, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
SHOTS = os.environ.get('SHOTS')

MASTER = 'Test-Master-Pass-42!'
results, errors = [], []

def check(name, cond):
    results.append((name, bool(cond)))
    print(('  ok   ' if cond else '  FAIL ') + name)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 800}, accept_downloads=True, locale='ar')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rsplit('/', 1)[0])
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL)
    pg.wait_for_selector('.lock-card')
    check('lock screen shown, RTL Arabic', pg.get_attribute('html', 'dir') == 'rtl')
    if SHOTS: pg.screenshot(path=SHOTS + '/01-setup.png')

    # --- setup validation
    pw = pg.locator('.lock-card input').nth(0); pw2 = pg.locator('.lock-card input').nth(1)
    pw.fill('short'); pw2.fill('short'); pg.click('.lock-card .btn.primary')
    check('short master rejected', pg.locator('.lock-card .error').inner_text().strip() != '')
    pw.fill(MASTER); pw2.fill('different-one-123'); pg.click('.lock-card .btn.primary')
    check('mismatch rejected', pg.locator('.lock-card .error').inner_text().strip() != '')
    pw2.fill(MASTER); pg.click('.lock-card .btn.primary')
    pg.wait_for_selector('.empty', timeout=15000)
    check('vault created, empty state', True)

    # --- add accounts
    def add(name, user, email, password, url, cat='other', notes=''):
        pg.click('.fab')
        f = pg.locator('.modal .form')
        f.locator('input').nth(0).fill(name)
        f.locator('input').nth(1).fill(user)
        f.locator('input').nth(2).fill(email)
        f.locator('.pwwrap input').fill(password)
        f.locator('input').nth(4).fill(url)
        f.locator('select').select_option(cat)
        f.locator('textarea').fill(notes)
        pg.click('.modal-foot .btn.primary')
        pg.wait_for_selector('.modal', state='detached')
    add('GitHub', 'octo', 'octo@example.test', 'Zq8#kLm2!vXpRt', 'github.com', 'work', 'سر <b>x</b>')
    add('Gmail', 'me', 'me@example.test', '123456', 'mail.example.test', 'email')
    add('Shop', 'me2', 'me2@example.test', 'Zq8#kLm2!vXpRt', '', 'shopping')
    check('3 accounts listed', pg.locator('.card').count() == 3)
    check('dashboard count = 3', pg.locator('.tile').first.locator('strong').inner_text() == '3')
    check('weak count = 1 (123456)', pg.locator('.tile').nth(2).locator('strong').inner_text() == '1')
    check('reused count = 2', pg.locator('.tile').nth(3).locator('strong').inner_text() == '2')
    check('weak badge shown', pg.locator('.badge.warn').count() >= 1)
    if SHOTS: pg.screenshot(path=SHOTS + '/02-home.png')

    # --- password hidden by default; reveal; hide all
    check('passwords masked by default', 'Zq8#' not in pg.locator('.cards').inner_text())
    pg.locator('.card', has_text='GitHub').locator('.pw-row .iconbtn').click()
    check('reveal works', 'Zq8#kLm2!vXpRt' in pg.locator('.card', has_text='GitHub').inner_text())
    pg.click('.top-actions .iconbtn >> nth=0')
    check('hide-all works', 'Zq8#' not in pg.locator('.cards').inner_text())

    # --- search
    pg.fill('.input.search', 'octo@')
    check('search by email', pg.locator('.card').count() == 1)
    pg.fill('.input.search', 'gmail')
    check('search by name', pg.locator('.card').count() == 1)
    pg.fill('.input.search', 'zzzz'); check('no results message', pg.locator('.empty-line').count() == 1)
    pg.fill('.input.search', '')

    # --- copy + clipboard auto clear (set to 10s in settings later; here check content)
    pg.locator('.card', has_text='GitHub').get_by_role('button', name='نسخ كلمة المرور').click()
    check('copy password → clipboard', pg.evaluate('navigator.clipboard.readText()') == 'Zq8#kLm2!vXpRt')

    # --- favorite, filter
    pg.locator('.card', has_text='Shop').locator('.iconbtn.fav').click()
    pg.locator('.tile').nth(1).click()
    check('favorites filter', pg.locator('.card').count() == 1)
    pg.locator('.tile').nth(1).click()
    check('favorite sorted first', 'Shop' in pg.locator('.card').first.inner_text())

    # --- XSS safety: notes with HTML shown only in edit as text
    pg.locator('.card', has_text='GitHub').locator('.iconbtn[aria-label="تعديل"]').click()
    check('notes kept as text', pg.locator('.modal textarea').input_value() == 'سر <b>x</b>')
    pg.locator('.modal .form input').nth(0).fill('GitHub Pro')
    pg.click('.modal-foot .btn.primary'); pg.wait_for_selector('.modal', state='detached')
    check('edit saved', pg.locator('.card', has_text='GitHub Pro').count() == 1)

    # --- generator
    pg.click('.tab >> nth=1')
    pg.wait_for_selector('.gen-out')
    g1 = pg.locator('.gen-out').inner_text()
    check('generator length 20', len(g1) == 20)
    pg.locator('.range').fill('32')
    check('generator length slider', len(pg.locator('.gen-out').inner_text()) == 32)
    for i in range(3): pg.locator('.check input').nth(i).uncheck()   # only symbols left
    check('only symbols', all(not c.isalnum() for c in pg.locator('.gen-out').inner_text()))
    pg.locator('.check input').nth(3).uncheck()
    check('none selected → message', pg.locator('.gen .error').inner_text().strip() != '')
    if SHOTS: pg.screenshot(path=SHOTS + '/03-generator.png')

    # --- settings: language/theme/categories
    pg.click('.tab >> nth=2'); pg.wait_for_selector('.setrow')
    pg.locator('.panel').nth(2).locator('input').fill('عائلة'); pg.locator('.panel').nth(2).get_by_role('button').click()
    pg.wait_for_selector('.catlist')
    check('custom category added', pg.locator('.catlist li').count() == 1)
    pg.locator('.panel').nth(0).locator('select').nth(0).select_option('dark')
    check('dark theme applied', pg.get_attribute('html', 'data-theme') == 'dark')
    if SHOTS: pg.screenshot(path=SHOTS + '/04-settings-dark.png')
    pg.locator('.panel').nth(0).locator('select').nth(1).select_option('en')
    check('switch to English LTR', pg.get_attribute('html', 'dir') == 'ltr')

    # --- backup export / wrong password import / import
    pg.locator('.panel').nth(3).get_by_role('button').nth(0).click()
    ins = pg.locator('.modal input')
    ins.nth(0).fill('Backup-Pass-777!'); ins.nth(1).fill('Backup-Pass-777!')
    with pg.expect_download() as dl:
        pg.click('.modal-foot .btn.primary')
    path = os.path.join(tempfile.gettempdir(), 'vaulty-test.vaulty'); dl.value.save_as(path)
    txt = open(path, encoding='utf-8').read()
    check('backup is JSON w/o plaintext', all(s not in txt for s in ['GitHub', 'octo', 'Zq8#', 'example.test']) and json.loads(txt)['app'] == 'vaulty')
    pg.wait_for_selector('.modal', state='detached')

    # --- lock manually, wrong pw, right pw
    pg.click('.top-actions .mobile-only')
    pg.wait_for_selector('.lock-card')
    pg.fill('.lock-card input', 'wrong-password-xx'); pg.click('.lock-card .btn.primary')
    pg.wait_for_selector('.lock-card .error:not(:empty)', timeout=15000)
    check('wrong master rejected', True)
    pg.fill('.lock-card input', MASTER); pg.click('.lock-card .btn.primary')
    pg.wait_for_selector('.card', timeout=15000)
    check('unlock restores data (persisted encrypted)', pg.locator('.card').count() == 3)

    # --- IndexedDB holds no plaintext
    dump = pg.evaluate("""() => new Promise(res => { const r = indexedDB.open('vaulty'); r.onsuccess = () => { const db = r.result;
      const tx = db.transaction(['meta','records']); const a = tx.objectStore('records').getAll(), m = tx.objectStore('meta').getAll();
      tx.oncomplete = () => res(JSON.stringify([m.result, a.result])); }; })""")
    check('IndexedDB has no plaintext', all(s not in dump for s in ['GitHub', 'octo', 'Zq8#', MASTER, 'example.test']))

    # --- reload → locked, data survives
    pg.reload(); pg.wait_for_selector('.lock-card')
    check('reload requires master password', pg.locator('.lock-card input').count() == 1)
    pg.fill('.lock-card input', MASTER); pg.click('.lock-card .btn.primary'); pg.wait_for_selector('.card', timeout=15000)

    # --- change master password
    pg.click('.tab >> nth=2'); pg.wait_for_selector('.setrow')
    pg.locator('.panel').nth(1).get_by_role('button').click()
    ins = pg.locator('.modal input')
    ins.nth(0).fill(MASTER); ins.nth(1).fill('New-Master-Pass-99$'); ins.nth(2).fill('New-Master-Pass-99$')
    pg.click('.modal-foot .btn.primary'); pg.wait_for_selector('.modal', state='detached', timeout=15000)
    pg.click('.top-actions .mobile-only'); pg.wait_for_selector('.lock-card')
    pg.fill('.lock-card input', MASTER); pg.click('.lock-card .btn.primary')
    pg.wait_for_selector('.lock-card .error:not(:empty)', timeout=15000)
    check('old master no longer works', True)
    pg.fill('.lock-card input', 'New-Master-Pass-99$'); pg.click('.lock-card .btn.primary')
    pg.wait_for_selector('.card', timeout=15000)
    check('new master works, 3 accounts intact', pg.locator('.card').count() == 3)

    # --- delete an account, then restore from backup (merge brings it back)
    pg.locator('.card', has_text='Shop').locator('.iconbtn.danger-text').click()
    pg.locator('.modal-foot .btn.danger-fill').click(); pg.wait_for_selector('.modal', state='detached')
    pg.wait_for_function('1') if False else None
    pg.locator('.card').nth(2).wait_for(state='detached', timeout=5000)
    check('delete works', pg.locator('.card').count() == 2)
    pg.click('.tab >> nth=2'); pg.wait_for_selector('.setrow')
    pg.locator('.panel').nth(3).get_by_role('button').nth(1).click()
    pg.set_input_files('.modal input[type=file]', path)
    pg.locator('.modal .pwwrap input').fill('wrong-backup-pass')
    pg.click('.modal-foot .btn.primary')
    pg.wait_for_selector('.modal .error:not(:empty)', timeout=15000)
    check('import with wrong password rejected', True)
    pg.locator('.modal .pwwrap input').fill('Backup-Pass-777!')
    pg.click('.modal-foot .btn.primary'); pg.wait_for_selector('.modal', state='detached', timeout=15000)
    pg.click('.tab >> nth=0'); pg.wait_for_selector('.card')
    check('restore brought deleted account back', pg.locator('.card').count() == 3)
    bad = os.path.join(tempfile.gettempdir(), 'bad.vaulty'); open(bad, 'w').write('{"app":"vaulty","format":1}')
    pg.click('.tab >> nth=2'); pg.wait_for_selector('.setrow')
    pg.locator('.panel').nth(3).get_by_role('button').nth(1).click()
    pg.set_input_files('.modal input[type=file]', bad); pg.locator('.modal .pwwrap input').fill('x')
    pg.click('.modal-foot .btn.primary')
    pg.wait_for_selector('.modal .error:not(:empty)', timeout=15000)
    check('malformed backup rejected', True)
    pg.keyboard.press('Escape')

    # --- desktop layout screenshot
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.click('.railbtn >> nth=0')
    pg.wait_for_selector('.card')
    check('desktop shows sidebar', pg.locator('.rail').is_visible() and not pg.locator('.tabbar').is_visible())
    if SHOTS: pg.screenshot(path=SHOTS + '/05-desktop.png')
    pg.set_viewport_size({'width': 390, 'height': 800})

    # --- auto-lock (simulate idle by rewinding the activity clock via short setting + fake time)
    pg.click('.tab >> nth=2'); pg.wait_for_selector('.setrow')
    pg.locator('.panel').nth(1).locator('select').nth(0).select_option('1')
    pg.evaluate("""() => { const real = Date.now; Date.now = () => real() + 61000; }""")
    pg.wait_for_selector('.lock-card', timeout=5000)
    check('auto-lock after inactivity', True)

    b.close()

srv.shutdown()
bad = [n for n, ok in results if not ok]
real_errors = [e for e in errors if 'favicon' not in e]
print('\n%d/%d passed' % (len(results) - len(bad), len(results)))
if real_errors: print('JS ERRORS:', *real_errors, sep='\n  ')
sys.exit(1 if bad or real_errors else 0)
