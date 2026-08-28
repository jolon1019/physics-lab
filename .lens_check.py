# -*- coding: utf-8 -*-
"""复现 e-lens-camera 移动端布局问题"""
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    page.goto("http://localhost:5173/experiment/e-lens-camera")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)
    d = page.evaluate("""
    () => {
      const cont = document.querySelector('.lab-container');
      const panel = cont.closest('.lab-panel');
      const left = document.querySelector('.lab-left');
      const cs = getComputedStyle(cont);
      const lcs = getComputedStyle(left);
      const cr = cont.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      // 容器内绝对定位子元素是否超出容器底
      let overflowKids = [];
      cont.querySelectorAll(':scope > *').forEach(k => {
        const kr = k.getBoundingClientRect();
        if (kr.bottom > cr.bottom + 2) overflowKids.push(k.className.toString().split(' ')[0] + ' b+' + Math.round(kr.bottom - cr.bottom));
      });
      return {
        container: { w: Math.round(cr.width), h: Math.round(cr.height), top: Math.round(cr.top) },
        containerCSS: { h: cs.height, minH: cs.minHeight, maxH: cs.maxHeight, display: cs.display, pos: cs.position },
        panel: { w: Math.round(pr.width), h: Math.round(pr.height) },
        labLeft: { h: Math.round(left.getBoundingClientRect().height), maxH: lcs.maxHeight, ov: lcs.overflow },
        overflowKids: overflowKids.slice(0, 8),
        viewport: innerHeight
      };
    }
    """)
    print(json.dumps(d, ensure_ascii=False, indent=1))
    page.screenshot(path="D:/project/physics-lab/.lens_check.png", full_page=False)
    print("shot saved")
    browser.close()
