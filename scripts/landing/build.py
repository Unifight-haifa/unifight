#!/usr/bin/env python3
"""Builds the landing page from content/*.json.

Default: writes src/generated/*, src/styles/landing.css for the Astro site.
--preview DIR: also writes a single-file preview (images resolve against public/).
"""
import html, json, re, sys, urllib.parse
from pathlib import Path
from PIL import Image

R = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
PUB = R / "public"


def load(name):
    return json.loads((R / "content" / name).read_text())


C, CO, VENUES = load("site.json"), load("coaches/_section.json"), load("venues.json")
COACHES = sorted((load(f"coaches/{p.name}") for p in (R / "content/coaches").glob("[!_]*.json")), key=lambda c: c["order"])
SC = load("schedule/natanel-zhurovel.json")  # days, grade letters, slogan and values are shared
# schedule id = coach id; coaches' order on the site
SCHEDS = {c["id"]: load(f"schedule/{c['id']}.json") for c in COACHES if (R / f"content/schedule/{c['id']}.json").exists()}
VIDEOS = {v["id"]: v for v in load("videos.json")}
LANGS = ("he", "ru", "en")
WA = "https://wa.me/972545664663"
WA_NUM = "054-566-4663"
USED = []  # local asset paths, in order of first use
PHOTO_ALT = C["photos"]["alt"]
SITE, PFX = True, "%BASE%"
PREVIEW = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None

# Hebrew: isolate numbers/ranges/phones/weights and Latin runs so bidi can't reorder them
BIDI = re.compile(r"(?P<lat>[A-Za-z][A-Za-z0-9'’\-]*(?:[ .][A-Za-z0-9][A-Za-z0-9'’\-]*)*)"
                  r"|(?P<num>(?<![\w])[-+~]?\d+(?:[.,:/]\d+)*(?:(?:\s?[–-]\s?|,\s)\d+(?:[.,:/]\d+)*)*\+?)")


def esc(s):
    return html.escape(s, quote=False)


def he_bidi(s):
    out, i = [], 0
    for m in BIDI.finditer(s):
        out.append(esc(s[i:m.start()]))
        out.append(f'<bdi dir="ltr">{esc(m.group(0))}</bdi>')
        i = m.end()
    out.append(esc(s[i:]))
    return "".join(out)


def one(lang, s):
    return he_bidi(s) if lang == "he" else esc(s)


def t(o, tag="span", cls=None):
    """Three language spans; placeholder objects become dashed chips."""
    if isinstance(o, str):
        return o
    # unanswered owner questions never reach the public page
    if isinstance(o, dict) and o.get("placeholder"):
        return ""
    inner = "".join(f'<{tag} data-l="{l}">{one(l, o[l])}</{tag}>' for l in LANGS)
    return f'<span class="{cls}">{inner}</span>' if cls else inner


def ltr(s):
    return f'<bdi dir="ltr">{esc(s)}</bdi>'


KANJI, GLYPHS = load("kanji.json"), json.loads((R / "src/generated/kanji-glyphs.json").read_text())
# a seal stacks a word with <br>, still one word
CJK = re.compile(r"[\u3000-\u9fff]+(?:<br>[\u3000-\u9fff]+)*")


def kanji(s, style):
    """Kanji words in s become SVG glyphs, as in src/lib/kanji.ts; kanji_defs() supplies the outlines."""
    def word(m):
        w = m.group().replace("<br>", "")
        assert w in KANJI[style], f"{w}: add it with its meaning to content/kanji.json ({style})"
        svgs = "<br>".join("".join(f'<svg class="kg" viewBox="{GLYPHS[style]["viewBox"]}" aria-hidden="true"><use href="#k-{style}-{ord(c):x}"/></svg>' for c in part)
                           for part in m.group().split("<br>"))
        # inline SVGs are bidi-neutral, so on RTL pages a word would read backwards
        return f'<bdi dir="ltr">{svgs}</bdi>' if len(w) > 1 else svgs
    return CJK.sub(word, s)


def kanji_defs(s):
    ids = sorted(set(re.findall(r'href="#k-(\w+)-([0-9a-f]+)"', s)))
    paths = "".join(f'<path id="k-{st}-{h}" d="{GLYPHS[st]["glyphs"][chr(int(h, 16))]}" vector-effect="non-scaling-stroke"/>' for st, h in ids)
    return f'<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>{paths}</defs></svg>'


def attr(name, o):
    """A per-language attribute: pages/[lang]/index.astro keeps the page language's <name>-<l>."""
    if SITE:
        return " ".join(f'{name}-{l}="{html.escape(o[l])}"' for l in LANGS)
    return f'{name}="{html.escape(o["en"])}"'


def img(name, cls="", eager=False, alt=None):
    """alt: {he, ru, en}, or "" for decorative; photos default to content's photos.alt."""
    p = name if "/" in name else f"img-night/{name}"
    if p not in USED:
        USED.append(p)
    w, h = Image.open(PUB / p).size
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    a = PHOTO_ALT.get(name, "") if alt is None else alt
    a = f'alt="{html.escape(a)}"' if isinstance(a, str) else attr("alt", a)
    return f'<img class="{cls}" src="{PFX}{p}" width="{w}" height="{h}" {a} {load} decoding="async">'


def nav_label(i):
    return next(n for n in C["nav"] if n["id"] == i)


WA_SVG = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.4 1.3-2 1.3-.5.1-1.2.1-1.9-.1a17 17 0 0 1-1.7-.6 13.3 13.3 0 0 1-5-4.5c-.4-.5-1-1.5-1-2.8 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.1.1.7-.1 1.4Z"/></svg>')
ARROW = '<span class="arrow" aria-hidden="true">→</span>'


def ga(event, **params):
    """Analytics hook read by the site's one click listener (src/components/Consent.astro)."""
    return f'data-ga="{event}"' + "".join(f' data-ga-{k}="{v}"' for k, v in params.items())


