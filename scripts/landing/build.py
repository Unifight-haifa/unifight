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
SC = load("schedule/natanel-zhurovel.json")
LANGS = ("he", "ru", "en")
WA = "https://wa.me/972545664663"
WA_NUM = "054-566-4663"
USED = []  # local asset paths, in order of first use
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


def img(name, cls="", eager=False, alt=""):
    p = name if "/" in name else f"img-night/{name}"
    if p not in USED:
        USED.append(p)
    w, h = Image.open(PUB / p).size
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return f'<img class="{cls}" src="{PFX}{p}" width="{w}" height="{h}" alt="{alt}" {load} decoding="async">'


def nav_label(i):
    return next(n for n in C["nav"] if n["id"] == i)


WA_SVG = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.4 1.3-2 1.3-.5.1-1.2.1-1.9-.1a17 17 0 0 1-1.7-.6 13.3 13.3 0 0 1-5-4.5c-.4-.5-1-1.5-1-2.8 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.1.1.7-.1 1.4Z"/></svg>')
ARROW = '<span class="arrow" aria-hidden="true">→</span>'


def wa(label, extra=""):
    return (f'<div class="wa-row {extra}"><a class="btn btn-wa" href="{WA}" target="_blank" rel="noopener">{WA_SVG}{t(label)}</a>'
            f'<a class="wa-num" href="tel:+972545664663">{ltr(WA_NUM)}</a></div>')


def head(nav_id, kanji, title, intro=None):
    n = nav_label(nav_id)
    k = t(club["name"] if any(n[l] == title[l] for l in LANGS) else n)
    p = f'<p class="lead">{t(intro)}</p>' if intro else ""
    return (f'<div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">{kanji}</span>{k}</span>'
            f'<h2 class="h2">{t(title)}</h2>{p}</div>')


def split_dash(o):
    """'Name — event' titles -> (name, event) per language, or None."""
    if all(" — " in o[l] for l in LANGS):
        return ({l: o[l].split(" — ", 1)[0] for l in LANGS}, {l: o[l].split(" — ", 1)[1] for l in LANGS})
    return None


# ---------- sections ----------
club, hero, kids, fc = C["club"], C["hero"], C["kids"], C["kids"]["first_class"]
LOGO = "brand/logo.png"
USED.append(LOGO)


def header():
    langs = "".join(
        f'<button type="button" data-set-lang="{l}" aria-pressed="{str(l=="he").lower()}" title="{C["language_switch"][l]}">{lab}</button>'
        for l, lab in (("he", "עב"), ("ru", "RU"), ("en", "EN")))
    if SITE:
        langs = "".join(f'<a data-l-link="{l}" href="%LANG_{l}%" hreflang="{l}" lang="{l}" title="{C["language_switch"][l]}">{lab}</a>'
                        for l, lab in (("he", "עב"), ("ru", "RU"), ("en", "EN")))
    cta = hero["cta_primary"]
    join = "".join(
        f'<span data-l="{l}">{one(l, cta[l].split(" ", 1)[0])}<span class="t-long"> {one(l, cta[l].split(" ", 1)[1])}</span></span>'
        for l in LANGS)
    links = "".join(f'<a href="#{n["id"]}">{t(n)}</a>' for n in C["nav"])
    return f'''
<header class="hd" id="hd">
 <div class="hd-in">
  <a class="brand" href="#top"><span class="plate"><img src="{PFX}{LOGO}" width="256" height="256" alt="{esc(club["name"]["en"])}"></span>
   <span class="brand-t">{t(club["name"])}</span></a>
  <nav class="hd-nav" aria-label="Sections">{links}</nav>
  <div class="hd-r">
   <div class="lang" role="group" aria-label="Language">{langs}</div>
   <a class="btn btn-wa btn-join" href="{cta["href"]}">{join}</a>
   <details class="menu"><summary aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></summary>
    <nav class="menu-p" aria-label="Sections">{links}</nav></details>
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


def ticker():
    ks = ["七転八起", "柔道", "礼"]
    items = "".join(f'<span class="tk-t">{t(tl)}</span><span class="tk-k kj">{k}</span>' for tl, k in zip(C["taglines"], ks))
    return f'<div class="ticker" aria-hidden="true"><div class="ticker-track">{items}{items}{items}{items}</div></div>'


ICON_K = {"bow": "礼", "belt": "帯", "fall": "受", "balance": "体", "handshake": "友", "rise": "起"}


def parents():
    bens = "".join(
        f'<article class="ben rv"><span class="ben-n" aria-hidden="true">0{i+1}</span><span class="ben-k kj" aria-hidden="true">{ICON_K[b["icon_hint"]]}</span>'
        f'<h3 class="h3">{t(b["title"])}</h3><p>{t(b["text"])}</p></article>'
        for i, b in enumerate(kids["benefits"]))
    mos = "".join(f'<figure class="mo mo{i}">{img(n, "pic")}</figure>' for i, n in enumerate(["kids-coach.jpg", "rope-climb.jpg", "belt-class.jpg", "kids-belt-cheer.jpg"]))
    bring = "".join(f'<li>{t(x)}</li>' for x in fc["bring"])
    expect = "".join(f'<li>{t(x)}</li>' for x in fc["expect"])
    qs = "".join(t(q) for q in fc["open_questions"])
    st = C["success_triangle"]
    return f'''
