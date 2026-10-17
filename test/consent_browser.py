"""Real-browser consent check, run by test/analytics.test.mjs: python3 consent_browser.py BASE_URL GA_ID"""
import re
import sys
from playwright.sync_api import sync_playwright

base, ga_id = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    browser = p.chromium.launch()
    for lang in ("he", "ru", "en"):
        page = browser.new_page(viewport={"width": 360, "height": 740})
        seen = []
        # record, then abort: tests must never send hits to the real property
        page.route(re.compile(r"googletagmanager\.com|google-analytics\.com"), lambda r: (seen.append(r.request.url), r.abort()))
        page.goto(f"{base}{lang}/")
        page.wait_for_timeout(500)
        assert page.locator("[data-consent]").is_visible(), lang
        assert seen == [], f"{lang}: requested before consent: {seen}"
        page.click('[data-consent-choice="denied"]')
        page.reload()
        page.wait_for_timeout(500)
        assert seen == [], f"{lang}: requested after Decline: {seen}"
        page.click(".consent-open")
        page.click('[data-consent-choice="granted"]')
        page.wait_for_timeout(500)
        assert seen == [f"https://www.googletagmanager.com/gtag/js?id={ga_id}"], f"{lang}: {seen}"
        page.close()
    browser.close()
print("ok")
