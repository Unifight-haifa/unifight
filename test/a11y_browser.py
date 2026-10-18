"""axe-core WCAG 2.1 A/AA scan in a real browser, run by test/a11y.test.mjs: python3 a11y_browser.py BASE_URL"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1]
# vendored and pinned so the scan is offline and repeatable; .txt keeps node --test from running it
AXE = Path(__file__).with_name("vendor") / "axe-core" / "axe.min.js.txt"
PAGES = ("", "news/", "video/", "gallery/", "privacy/", "accessibility/", "history/", "achievements/", "tournaments/", "tournaments/north-2022/", "nivheret/", "contact/", "belts/", "techniques/")
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
                    # the film loop starts in view and has its own pause button
                    page.evaluate("document.querySelector('.film-v').scrollIntoView({block: 'center'})")
                    page.wait_for_function("!document.querySelector('.film-v').paused")
                    page.click(".film-pause")
                    assert page.evaluate("document.querySelector('.film-v').paused"), f"{lang}: film still playing after pause"
                if path == "news/" and width == 1280:
                    # the news rail has its own pause control (WCAG 2.2.2)
                    page.click(".nr-pause")
                    assert page.evaluate("document.querySelector('.nr-track').getAnimations().every(a => a.playState === 'paused')"), f"{lang}: news rail still moving"
                    assert page.get_attribute(".nr-pause", "aria-pressed") == "true", lang
                if path == "news/" and width == 360:
                    # the mobile news pill is a disclosure; scan it open. It waits for the cookie banner
                    if page.is_visible("[data-consent]"):
                        page.click("[data-consent-choice=denied]")
                    page.focus(".nr-m summary")
                    page.keyboard.press("Enter")
                    assert page.evaluate("document.querySelector('.nr-m').open"), f"{lang}: news pill did not open"
                    res = page.evaluate("t => axe.run(document, {runOnly: {type: 'tag', values: t}})", TAGS)
                    bad += [f"{lang}/{path}@{width} news pill: {v['id']}" for v in res["violations"] if v["impact"] in ("serious", "critical")]
                if lang == "he":
                    # kanji and the logo keep their drawn orientation in RTL, ancestors included
                    flipped = page.evaluate("""[...document.querySelectorAll('.kg, .plate img, .st-center img')].filter(e => {
                      for (let n = e; n; n = n.parentElement) {
                        const cs = getComputedStyle(n);
                        if (new DOMMatrix(cs.transform).a < 0 || parseFloat(cs.scale) < 0) return true;
                      }
                    }).length""")
                    assert flipped == 0, f"{path}@{width}: {flipped} kanji/logo mirrored"
                if path == "techniques/" and width == 360:
                    # search folds every script; filters work from the keyboard and land in the URL
                    if page.is_visible("[data-consent]"):
                        page.click("[data-consent-choice=denied]")
                    for q in ("seoi", "сэой", "סאוי", "背負"):
                        page.fill(".tq-q input", q)
                        assert page.is_visible("#seoi-nage"), f"{lang}: {q} did not find seoi-nage"
                    page.fill(".tq-q input", "")
                    page.focus("[data-f=t][data-v=brown]")
                    page.keyboard.press("Enter")
                    page.focus("a[data-f=g][data-v=koshi]")
                    page.keyboard.press(" ")
                    assert page.get_attribute("a[data-f=g][data-v=koshi]", "aria-pressed") == "true", lang
                    assert page.evaluate("document.querySelectorAll('.tq-card:not([hidden])').length") == 4, lang
                    assert "g=koshi" in page.url and "t=brown" in page.url, page.url
                    res = page.evaluate("t => axe.run(document, {runOnly: {type: 'tag', values: t}})", TAGS)
                    bad += [f"{lang}/{path}@{width} filtered: {v['id']}" for v in res["violations"] if v["impact"] in ("serious", "critical")]
                    # the player opens on the card's link and gives focus back on Esc
                    page.click("#o-goshi a[data-video]")
                    res = page.evaluate("t => axe.run(document, {runOnly: {type: 'tag', values: t}, iframes: false})", TAGS)
                    bad += [f"{lang}/{path}@{width} player: {v['id']}" for v in res["violations"] if v["impact"] in ("serious", "critical")]
                    page.keyboard.press("Escape")
                    assert page.evaluate("document.activeElement.matches('#o-goshi a[data-video]')"), f"{lang}: focus lost after the player"
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