<section class="sec tatami" id="parents">
 <div class="wrap">
  {head("parents", "礼", kids["title"], kids["intro"])}
  <div class="mosaic rv">{mos}</div>
  <div class="bens">{bens}</div>
  <div class="fc rv" id="first-class">
   <div class="fc-main">
    <span class="fc-k kj" aria-hidden="true">始</span>
    <h3 class="h3 fc-t">{t(fc["title"])}</h3>
    <div class="fc-cols">
     <div><h4 class="h4">{t(fc["bring_title"])}</h4><ul class="dl">{bring}</ul></div>
     <div><h4 class="h4">{t(fc["expect_title"])}</h4><ol class="nl">{expect}</ol></div>
    </div>
    <div class="qs">{qs}</div>
    {wa(fc["cta"])}
   </div>
   <div class="fc-pics">{img("result-jfp-mascot.jpg", "pic")}{img("result-kids-certificates.jpg", "pic")}</div>
  </div>
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
}


def initials(n):
    return {l: "".join(w[0] for w in n[l].replace("(", "").split()[:2]) for l in LANGS}


def rail_card(n, grp, grp_label):
    ph = n.get("photo")
    face = (img(ph["src"], "portrait", alt="") if ph else
            f'<span class="mono" aria-hidden="true">{t(initials(n["name"]))}</span>')
    bio = f'<p class="rc-bio">{t(n["bio"])}</p>' if n.get("bio") else ""
    return (f'<li class="rc" data-grp="{grp}"><div class="rc-ph{" has-img" if ph else ""}">{face}</div>'
            f'<span class="rc-tag">{t(grp_label)}</span><h4 class="rc-n">{t(n["name"])}</h4>{bio}</li>')


