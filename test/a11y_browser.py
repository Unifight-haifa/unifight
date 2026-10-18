"""axe-core WCAG 2.1 A/AA scan in a real browser, run by test/a11y.test.mjs: python3 a11y_browser.py BASE_URL"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1]
# vendored and pinned so the scan is offline and repeatable; .txt keeps node --test from running it
AXE = Path(__file__).with_name("vendor") / "axe-core" / "axe.min.js.txt"
PAGES = ("", "news/", "video/", "gallery/", "privacy/", "accessibility/", "history/", "achievements/", "tournaments/", "tournaments/north-2022/", "nivheret/")
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

bad = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (360, 1280):
        for lang in ("he", "ru"):
            for path in PAGES:
                page = browser.new_page(viewport={"width": width, "height": 800})
                page.goto(f"{base}{lang}/{path}", wait_until="networkidle")
                page.add_script_tag(path=str(AXE))
                assert page.evaluate("axe.version") == "4.10.3"
                res = page.evaluate("t => axe.run(document, {runOnly: {type: 'tag', values: t}})", TAGS)
                for v in res["violations"]:
                    if v["impact"] in ("serious", "critical"):
                        bad.append(f"{lang}/{path}@{width}: {v['id']} {[n['target'] for n in v['nodes'][:3]]}")
                if path == "" and width == 360:
                    # Esc must close the menu and hand focus back to its button
                    page.keyboard.press("Tab")
                    page.focus(".menu summary")
                    page.keyboard.press("Enter")
                    page.keyboard.press("Escape")
                    assert not page.evaluate("document.querySelector('.menu').open"), f"{lang}: Esc left the menu open"
                    assert page.evaluate("document.activeElement.matches('.menu summary')"), lang
                    # the pause button stops every endless animation (WCAG 2.2.2)
                    page.click(".tk-pause")
                    looping = page.evaluate("document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length")
                    assert looping == 0, f"{lang}: {looping} animations still running after pause"
                if lang == "he":
                    # kanji and the logo keep their drawn orientation in RTL, ancestors included
                    flipped = page.evaluate("""[...document.querySelectorAll('.kg, .plate img, .st-center img')].filter(e => {
                      for (let n = e; n; n = n.parentElement) {
                        const cs = getComputedStyle(n);
                        if (new DOMMatrix(cs.transform).a < 0 || parseFloat(cs.scale) < 0) return true;
                      }
                    }).length""")
                    assert flipped == 0, f"{path}@{width}: {flipped} kanji/logo mirrored"
                if path == "gallery/":
                    # the open lightbox is scanned too; Esc closes it and focus returns to the photo
                    page.click("a[data-gal-item]")
                    res = page.evaluate("t => axe.run(document, {runOnly: {type: 'tag', values: t}})", TAGS)
                    bad += [f"{lang}/{path}@{width} lightbox: {v['id']}" for v in res["violations"] if v["impact"] in ("serious", "critical")]
                    page.keyboard.press("Escape")
                    assert page.evaluate("document.activeElement.matches('a[data-gal-item]')"), f"{lang}: focus lost after the lightbox"
                page.close()
    browser.close()
assert not bad, "\n".join(bad)
print("ok")