def wa(label, placement, extra="", msg=None):
    """msg: {he, ru, en} text prefilled in the chat, in the page language."""
    href = attr("href", {l: f"{WA}?text={urllib.parse.quote(msg[l])}" for l in LANGS}) if msg else f'href="{WA}"'
    return (f'<div class="wa-row {extra}"><a class="btn btn-wa" {href} target="_blank" rel="noopener" {ga("whatsapp_click", placement=placement)}>{WA_SVG}{t(label)}</a>'
            f'<a class="wa-num" href="tel:+972545664663" {ga("phone_click", placement=placement)}>{ltr(WA_NUM)}</a></div>')


def head(nav_id, kanji, title, intro=None):
    n = nav_label(nav_id)
    k = t(club["name"] if any(n[l] == title[l] for l in LANGS) else n)
    p = f'<p class="lead">{t(intro)}</p>' if intro else ""
    return (f'<div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">{kanji}</span>{k}</span>'
            f'<h2 class="h2">{t(title)}</h2>{p}</div>')


def more_link(sec, href):
    """Link from a landing block to its full page; relative href keeps the visitor's language."""
    return f'<p class="more-link"><a class="btn btn-ghost" href="{href}">{t(sec["more"])} {ARROW}</a></p>'


def split_dash(o):
    """'Name — event' titles -> (name, event) per language, or None."""
    if all(" — " in o[l] for l in LANGS):
        return ({l: o[l].split(" — ", 1)[0] for l in LANGS}, {l: o[l].split(" — ", 1)[1] for l in LANGS})
    return None


# ---------- sections ----------
club, hero, kids, fc = C["club"], C["hero"], C["kids"], C["kids"]["first_class"]
LOGO = "brand/logo.png"
USED.append(LOGO)


A11Y = {
    "menu": {"he": "תפריט", "ru": "Меню", "en": "Menu"},
    "sections": {"he": "חלקי העמוד", "ru": "Разделы", "en": "Sections"},
    "language": {"he": "שפה", "ru": "Язык", "en": "Language"},
    "gallery": {"he": "גלריית תמונות", "ru": "Фотогалерея", "en": "Photo gallery"},
    "pause": {"he": "עצירת אנימציות", "ru": "Остановить анимацию", "en": "Pause animations"},
    "film_pause": {"he": "עצירת הסרטון", "ru": "Остановить видео", "en": "Pause video"},
    "coach_video": {"he": "סרטון היכרות", "ru": "Видеопрофиль", "en": "Video profile"},
}


def yt(vid, cls, label, placement):
    """A youtu.be link that the page's VideoModal plays in place; nothing from YouTube loads until the click."""
    v = VIDEOS[vid]  # KeyError: list the upload in content/videos.json first
    return (f'<a class="{cls}" href="https://youtu.be/{vid}" data-video="{vid}" data-kind="{v["kind"]}" {attr("data-title", v["title"])} '
            f'{ga("video_play", video_id=vid, placement=placement)}><span class="v-tri" aria-hidden="true"></span>{t(label)}</a>')


def header():
    langs = "".join(
        f'<button type="button" data-set-lang="{l}" aria-pressed="{str(l=="he").lower()}" title="{C["language_switch"][l]}">{lab}</button>'
        for l, lab in (("he", "עב"), ("ru", "RU"), ("en", "EN")))
    if SITE:
        langs = "".join(f'<a data-l-link="{l}" href="%LANG_{l}%" hreflang="{l}" lang="{l}" {ga("language_switch", to=l)} title="{C["language_switch"][l]}">{lab}</a>'
                        for l, lab in (("he", "עב"), ("ru", "RU"), ("en", "EN")))
    cta = hero["cta_primary"]
    join = "".join(
        f'<span data-l="{l}">{one(l, cta[l].split(" ", 1)[0])}<span class="t-long"> {one(l, cta[l].split(" ", 1)[1])}</span></span>'
        for l in LANGS)
    # "news" is a separate page; relative href keeps the visitor's language
    links = "".join(f'<a href="{n.get("href", "#" + n["id"])}">{t(n)}</a>' for n in C["nav"])
    return f'''
<header class="hd" id="hd">
 <div class="hd-in">
  <a class="brand" href="#top"><span class="plate"><img src="{PFX}{LOGO}" width="256" height="256" alt=""></span>
   <span class="brand-t">{t(club["name"])}</span></a>
  <div class="hd-r">
   <div class="lang" role="group" {attr("aria-label", A11Y["language"])}>{langs}</div>
   <a class="btn btn-wa btn-join" href="{cta["href"]}">{join}</a>
   <details class="menu"><summary {attr("aria-label", A11Y["menu"])}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></summary>
    <nav class="menu-p" {attr("aria-label", A11Y["sections"])}>{links}</nav></details>
  </div>
 </div>
</header>'''


def hero_sec():
    h = hero["headline"]
    h1 = ""
    for l in LANGS:
        a, b = h[l].split(". ", 1)
        h1 += f'<span data-l="{l}">{one(l, a + ".")} <span class="g">{one(l, b)}</span></span>'
    return f'''
<section class="hero" id="top">
 <div class="hero-media">{img("groundwork.jpg", eager=True)}</div>
 <svg class="enso" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="186"/></svg>
 <div class="hero-kanji kj" aria-hidden="true"><span>柔道</span></div>
 <div class="wrap hero-c">
  <span class="kicker">{t(hero["eyebrow"])}</span>
  <h1 class="h1">{h1}</h1>
  <p class="hero-p">{t(hero["subline"])}</p>
  <div class="cta-row">
   <a class="btn btn-wa btn-lg" href="{hero["cta_primary"]["href"]}">{t(hero["cta_primary"])} {ARROW}</a>
   <a class="btn btn-ghost btn-lg" href="{hero["cta_secondary"]["href"]}">{t(hero["cta_secondary"])}</a>
  </div>
  <p class="hero-disc"><span class="kj" aria-hidden="true">柔</span>{t(club["disciplines"])}</p>
 </div>
 <span class="scroll" aria-hidden="true"></span>
</section>'''