def coaches():
    co = CO
    ks = ["師", "道", "技"]

    def grp(g):
        return [c for c in COACHES if c["group"] == g]

    def photo(c, k):
        ph = c["photo"]
        if isinstance(ph, dict) and ph.get("src"):
            return f'<div class="coach-ph has-img">{img(ph["src"], "portrait", alt=esc(ph["alt"]["en"]))}</div>'
        return f'<div class="coach-ph"><span class="kj" aria-hidden="true">{k}</span></div>'
    cards = "".join(f'''
   <article class="coach rv"><span class="coach-bg kj" aria-hidden="true">{k}</span>
    {photo(c, k)}
    <div class="coach-b"><h3 class="h3 coach-n">{t(c["name"])}</h3><p class="role">{t(c["role"])}</p>
    <p class="bio">{t(c["bio"])}</p><p class="dan">{t(c["dan_rank"])}</p></div></article>'''
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
  <figure class="team rv">{img(tp["src"], "team-img", alt=esc(tp["alt"]["en"]))}</figure>
  <p class="founded rv"><span class="kj" aria-hidden="true">創</span>{t(co["founded_note"])}</p>
  <div class="c-grid">{cards}</div>
  <div class="rail-wrap" id="team-rail">
   <div class="rail-top"><h3 class="h3 grp">{t(RAIL_UI["title"])}</h3>
    <div class="rail-nav"><button type="button" class="rail-btn" data-dir="-1" aria-label="{RAIL_UI["prev"]["en"]}">‹</button><button type="button" class="rail-btn" data-dir="1" aria-label="{RAIL_UI["next"]["en"]}">›</button></div></div>
   <div class="chips" role="group">{chips}</div>
   <ul class="rail" tabindex="0">{rail}</ul>
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
 </div>
 <div class="strip" tabindex="0" role="region" aria-label="Gallery">{strip}</div>
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
    "heading": {"he": "הקבוצות של נתנאל ז׳ורובל", "ru": "Группы Натанеля Журовеля", "en": "Natanel Zhurovel's groups"},
    "season": {"he": "עונת 2026/27", "ru": "Сезон 2026/27", "en": "Season 2026/27"},
    "grade_q": {"he": "באיזו כיתה הילד/ה?", "ru": "В каком классе ребёнок?", "en": "Your child's grade?"},
    "venue_q": {"he": "איפה נוח לכם?", "ru": "Где удобнее?", "en": "Which venue?"},
    "all": {"he": "הכול", "ru": "Все", "en": "All"},
    "today": {"he": "היום", "ru": "сегодня", "en": "today"},
    "none_day": {"he": "אין אימון מתאים ביום הזה", "ru": "В этот день подходящих тренировок нет", "en": "No matching class this day"},
    "none_all": {"he": "לא מצאנו קבוצה מתאימה — כתבו לנו ונמצא פתרון.", "ru": "Подходящей группы не нашлось — напишите нам, подберём.", "en": "No matching group — message us and we'll sort it out."},
    "others": {"he": "לוחות האימונים של שאר המאמנים יעלו בקרוב.", "ru": "Расписание групп других тренеров скоро появится.", "en": "Other coaches' schedules are coming soon."},
    "join": {"he": "הרשמה לקבוצה", "ru": "Записаться", "en": "Join"},
    "wa_msg": {"he": "שלום! אשמח להצטרף לאימון: ", "ru": "Здравствуйте! Хотим записаться на тренировку: ", "en": "Hi! We'd like to join this class: "},
}
DAY_SHORT = {"he": ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"], "ru": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт"], "en": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]}
VENUE_COLOR = {"ein-hayam": "#5aa9e6", "ironi-alef": "#e0414a", "leo-baeck-hadar": "#4fbf7f", "dror-school": "#a47be0"}


def grade_label(g):
    a, b = g
    L = SC["grade_letters_he"]
    if a == 0 and b == 0:
        return {"he": "גן", "ru": "Детский сад", "en": "Kindergarten"}
    if b is None:
        return {"he": f"כיתות {L[a]} ומעלה", "ru": f"{a} класс и старше", "en": f"Grade {a}+"}
    return {"he": f"כיתות {L[a]}–{L[b]}", "ru": f"{a}–{b} класс", "en": f"Grades {a}–{b}"}


