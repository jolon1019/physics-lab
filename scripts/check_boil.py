# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1600, 'height': 900})
    ctx.route('**/api/settings', lambda route: route.fulfill(
        content_type='application/json', body='{"paidExperiments": []}'))
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text[:150]) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto('http://localhost:5173/experiment/e-boil', wait_until='domcontentloaded')
    page.wait_for_timeout(1500)

    rig = page.locator('.bf-rig-main svg').count()
    lamp = page.locator('.melt-burner').count()
    print(f'ready: beaker svg={rig}, lamp={lamp} (expect 1, 1)', flush=True)
    page.screenshot(path='boil_ready.png')

    # 运行：13s 屏显 × 1.5 速率 ≈ 8.7s 实际；加热段 = heatTime/1.5
    page.locator('.lab-actions button', has_text='开始加热').first.click()
    page.wait_for_timeout(2500)
    page.locator('.lab-actions button', has_text='放大观察').first.click()
    page.wait_for_timeout(500)
    page.screenshot(path='boil_heating.png')
    page.wait_for_timeout(5000)
    page.screenshot(path='boil_boiling.png')
    page.wait_for_timeout(4000)
    page.screenshot(path='boil_done.png')
    hint = page.locator('.feedback').first.inner_text()
    print('done hint:', hint[:50], flush=True)

    # 改海拔看沸点联动
    page.locator('.lab-actions button', has_text='重置').first.click()
    page.evaluate("""() => {
      const s = document.querySelector('.lab-right input[type=range]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(s, 3000);
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }""")
    page.wait_for_timeout(500)
    page.screenshot(path='boil_altitude.png')
    print('console errors:', errors[:5] if errors else 'none', flush=True)
    browser.close()