def film():
    f, src = C["film"], f"{PFX}videos/club-teaser"
    # night.js plays the loop only while in view; under reduced motion or Save-Data the poster stays
    return f'''
<section class="sec film" id="film">
 <div class="wrap">
  <div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">技</span>{t(club["name"])}</span><h2 class="h2">{t(f["title"])}</h2><p class="lead">{t(f["intro"])}</p></div>
  <div class="film-box rv">
   <video class="film-v" muted playsinline loop preload="none" poster="{src}.jpg" width="960" height="540" aria-hidden="true"><source src="{src}.webm" type="video/webm; codecs=av01.0.04M.08"><source src="{src}.mp4" type="video/mp4"></video>
   {yt(f["video"], "btn btn-wa btn-lg film-cta", f["cta"], "landing_film")}
   <button type="button" class="film-pause" aria-pressed="false" {attr("aria-label", A11Y["film_pause"])}></button>
  </div>
 </div>
</section>'''


def ticker():
    ks = ["七転八起", "柔道", "礼"]
    items = "".join(f'<span class="tk-t">{t(tl)}</span><span class="tk-k kj">{k}</span>' for tl, k in zip(C["taglines"], ks))
    # WCAG 2.2.2: endless motion needs a pause; the same button stills the grain and petals
    return (f'<div class="ticker"><div class="ticker-track" aria-hidden="true">{items}{items}{items}{items}</div>'
            f'<button type="button" class="tk-pause" aria-pressed="false" {attr("aria-label", A11Y["pause"])}></button></div>')


ICON_K = {"bow": "礼", "belt": "帯", "fall": "受", "balance": "体", "handshake": "友", "rise": "起"}


def parents():
    bens = "".join(
        f'<article class="ben rv"><span class="ben-n" aria-hidden="true">0{i+1}</span><span class="ben-k kj" aria-hidden="true">{ICON_K[b["icon_hint"]]}</span>'
        f'<h3 class="h3">{t(b["title"])}</h3><p>{t(b["text"])}</p></article>'
        for i, b in enumerate(kids["benefits"]))
    mos = "".join(f'<figure class="mo mo{i}">{img(n, "pic")}</figure>' for i, n in enumerate(["kids-coach.jpg", "rope-climb.jpg", "belt-class.jpg", "kids-belt-cheer.jpg"]))
    st = C["success_triangle"]
    return f'''
<section class="sec tatami" id="parents">
 <div class="wrap">
  {head("parents", "礼", kids["title"], kids["intro"])}
  <div class="mosaic rv">{mos}</div>
  <div class="bens">{bens}</div>
  <p class="st-intro rv"><span class="kj" aria-hidden="true">三</span>{t(st["intro"])}</p>
  {TRIANGLE}
 </div>
</section>'''


RAIL_UI = {
    "all": {"he": "כולם", "ru": "Все", "en": "All"},
    "lead": {"he": "מאמנים בכירים", "ru": "Ведущие", "en": "Senior"},
    "title": {"he": "צוות המאמנים", "ru": "Команда тренеров", "en": "The coaching team"},
    "prev": {"he": "הקודם", "ru": "Назад", "en": "Previous"},
    "next": {"he": "הבא", "ru": "Дальше", "en": "Next"},
    "more": {"he": "לקריאה נוספת", "ru": "Подробнее", "en": "Read more"},
    "approach": {"he": "הגישה המקצועית והחינוכית", "ru": "Подход к тренировкам и воспитанию", "en": "Coaching approach"},
    "close": {"he": "סגירה", "ru": "Закрыть", "en": "Close"},
}


def initials(n):
    return {l: "".join(w[0] for w in n[l].replace("(", "").split()[:2]) for l in LANGS}


def rail_card(n, grp, grp_label):
    ph = n.get("photo")
    face = (img(ph["src"], "portrait", alt=n["name"]) if ph else
            f'<span class="mono" aria-hidden="true">{t(initials(n["name"]))}</span>')
    bio = f'<p class="rc-bio">{t(n["bio"])}</p>' if n.get("bio") else ""
    return (f'<li class="rc" data-grp="{grp}"><div class="rc-ph{" has-img" if ph else ""}">{face}</div>'
            f'<span class="rc-tag">{t(grp_label)}</span><h4 class="rc-n">{t(n["name"])}</h4>{bio}{coach_more(n, grp_label)}{coach_video(n)}</li>')


def coach_more(c, tag):
    if not c.get("about"):
        return ""
    pid = f'bio-{c["id"]}'
    paras = "".join(f"<p>{t(p)}</p>" for p in c["about"])
    appr = "".join(f"<p>{t(p)}</p>" for p in c.get("approach", []))
    if appr:
        q = "blockquote" if c.get("approach_own") else "div"
        appr = f'<h5 class="bio-h">{t(RAIL_UI["approach"])}</h5><{q} class="bio-appr">{appr}</{q}>'
    ph = c.get("photo")
    face = f'<figure class="dos-ph">{img(ph["src"], "portrait", alt=ph.get("alt", c["name"]))}</figure>' if ph else ""
    dan = c.get("dan_rank")
    dan = f'<span class="dos-dan">{t(dan)}</span>' if dan and not dan.get("placeholder") else ""
    return (f'<button type="button" class="bio-more" popovertarget="{pid}">{t(RAIL_UI["more"])}</button>'
            f'<div class="bio-pop" id="{pid}" popover><button type="button" class="bio-x" popovertarget="{pid}" popovertargetaction="hide" {attr("aria-label", RAIL_UI["close"])}>×</button>'
            f'<div class="dos">{face}<div class="dos-b"><span class="kj dos-kj" aria-hidden="true">師</span>'
            f'<span class="rc-tag">{t(tag)}</span><h4 class="bio-n">{t(c["name"])}</h4>{dan}'
            f'<p class="dos-lead">{t(c["bio"])}</p>{paras}{appr}</div></div></div>')