def schedule():
    sc, U = C["schedule"], SCHED_UI
    nat = next(c for c in COACHES if c["id"] == "natanel-zhurovel")
    days = ""
    for d in range(6):
        cards = ""
        for s in sorted((x for x in SC["sessions"] if x["day"] == d), key=lambda x: x["start"]):
            hi, lo = s["grades"][0], (s["grades"][1] if s["grades"][1] is not None else 99)
            kind = SC["kinds"][s["kind"]]
            badge = f'<span class="ses-kind k-{s["kind"]}">{t(kind)}</span>' if kind["en"] else ""
            if s.get("subgroup"):
                badge += f'<span class="ses-kind">{t({l: {"he": "קבוצה", "ru": "Группа", "en": "Group"}[l] + " " + str(s["subgroup"]) for l in LANGS})}</span>'
            note = f'<span class="ses-note">{t(s["note"])}</span>' if s.get("note") else ""
            v = VENUES[s["venue"]]
            cards += (f'<li class="ses" data-v="{s["venue"]}" data-g="{hi}-{lo}" style="--vc:{VENUE_COLOR[s["venue"]]}">'
                      f'<span class="ses-time">{ltr(s["start"] + "–" + s["end"])}</span>'
                      f'<span class="ses-grade">{t(grade_label(s["grades"]))}</span>'
                      f'<span class="ses-venue"><i aria-hidden="true"></i>{t({l: v[l] for l in LANGS})}</span>{badge}{note}'
                      f'<a class="ses-wa" href="{WA}" target="_blank" rel="noopener">{WA_SVG}{t(U["join"])}</a></li>')
        name = {l: SC["days"][l][d] for l in LANGS}
        days += (f'<section class="day" data-day="{d}"><h4 class="day-h">{t(name)}<span class="day-today">{t(U["today"])}</span></h4>'
                 f'<ul class="ses-list">{cards}</ul><p class="day-none">{t(U["none_day"])}</p></section>')
    tabs = "".join(f'<button type="button" class="tab" data-tab="{d}" aria-pressed="false">{t({l: DAY_SHORT[l][d] for l in LANGS})}<b class="tab-n"></b></button>' for d in range(6))
    grades = [(-1, U["all"])] + [(0, {"he": "גן", "ru": "Сад", "en": "KG"})] + [
        (g, {"he": SC["grade_letters_he"][g] + ("+" if g == 8 else ""), "ru": f"{g}{'+' if g == 8 else ''}", "en": f"{g}{'+' if g == 8 else ''}"}) for g in range(1, 9)]
    gchips = "".join(f'<button type="button" class="chip" data-grade="{g}" aria-pressed="{str(g == -1).lower()}">{t(lab)}</button>' for g, lab in grades)
    vchips = f'<button type="button" class="chip" data-venue="" aria-pressed="true">{t(U["all"])}</button>' + "".join(
        f'<button type="button" class="chip" data-venue="{k}" aria-pressed="false" style="--vc:{VENUE_COLOR[k]}"><i aria-hidden="true"></i>{t({l: v[l] for l in LANGS})}</button>'
        for k, v in VENUES.items())
    vals = "".join(f'<span data-l="{l}">{" · ".join(SC["values"][l])}</span>' for l in LANGS)
    msg = "".join(f'<span data-l="{l}" class="wa-msg" hidden>{esc(U["wa_msg"][l])}</span>' for l in LANGS)
    return f'''
<section class="sec sched-sec" id="schedule">
 <div class="sched-bg">{img("train-georgia-randori.jpg")}</div>
 <div class="wrap">
  {head("schedule", "稽古", sc["title"])}
  <div class="sc-coach rv">{img(nat["photo"]["src"], "sc-ava", alt="")}
   <div><p class="sc-season">{t(U["season"])}</p><h3 class="h3 grp">{t(U["heading"])}</h3>
   <p class="sc-slogan">{t(SC["slogan"])}</p></div></div>
  <div class="sc-filters">
   <div class="fl"><p class="fl-q">{t(U["grade_q"])}</p><div class="chips" role="group">{gchips}</div></div>
   <div class="fl"><p class="fl-q">{t(U["venue_q"])}</p><div class="chips" role="group">{vchips}</div></div>
  </div>
  <div class="tabs" role="group">{tabs}</div>
  <div class="week" id="week">{days}</div>
  <div class="sc-none">{t(U["none_all"])}{wa(C["kids"]["first_class"]["cta"])}</div>
  <p class="niv"><span class="kj" aria-hidden="true">選</span>{t(sc["nivheret_note"])}</p>
  <p class="sc-vals">{vals}</p>
  <p class="sc-others">{t(U["others"])}</p>
  {msg}
 </div>
</section>'''