def coach_video(c):
    return yt(c["youtube"], "coach-vid", A11Y["coach_video"], "coach") if c.get("youtube") else ""


def coaches():
    co = CO
    ks = ["師", "道", "技"]

    def grp(g):
        return [c for c in COACHES if c["group"] == g]

    def photo(c, k):
        ph = c["photo"]
        if isinstance(ph, dict) and ph.get("src"):
            return f'<div class="coach-ph has-img">{img(ph["src"], "portrait", alt=ph["alt"])}</div>'
        return f'<div class="coach-ph"><span class="kj" aria-hidden="true">{k}</span></div>'
    cards = "".join(f'''
   <article class="coach rv"><span class="coach-bg kj" aria-hidden="true">{k}</span>
    {photo(c, k)}
    <div class="coach-b"><h3 class="h3 coach-n">{t(c["name"])}</h3><p class="role">{t(c["role"])}</p>{coach_video(c)}
    <p class="bio">{t(c["bio"])}</p>{coach_more(c, c["role"])}<p class="dan">{t(c["dan_rank"])}</p></div></article>'''
                    for c, k in zip(grp("main"), ks))
    groups = [("lead", RAIL_UI["lead"], grp("lead"))] + [(r["group"], r["title"], grp(r["group"])) for r in co["roster"]]
    rail = "".join(rail_card(n, k, lab) for k, lab, ns in groups for n in ns)
    chips = (f'<button type="button" class="chip" data-grp="" aria-pressed="true">{t(RAIL_UI["all"])}</button>'
             + "".join(f'<button type="button" class="chip" data-grp="{k}" aria-pressed="false">{t(lab)}</button>' for k, lab, _ in groups))
    tp = co["team_photo"]
    return f'''
<section class="sec" id="coaches">
 <div class="wrap">
  {head("coaches", "師", co["title"], co["intro"])}
  <figure class="team rv">{img(tp["src"], "team-img", alt=tp["alt"])}</figure>
  <p class="founded rv"><span class="kj" aria-hidden="true">創</span>{t(co["founded_note"])}</p>
  <div class="c-grid">{cards}</div>
  <div class="rail-wrap" id="team-rail">
   <div class="rail-top"><h3 class="h3 grp" id="rail-t">{t(RAIL_UI["title"])}</h3>
    <div class="rail-nav"><button type="button" class="rail-btn" data-dir="-1" {attr("aria-label", RAIL_UI["prev"])}>‹</button><button type="button" class="rail-btn" data-dir="1" {attr("aria-label", RAIL_UI["next"])}>›</button></div></div>
   <div class="chips" role="group" aria-labelledby="rail-t">{chips}</div>
   <ul class="rail" tabindex="0" aria-labelledby="rail-t">{rail}</ul>
  </div>
 </div>
</section>'''


def achievements():
    a = C["achievements"]
    stats = "".join(f'<div class="stat rv"><span class="num">{ltr(s["value"])}</span><p>{t(s["label"])}</p></div>' for s in a["stats"])
    hls = ""
    for h in a["highlights"]:
        sp = split_dash(h["title"])
        title = (f'<span class="hl-who">{t(sp[0])}</span><h3 class="h3 hl-t">{t(sp[1])}</h3>' if sp
                 else f'<h3 class="h3 hl-t">{t(h["title"])}</h3>')
        mark = '<span class="hl-k kj" aria-hidden="true">五輪</span>' if h["kind"] == "olympic" else ""
        hls += f'<article class="hl hl-{h["kind"]} rv">{mark}<span class="hl-y">{ltr(h["year"])}</span>{title}<p>{t(h["detail"])}</p></article>'
    more = "".join(f'<li><span class="mr-y">{ltr(m["year"])}</span><span>{t(m["text"])}</span></li>' for m in a["more_results"])
    pics = "".join(img(n, "pic") for n in ["medals-kids.jpg", "intl-medals.jpg", "result-cadets-trio.jpg", "hadera-team.jpg"])
    return f'''
<section class="sec ach" id="achievements">
 <div class="ach-bg">{img("medals-team.jpg")}</div>
 <div class="wrap">
  {head("achievements", "一本", a["title"], a["intro"])}
  <div class="stats">{stats}</div>
  <div class="hl-grid">{hls}</div>
  <div class="more-wrap">
   <ul class="more-list rv">{more}</ul>
   <div class="ach-pics rv">{pics}</div>
  </div>
  {more_link(a, "achievements/")}
  <div class="cta-band rv">
   <p class="cta-line">{t(C["taglines"][2])}</p>
   <div class="cta-row"><a class="btn btn-wa btn-lg" href="{hero["cta_primary"]["href"]}">{t(hero["cta_primary"])} {ARROW}</a></div>
  </div>
 </div>
</section>'''


def history():
    hi = C["history"]
    items = "".join(f'<li class="tl-i rv"><span class="tl-y">{ltr(i["year"])}</span><h3 class="h3 tl-t">{t(i["title"])}</h3><p>{t(i["text"])}</p></li>' for i in hi["items"])
    strip = "".join(f'<figure>{img(n, "pic")}</figure>' for n in C["photos"]["gallery_strip"] if n != "groundwork.jpg")
    return f'''
<section class="sec tatami" id="history">
 <div class="wrap">
  {head("history", "歴史", hi["title"], hi["intro"])}
  <p class="lineage">{t(hi["lineage_note"])}</p>
  <div class="hist">
   <div class="hist-pics">{img("camp-group.jpg", "pic")}{img("tour-north-hall.jpg", "pic")}</div>
   <ol class="tl">{items}</ol>
  </div>
  {more_link(hi, "history/")}
 </div>
 <div class="strip" tabindex="0" role="region" {attr("aria-label", A11Y["gallery"])}>{strip}</div>
</section>'''


def tournaments():
    to = C["tournaments"]
    bg = {"north-2025": "tour-north-hall.jpg", "north-2022": "tour-kids-bout.jpg", "fight-sim-2026": "tour-kids-referee.jpg"}
    cards = ""
    for o in to["organized"]:
        part = f'<span class="tour-num">{ltr(o["participants"])}</span>' if o["participants"] else ""
        cards += (f'<article class="tour rv">{img(bg[o["id"]], "tour-img")}<span class="tag">{ltr(o["year"])}</span>{part}'
                  f'<h3 class="h3 tour-t">{t(o["name"])}</h3><p class="tour-pl">{t(o["place"])}</p><p>{t(o["text"])}</p></article>')
    s = to["sumo"]
    pics = "".join(img(n, "pic") for n in ["tour-kids-warmup.jpg", "result-jfp-haifa.jpg", "tour-hadera-arena.jpg"])
    return f'''
<section class="sec" id="tournaments">
 <div class="wrap">
  {head("tournaments", "試合", to["title"], to["intro"])}
  <div class="t-grid">{cards}</div>
  <p class="more-ph">{t(to["earlier_editions"])}</p>
  <div class="t-pics rv">{pics}</div>
  <article class="sumo rv"><div class="sumo-k kj" aria-hidden="true"><span>相撲</span></div>
   <div class="sumo-b"><h3 class="h3 sumo-t">{t(s["title"])}</h3>
   <p>{t(s["text"])}</p></div></article>
  {more_link(to, "tournaments/")}
 </div>
</section>'''


def camps():
    ca = C["camps"]
    cards = ""
    for c in ca["recent"]:
        ph = "".join(img(p, "pic") for p in c["photos"])
        cards += (f'<article class="camp rv"><div class="camp-mo n{len(c["photos"])}">{ph}</div>'
                  f'<div class="camp-b"><span class="tag">{t(c["when"])}</span><h3 class="h3">{t(c["title"])}</h3><p>{t(c["text"])}</p></div></article>')
    js = "".join(f'<li class="js-i rv"><span class="js-w">{t(h["when"])}</span><h4 class="h4">{t(h["place"])}</h4><p>{t(h["text"])}</p></li>' for h in ca["history"])
    return f'''
<section class="sec tatami" id="camps">
 <div class="wrap">
  {head("camps", "合宿", ca["title"], ca["intro"])}
  <div class="camp-grid">{cards}</div>
  <p class="more-ph">{t(ca["upcoming"])}</p>
  <div class="jsport">
   <h3 class="h3 js-h">{t(ca["history_title"])}</h3>
   <p class="lead">{t(ca["history_intro"])}</p>
   <ol class="js-grid">{js}</ol>
  </div>
 </div>
</section>'''


SCHED_UI = {
    "heading": {"he": "עונת 2026/27", "ru": "Сезон 2026/27", "en": "Season 2026/27"},
    "coach_q": {"he": "עם מי?", "ru": "Тренер", "en": "Coach"},
    "adults": {"he": "מבוגרים", "ru": "Взрослые", "en": "Adults"},
    "grade_q": {"he": "באיזו כיתה הילד/ה?", "ru": "В каком классе ребёнок?", "en": "Your child's grade?"},
    "venue_q": {"he": "איפה נוח לכם?", "ru": "Где удобнее?", "en": "Which venue?"},
    "all": {"he": "הכול", "ru": "Все", "en": "All"},
    "today": {"he": "היום", "ru": "сегодня", "en": "today"},
    "none_day": {"he": "אין אימון מתאים ביום הזה", "ru": "В этот день подходящих тренировок нет", "en": "No matching class this day"},
    "none_all": {"he": "לא מצאנו קבוצה מתאימה — כתבו לנו ונמצא פתרון.", "ru": "Подходящей группы не нашлось — напишите нам, подберём.", "en": "No matching group — message us and we'll sort it out."},
    "others": {"he": "לוחות האימונים של שאר המאמנים יעלו בקרוב.", "ru": "Расписание групп других тренеров скоро появится.", "en": "Other coaches' schedules are coming soon."},
    "join": {"he": "הרשמה לקבוצה", "ru": "Записаться", "en": "Join"},
    "days": {"he": "ימי השבוע", "ru": "Дни недели", "en": "Days of the week"},
    "count": {"he": "אימונים מתאימים: ", "ru": "Подходящих тренировок: ", "en": "Matching classes: "},
    "wa_msg": {"he": "שלום! אשמח להצטרף לאימון: ", "ru": "Здравствуйте! Хотим записаться на тренировку: ", "en": "Hi! We'd like to join this class: "},
}
AVA_ZOOM = 2.0  # keep in step with .ava img scale() in night.css
DAY_SHORT = {"he": ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"], "ru": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт"], "en": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]}
VENUE_COLOR = {"ein-hayam": "#5aa9e6", "ironi-alef": "#e0414a", "leo-baeck-hadar": "#4fbf7f", "dror-school": "#a47be0",
               "ben-gurion-haifa": "#e6a23c", "reali-ahuza": "#3cc8c8", "ramot-haifa": "#d65db1", "barkai": "#8bc34a",
               "leo-baeck-center": "#f06f3c", "carmel-netiv-eliezer": "#c9b458", "yizreelia": "#6d8cff", "tchernichovsky-haifa": "#5fd3a0",
               "beit-yehoshua-nesher": "#ff8fa3", "rabin-nesher": "#b388ff", "misholim-atlit": "#ffd166"}


def city(v):
    return {l: v["address"][l].rsplit(", ", 1)[-1] for l in LANGS}


def by_city():
    """[(city, [(key, venue)])] in content/venues.json order."""
    out = {}
    for k, v in VENUES.items():
        out.setdefault(v["address"]["en"].rsplit(", ", 1)[-1], (city(v), []))[1].append((k, v))
    return list(out.values())


def grade_range(s):
    # mirrors gradeRange() in src/lib/schedule-changes.mjs
    if s.get("audience") == "adults":
        return "18-18"
    g = s["grades"]
    return f'{g[0]}-{g[1] if g[1] is not None else 12}' if g else ""