BR_UI = {"days": {"he": "ימי אימון", "ru": "Дни тренировок", "en": "Training days"},
         "bus": {"he": "איך מגיעים באוטובוס", "ru": "Как доехать на автобусе", "en": "Bus directions"}}


def branches():
    b = C["branches"]
    v = ""
    for i, (k, vn) in enumerate(VENUES.items()):
        q = urllib.parse.quote(vn["address"]["he"])
        ds = sorted({s["day"] for s in SC["sessions"] if s["venue"] == k})
        days = "".join(f'<span data-l="{l}">{" · ".join(DAY_SHORT[l][d] for d in ds)}</span>' for l in LANGS)
        v += (f'<article class="venue rv" style="--vc:{VENUE_COLOR[k]}"><span class="v-i" aria-hidden="true">0{i+1}</span>'
              f'<h3 class="h3">{t({l: vn[l] for l in LANGS})}</h3><p class="v-addr">{t(vn["address"])}</p><p class="v-note">{t(BR_UI["days"])}: {days}</p>'
              f'<div class="v-links"><a href="https://www.google.com/maps/search/?api=1&amp;query={q}" target="_blank" rel="noopener">Google Maps</a>'
              f'<a href="https://waze.com/ul?q={q}&amp;navigate=yes" target="_blank" rel="noopener">Waze</a>'
              f'<a href="https://www.google.com/maps/dir/?api=1&amp;destination={q}&amp;travelmode=transit" target="_blank" rel="noopener">{t(BR_UI["bus"])}</a></div></article>')
    nb = "".join(f'<li>{t(n["name"])}</li>' for n in b["neighbourhoods"])
    return f'''
<section class="sec tatami" id="branches">
 <div class="wrap">
  {head("branches", "道場", b["title"], b["intro"])}
  <div class="venues v4">{v}</div>
  <!--VENUE_MAP-->
  <ul class="hoods rv">{nb}</ul>
 </div>
</section>'''


def contact():
    co = C["contact"]
    phones = "".join(f'<li><span>{t(p["name"])}</span><a href="tel:{p["tel"]}">{ltr(p["phone"])}</a></li>' for p in co["phones"])
    soc = ""
    for s in co["social"]:
        if s.get("placeholder"):
            soc += t(s)
        else:
            lab = esc(s["label"]) + (f' <bdi dir="ltr">{esc(s["handle"])}</bdi>' if s.get("handle") else "")
            soc += f'<a class="soc" href="{s["url"]}" target="_blank" rel="noopener">{lab} {ARROW}</a>'
    return f'''
<section class="sec contact" id="contact">
 <div class="ct-bg">{img("kids-belts-throw.jpg")}</div>
 <span class="ct-k kj" aria-hidden="true">礼</span>
 <div class="wrap">
  <div class="sh rv"><span class="kicker"><span class="kj" aria-hidden="true">連絡</span>{t(nav_label("contact"))}</span><h2 class="h2 ct-h">{t(co["title"])}</h2><p class="lead">{t(co["text"])}</p></div>
  <div class="ct-grid">
   <div class="ct-card rv">
    {wa(co["whatsapp_cta"]["label"], "wa-big")}
    <ul class="phones">{phones}</ul>
    <p class="mail"><a href="mailto:{co["email"]["value"]}">{ltr(co["email"]["value"])}</a></p>
    <div class="socs">{soc}</div>
   </div>
   <div class="ct-pic rv">{img("belts-air.jpg", "pic")}</div>
  </div>
 </div>
</section>'''