def grade_label(g):
    a, b = g
    L = SC["grade_letters_he"]
    if a == 0 and b == 1:
        return {"he": "גנים + כיתה א׳", "ru": "Детский сад и 1 класс", "en": "Kindergarten + grade 1"}
    if a == 0 and b == 0:
        return {"he": "גן", "ru": "Детский сад", "en": "Kindergarten"}
    if b is None:
        return {"he": f"כיתות {L[a]} ומעלה", "ru": f"{a} класс и старше", "en": f"Grade {a}+"}
    return {"he": f"כיתות {L[a]}–{L[b]}", "ru": f"{a}–{b} класс", "en": f"Grades {a}–{b}"}


def schedule():
    sc, U = C["schedule"], SCHED_UI
    coaches = {c["id"]: c for c in COACHES if c["id"] in SCHEDS}
    first = {cid: {l: c["name"][l].split()[0] for l in LANGS} for cid, c in coaches.items()}
    order = list(SCHEDS)

    def ava(c):
        # zoom origin that lands photo.face (centre of the face, as fractions of the portrait) in the circle's centre
        ph, z = c["photo"], AVA_ZOOM
        fx, fy = ph.get("face", (0.5, 0.2))
        w, h = Image.open(PUB / ph["src"]).size
        # where the face sits in the square before zooming: cover fits the shorter side, top-aligned and centred
        fx, fy = (fx, fy * h / w) if h >= w else (0.5 + (fx - 0.5) * w / h, fy)
        ox, oy = (min(max((0.5 - z * f) / (1 - z), 0), 1) * 100 for f in (fx, fy))
        return f'<span class="ava" style="--cc:{c["color"]};--fo:{ox:.1f}% {oy:.1f}%" aria-hidden="true">{img(ph["src"], "ava-i", alt="")}</span>'

    def row(cid, i, s):
        sd, c = SCHEDS[cid], coaches[cid]
        kind = sd["kinds"][s["kind"]]
        meta = f'<span class="ses-kind k-{s["kind"]}">{t(kind)}</span>' if kind["en"] else ""
        # Natanel's school-project subgroups differ only by time, so only the Olympic class shows its number
        if s.get("subgroup") and s["kind"] == "olympic-class":
            meta += f'<span class="ses-kind">{t({l: {"he": "קבוצה", "ru": "Группа", "en": "Group"}[l] + " " + str(s["subgroup"]) for l in LANGS})}</span>'
        aud = s.get("audience")
        if aud and aud != "adults":
            meta += f'<span class="ses-kind k-aud">{t(sd["audiences"][aud])}</span>'
        if s.get("note"):
            meta += f'<span class="ses-note">{t(s["note"])}</span>'
        grade = t(sd["audiences"]["adults"]) if aud == "adults" else t(grade_label(s["grades"])) if s["grades"] else ""
        # markers: the landing page slots dated changes (content/schedule-changes) in at build; key = sessionKey()
        return (f'<li class="ses" data-v="{s["venue"]}" data-g="{grade_range(s)}" data-c="{cid}" style="--cc:{c["color"]}"><!--SES {cid}#{i}-->'
                f'{ava(c)}<span class="ses-time">{ltr(s["start"] + "–" + s["end"])}</span><span class="ses-grade">{grade}</span>'
                + (f'<span class="ses-meta">{meta}</span>' if meta else "") +
                f'<span class="ses-coach vh">{t(c["name"])}</span>'
                f'<a class="ses-wa" href="{WA}" target="_blank" rel="noopener" {attr("aria-label", U["join"])} {ga("whatsapp_click", placement="schedule", venue=s["venue"])}>{WA_SVG}</a></li>')

    days = ""
    for d in range(6):
        groups = {}
        ses = [(cid, i, x) for cid, sd in SCHEDS.items() for i, x in enumerate(sd["sessions"]) if x["day"] == d]
        for cid, i, s in sorted(ses, key=lambda r: (r[2]["start"], order.index(r[0]))):
            groups.setdefault(s["venue"], []).append(row(cid, i, s))
        vgs = "".join(f'<section class="vg"><h5 class="vg-h">{t({l: VENUES[k][l] for l in LANGS})}<span class="vg-city">{t(city(VENUES[k]))}</span></h5>'
                      f'<ul class="ses-list">{"".join(rows)}</ul></section>' for k, rows in groups.items())
        name = {l: SC["days"][l][d] for l in LANGS}
        days += (f'<section class="day" data-day="{d}"><h4 class="day-h">{t(name)}<span class="day-today">{t(U["today"])}</span></h4>'
                 f'<ul class="ses-list ses-xl"><!--SES_X {d}--></ul><div class="vgs">{vgs}</div><p class="day-none">{t(U["none_day"])}</p></section>')
    tabs = "".join(f'<button type="button" class="tab" data-tab="{d}" aria-pressed="false">{t({l: DAY_SHORT[l][d] for l in LANGS})}<b class="tab-n"></b></button>' for d in range(6))
    grades = [(-1, U["all"])] + [(0, {"he": "גן", "ru": "Сад", "en": "KG"})] + [
        (g, {"he": SC["grade_letters_he"][g] + ("+" if g == 8 else ""), "ru": f"{g}{'+' if g == 8 else ''}", "en": f"{g}{'+' if g == 8 else ''}"}) for g in range(1, 9)] + [
        (18, U["adults"])]
    gchips = "".join(f'<button type="button" class="chip" data-grade="{g}" {ga("schedule_filter", grade=g)} aria-pressed="{str(g == -1).lower()}">{t(lab)}</button>' for g, lab in grades)
    cchips = f'<button type="button" class="chip" data-coach="" {ga("schedule_filter", coach="all")} aria-pressed="true">{t(U["all"])}</button>' + "".join(
        f'<button type="button" class="chip cchip" data-coach="{cid}" {ga("schedule_filter", coach=cid)} aria-pressed="false">{ava(coaches[cid])}{t(first[cid])}</button>' for cid in order)
    # 15 venues don't fit a chip row on a phone; a native select grouped by city does
    vopts = f'<option value="" {attr("label", U["all"])}>{U["all"]["en"]}</option>' + "".join(
        f'<optgroup {attr("label", c)}>' + "".join(f'<option value="{k}" {attr("label", {l: v[l] for l in LANGS})}>{esc(v["en"])}</option>' for k, v in vs) + '</optgroup>'
        for c, vs in by_city())
    vals = "".join(f'<span data-l="{l}">{" · ".join(SC["values"][l])}</span>' for l in LANGS)
    msg = "".join(f'<span data-l="{l}" class="wa-msg" hidden>{esc(U["wa_msg"][l])}</span>' for l in LANGS)
    return f'''
<section class="sec sched-sec" id="schedule">
 <div class="sched-bg">{img("train-georgia-randori.jpg")}</div>
 <div class="wrap">
  {head("schedule", "稽古", sc["title"])}
  <div class="sc-head rv"><h3 class="h3 grp">{t(U["heading"])}</h3><p class="sc-slogan">{t(SC["slogan"])}</p></div>
  <div class="sc-filters">
   <div class="fl"><p class="fl-q" id="fl-grade">{t(U["grade_q"])}</p><div class="chips" role="group" aria-labelledby="fl-grade">{gchips}</div></div>
   <div class="fl"><p class="fl-q" id="fl-coach">{t(U["coach_q"])}</p><div class="chips" role="group" aria-labelledby="fl-coach">{cchips}</div></div>
   <div class="fl"><p class="fl-q" id="fl-venue">{t(U["venue_q"])}</p><select class="fl-sel" data-venue-sel aria-labelledby="fl-venue">{vopts}</select></div>
  </div>
  <p class="sc-count vh" aria-live="polite">{t(U["count"])}<b></b></p>
  <!--SCHED_CHANGES-->
  <div class="tabs" role="group" {attr("aria-label", U["days"])}>{tabs}</div>
  <div class="week" id="week">{days}</div>
  <div class="sc-none">{t(U["none_all"])}{wa(C["kids"]["first_class"]["cta"], "schedule_none")}</div>
  <p class="niv"><span class="kj" aria-hidden="true">選</span>{t(sc["nivheret_note"])}</p>
  <p class="sc-vals">{vals}</p>
  <p class="sc-others">{t(U["others"])}</p>
  {msg}
 </div>
</section>'''


def first_class():
    def step(i, s):
        h = t(s["title"])
        h = f'<a href="{s["href"]}">{h}</a>' if s.get("href") else h
        return f'<li class="fs"><span class="fs-n" aria-hidden="true">{i}</span><h3 class="h4">{h}</h3><p>{t(s["text"])}</p></li>'
    steps = "".join(step(i, s) for i, s in enumerate(fc["steps"], 1))
    bring = "".join(f'<li>{t(x)}</li>' for x in fc["bring"])
    expect = "".join(f'<li>{t(x)}</li>' for x in fc["expect"])
    # price and judogi stay placeholders (t() drops them) until the owner confirms
    notes = "".join(f'<p class="fc-note">{n}</p>' for n in map(t, [fc["price"], fc["judogi"], *fc["open_questions"]]) if n)
    return f'''
<section class="sec" id="first-class">
 <div class="wrap">
  <div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">始</span>{t(club["name"])}</span><h2 class="h2">{t(fc["title"])}</h2><p class="lead">{t(fc["who"])}</p></div>
  <ol class="fsteps rv">{steps}</ol>
  <div class="fc rv">
   <div class="fc-main">
    <span class="fc-k kj" aria-hidden="true">始</span>
    <div class="fc-cols">
     <div><h3 class="h4">{t(fc["bring_title"])}</h3><ul class="dl">{bring}</ul></div>
     <div><h3 class="h4">{t(fc["expect_title"])}</h3><ol class="nl">{expect}</ol></div>
    </div>
    {notes}
    {wa(fc["cta"], "first_class", msg=fc["cta"]["message"])}
   </div>
   <div class="fc-pics">{img("result-jfp-mascot.jpg", "pic")}{img("result-kids-certificates.jpg", "pic")}</div>
  </div>
 </div>
</section>'''


BR_UI = {"days": {"he": "ימי אימון", "ru": "Дни тренировок", "en": "Training days"},
         "bus": {"he": "איך מגיעים באוטובוס", "ru": "Как доехать на автобусе", "en": "Bus directions"}}


def branches():
    b = C["branches"]
    v, i = "", 0
    for c, vs in by_city():
        v += f'<h3 class="v-city">{t(c)}</h3><div class="venues v4">'
        for k, vn in vs:
            i += 1
            q = urllib.parse.quote(vn["address"]["he"])
            ds = sorted({s["day"] for sc in SCHEDS.values() for s in sc["sessions"] if s["venue"] == k})
            days = "".join(f'<span data-l="{l}">{" · ".join(DAY_SHORT[l][d] for d in ds)}</span>' for l in LANGS)
            v += (f'<article class="venue rv" style="--vc:{VENUE_COLOR[k]}"><span class="v-i" aria-hidden="true">{i:02}</span>'
                  f'<h4 class="h3">{t({l: vn[l] for l in LANGS})}</h4><p class="v-addr">{t(vn["address"])}</p><p class="v-note">{t(BR_UI["days"])}: {days}</p>'
                  f'<div class="v-links"><a href="https://www.google.com/maps/search/?api=1&amp;query={q}" target="_blank" rel="noopener" {ga("map_open", venue=k, provider="google_maps")}>Google Maps</a>'
                  f'<a href="https://waze.com/ul?q={q}&amp;navigate=yes" target="_blank" rel="noopener" {ga("map_open", venue=k, provider="waze")}>Waze</a>'
                  f'<a href="https://www.google.com/maps/dir/?api=1&amp;destination={q}&amp;travelmode=transit" target="_blank" rel="noopener" {ga("map_open", venue=k, provider="transit")}>{t(BR_UI["bus"])}</a></div></article>')
        v += '</div>'
    nb = "".join(f'<li>{t(n["name"])}</li>' for n in b["neighbourhoods"])
    return f'''
<section class="sec tatami" id="branches">
 <div class="wrap">
  {head("branches", "道場", b["title"], b["intro"])}
  {v}
  <!--VENUE_MAP-->
  <ul class="hoods rv">{nb}</ul>
 </div>
</section>'''