LEGAL_LINKS = "".join(
    f'<span data-l="{l}"><a href="%BASE%{l}/accessibility/">{a}</a> · <a href="%BASE%{l}/privacy/">{p}</a></span>'
    for l, a, p in (("he", "הצהרת נגישות", "מדיניות פרטיות"), ("ru", "Заявление о доступности", "Политика конфиденциальности"),
                    ("en", "Accessibility statement", "Privacy policy")))


def footer():
    f = C["footer"]
    return f'''
<footer class="ft">
 <div class="wrap ft-in">
  <div class="ft-brand"><span class="plate plate-lg"><img src="{PFX}{LOGO}" width="256" height="256" alt="" loading="lazy"></span>
   <div><p class="ft-name">{t(club["name"])}</p><p>{t(f["tagline"])}</p></div></div>
  <div class="ft-meta"><p>{t(f["legal"])} {t(f["amuta_number"])}</p><p class="ft-legal">{LEGAL_LINKS}</p><p class="copy">{t(f["copyright"])}</p></div>
 </div>
</footer>'''


# ---------- success triangle embed ----------
src = (HERE / "success-triangle.html").read_text()
st_css = src[src.index("/* ---------- embeddable section ---------- */"):src.index("/* social-image renders")]
st_sec = src[src.index('<section class="success-triangle"'):src.index("</section>", src.index('<section class="success-triangle"')) + len("</section>")]
st_sec = st_sec.replace('<section class="success-triangle"',
                        '<section class="success-triangle rv" data-theme="night" style="--st-paper:#13110f;--st-ink:#f3ead8;--st-text:#cfc5b2;--st-accent:#e0414a;--st-blossom:#e9a0a8;--st-card:#1c1915"', 1)
TRIANGLE = st_sec
st_fonts = re.findall(r'<link rel="stylesheet" href="(https://fonts.googleapis.com/[^"]+)">', src)

CSS = (HERE / "night.css").read_text()
JS = (HERE / "night.js").read_text()



def render(site):
    global SITE, PFX
    SITE, PFX = site, ("%BASE%" if site else "")  # the site build swaps in its base path
    return header() + "\n<main>" + hero_sec() + ticker() + parents() + coaches() + achievements() + history() + tournaments() + camps() + schedule() + branches() + contact() + "\n</main>" + footer()


body = render(True)
kanji = "".join(sorted({ch for ch in body + "柔道" if "　" <= ch <= "鿿"}))
fonts = [
    "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Rubik:wght@400;500;600;700&family=Secular+One&display=swap",
    "https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&text=" + urllib.parse.quote(kanji) + "&display=swap",
] + st_fonts

(R / "src/generated").mkdir(parents=True, exist_ok=True)
(R / "src/generated/landing.html").write_text(body)
# drop the in-place language switcher: on the site each language is its own URL
site_js, n = re.subn(r"  // the real site has one URL.*?\n  }\n", "", JS, count=1, flags=re.S)
assert n == 1 and "data-set-lang" not in site_js
(R / "src/generated/landing.js").write_text(site_js)
(R / "src/generated/fonts.json").write_text(json.dumps(fonts))
(R / "src/styles/landing.css").write_text(CSS + "\n" + st_css)
print(len(body), "bytes body;", len(set(USED)), "images")

if PREVIEW:
    out = ('<title>Unifight Dojo Night</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
           '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
           + "".join(f'<link rel="stylesheet" href="{html.escape(u)}">\n' for u in fonts)
           + "<style>\n" + CSS + "\n" + st_css + "</style>\n" + render(False) + "\n<script>\n" + JS + "</script>\n")
    PREVIEW.mkdir(parents=True, exist_ok=True)
    (PREVIEW / "night.html").write_text(out)
    print("preview:", PREVIEW / "night.html", "(images: publish with root=public/)")