def contact():
    co = C["contact"]
    phones = "".join(f'<li><span>{t(p["name"])}</span><a href="tel:{p["tel"]}" {ga("phone_click", placement="contact")}>{ltr(p["phone"])}</a></li>' for p in co["phones"])
    soc = ""
    for s in co["social"]:
        if s.get("placeholder"):
            soc += t(s)
        else:
            lab = esc(s["label"]) + (f' <bdi dir="ltr">{esc(s["handle"])}</bdi>' if s.get("handle") else "")
            soc += f'<a class="soc" href="{s["url"]}" target="_blank" rel="noopener" {ga("social_click", network=s["id"])}>{lab} {ARROW}</a>'
    return f'''
<section class="sec contact" id="contact">
 <div class="ct-bg">{img("kids-belts-throw.jpg")}</div>
 <span class="ct-k kj" aria-hidden="true">礼</span>
 <div class="wrap">
  <div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">連絡</span>{t(nav_label("contact"))}</span><h2 class="h2 ct-h">{t(co["title"])}</h2><p class="lead">{t(co["text"])}</p></div>
  <div class="ct-grid">
   <div class="ct-card rv">
    {wa(co["whatsapp_cta"]["label"], "contact", "wa-big")}
    <ul class="phones">{phones}</ul>
    <p class="mail"><a href="mailto:{co["email"]["value"]}">{ltr(co["email"]["value"])}</a></p>
    <div class="socs">{soc}</div>
   </div>
   <div class="ct-pic rv">{img("belts-air.jpg", "pic")}</div>
  </div>
  {more_link(co, "contact/")}
 </div>
</section>'''


LEGAL_LINKS = "".join(
    f'<span data-l="{l}"><a href="%BASE%{l}/contact/">{c}</a> · <a href="%BASE%{l}/belts/">{b}</a> · <a href="%BASE%{l}/techniques/">{w}</a> · <a href="%BASE%{l}/accessibility/">{a}</a> · <a href="%BASE%{l}/privacy/">{p}</a></span>'
    for l, c, b, w, a, p in (("he", "צרו קשר", "חגורות", "טכניקות", "הצהרת נגישות", "מדיניות פרטיות"), ("ru", "Контакты", "Пояса", "Техника", "Заявление о доступности", "Политика конфиденциальности"),
                             ("en", "Contact", "Belts", "Techniques", "Accessibility statement", "Privacy policy")))


def footer():
    f = C["footer"]
    return f'''
<footer class="ft">
 <div class="wrap ft-in">
  <div class="ft-brand"><span class="plate plate-lg"><img src="{PFX}{LOGO}" width="256" height="256" alt="" loading="lazy"></span>
   <div><p class="ft-name">{t(club["name"])}</p><p>{t(f["tagline"])}</p></div></div>
  <div class="ft-meta"><p>{t(f["legal"])} {t(f["amuta_number"])}</p><p class="ft-legal">{LEGAL_LINKS}<!--COOKIES--></p><p class="copy">{t(f["copyright"])}</p></div>
 </div>
</footer>'''


# ---------- success triangle embed ----------
src = (HERE / "success-triangle.html").read_text()
st_css = src[src.index("/* ---------- embeddable section ---------- */"):src.index("/* social-image renders")]
st_sec = src[src.index('<section class="success-triangle"'):src.index("</section>", src.index('<section class="success-triangle"')) + len("</section>")]
st_sec = st_sec.replace('<section class="success-triangle"',
                        '<section class="success-triangle rv" data-theme="night" style="--st-paper:#13110f;--st-ink:#f3ead8;--st-text:#cfc5b2;--st-accent:#e44f57;--st-blossom:#e9a0a8;--st-card:#1c1915;--st-kanji:kj"', 1)
TRIANGLE = kanji(st_sec, "brush")

CSS = (HERE / "night.css").read_text()
JS = (HERE / "night.js").read_text()



def render(site):
    global SITE, PFX
    SITE, PFX = site, ("%BASE%" if site else "")  # the site build swaps in its base path
    body = kanji(header() + '\n<main id="main">' + hero_sec() + ticker() + film() + parents() + coaches() + achievements() + history() + tournaments() + camps() + schedule() + first_class() + branches() + contact() + "\n</main>" + footer(), "mincho")
    return body + kanji_defs(body)


body = render(True)

(R / "src/generated").mkdir(parents=True, exist_ok=True)
(R / "src/generated/landing.html").write_text(body)
# drop the in-place language switcher: on the site each language is its own URL
site_js, n = re.subn(r"  // the real site has one URL.*?\n  }\n", "", JS, count=1, flags=re.S)
assert n == 1 and "data-set-lang" not in site_js
(R / "src/generated/landing.js").write_text(site_js)
(R / "src/styles/landing.css").write_text(CSS + "\n" + st_css)
print(len(body), "bytes body;", len(set(USED)), "images")

if PREVIEW:
    out = ('<title>Unifight Dojo Night</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
           # the site self-hosts these through Astro; this local file can only borrow them
           '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&amp;family=Rubik:wght@400;500;600;700&amp;family=Secular+One&amp;family=Frank+Ruhl+Libre:wght@500;700;900&amp;family=Playfair+Display:wght@600;700;800&amp;display=swap">\n'
           + "<style>\n" + (R / "src/styles/tokens.css").read_text() + CSS + "\n" + st_css + "</style>\n" + render(False) + "\n<script>\n" + JS + "</script>\n")
    PREVIEW.mkdir(parents=True, exist_ok=True)
    (PREVIEW / "night.html").write_text(out)
    print("preview:", PREVIEW / "night.html", "(images: publish with root=public/)")
