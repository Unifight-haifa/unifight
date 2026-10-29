(() => {
  const H = document.documentElement, LANGS = ['he', 'ru', 'en'];

  const hd = document.getElementById('hd');
  const solid = () => hd.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', solid, { passive: true });
  solid();
  document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => { a.closest('details').open = false; }));
  addEventListener('keydown', e => {
    const m = document.querySelector('.menu[open]');
    if (e.key === 'Escape' && m) { m.open = false; m.querySelector('summary').focus(); }
  });
  document.querySelector('.tk-pause')?.addEventListener('click', e => {
    e.currentTarget.setAttribute('aria-pressed', H.classList.toggle('still'));
  });

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px' });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));
  }
})();

(() => {
  const sec = document.getElementById('schedule');
  if (!sec) return;
  document.documentElement.classList.add('js');
  const days = [...sec.querySelectorAll('.day')], tabs = [...sec.querySelectorAll('.tab')];
  const store = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) {} return v; };
  let grade = +(store('uf-grade') ?? -1), venue = store('uf-venue') || '', coach = store('uf-coach') || '';
  const sel = sec.querySelector('[data-venue-sel]');
  if (![...sel.options].some(o => o.value === venue)) venue = '';
  // Saturday has no classes, so the week view opens on Sunday
  const wd = new Date().getDay(), today = wd === 6 ? 0 : wd;
  let shown = today;
  const press = (sel, on) => sec.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', on(b)));
  const apply = () => {
    let total = 0;
    days.forEach((d, i) => {
      let n = 0;
      d.querySelectorAll('.ses:not([hidden])').forEach(s => {
        const [a, b] = s.dataset.g ? s.dataset.g.split('-').map(Number) : [NaN, NaN];
        const ok = (grade < 0 || (a <= grade && grade <= b)) && (!venue || s.dataset.v === venue) && (!coach || s.dataset.c === coach);
        s.classList.toggle('off', !ok); n += ok;
      });
      d.classList.toggle('empty', !n); d.classList.toggle('shown', i === shown); total += n;
      tabs[i].querySelector('.tab-n').textContent = n || '–';
    });
    tabs.forEach((t, i) => t.setAttribute('aria-pressed', i === shown));
    press('[data-grade]', b => +b.dataset.grade === grade);
    press('[data-coach]', b => b.dataset.coach === coach);
    sel.value = venue;
    sec.querySelector('.sc-none').classList.toggle('on', !total);
    sec.querySelector('.sc-count b').textContent = total;
  };
  days[today]?.classList.add('is-today'); tabs[today]?.classList.add('is-today');
  sec.addEventListener('click', e => {
    const b = e.target.closest('button, .ses-wa');
    if (!b) return;
    if (b.dataset.grade !== undefined) store('uf-grade', grade = +b.dataset.grade);
    else if (b.dataset.coach !== undefined) store('uf-coach', coach = b.dataset.coach);
    else if (b.dataset.tab !== undefined) shown = +b.dataset.tab;
    else if (b.classList.contains('ses-wa')) {
      // prefill the class details in the visitor's language
      const s = b.closest('.ses'), L = document.documentElement.lang;
      const txt = [...s.querySelectorAll(`.ses-time, :is(.ses-grade, .ses-venue, .ses-coach, .ses-kind) [data-l=${L}]`)].map(x => x.textContent.trim());
      const day = b.closest('.day').querySelector(`.day-h [data-l=${L}]`).textContent;
      const vg = b.closest('.vg')?.querySelector(`.vg-h > [data-l=${L}]`);
      if (vg) txt.push(vg.textContent);
      b.href = b.href.split('?')[0] + '?text=' + encodeURIComponent(sec.querySelector(`.wa-msg[data-l=${L}]`).textContent + day + ', ' + txt.join(', '));
      return;
    }
    apply();
  });
  // Consent.astro forwards 'ga' events to GA4, and only after the visitor accepts
  const viewed = () => document.dispatchEvent(new CustomEvent('ga', { detail: { name: 'schedule_view', params: { venue: venue || 'all' } } }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { viewed(); io.disconnect(); } });
    io.observe(sec.querySelector('.week'));
  }
  sel.addEventListener('change', () => { store('uf-venue', venue = sel.value); apply(); viewed(); });
  apply();
})();

(() => {
  const v = document.querySelector('.film-v');
  if (!v) return;
  const btn = document.querySelector('.film-pause');
  // the loop is decoration: it waits for a visitor who wants motion and data, and for the box to be in view
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData, seen = false;
  const sync = () => {
    btn.setAttribute('aria-pressed', paused);
    if (!paused && seen && !document.hidden) v.play().catch(() => {}); else v.pause();
  };
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: 0.5 }).observe(v);
  document.addEventListener('visibilitychange', sync);
  btn.addEventListener('click', () => { paused = !paused; sync(); });
  sync();
})();

(() => {
  const w = document.getElementById('team-rail');
  if (!w) return;
  document.documentElement.classList.add('js');
  const rail = w.querySelector('.rail');
  w.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dir) {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      rail.scrollBy({ left: +b.dataset.dir * rail.clientWidth * 0.8, behavior: calm ? 'auto' : 'smooth' });
      return;
    }
    const g = b.dataset.grp;
    w.querySelectorAll('[data-grp]').forEach(c => c.tagName === 'BUTTON'
      ? c.setAttribute('aria-pressed', c.dataset.grp === g) : (c.hidden = !!g && c.dataset.grp !== g));
    rail.scrollTo({ left: 0 });
  });
})();

(() => {
  const f = document.getElementById('lead-f');
  if (!f) return;
  const L = document.documentElement.lang, el = f.elements, done = document.getElementById('lead-done');
  const tel = () => el.phone.value.replace(/[\s().-]/g, '');
  // Israeli mobile, landline or 07x number, written 0…, 972… or +972…
  const check = () => el.phone.setCustomValidity(/^(?:\+?9720?|0)(?:[57]\d{8}|[2-489]\d{7})$/.test(tel()) ? '' : f.dataset.badPhone);
  el.phone.addEventListener('input', check);
  // a venue card or a schedule venue opens the form with its hall chosen
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-hall]');
    if (a) el.hall.value = a.dataset.hall;
  });
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k]).trim();
  const wa = text => f.dataset.wa + '?text=' + encodeURIComponent(text);
  f.addEventListener('submit', e => {
    e.preventDefault();
    check();
    if (!f.reportValidity()) return;
    const opt = el.hall.selectedOptions[0], who = f.querySelector('[name=who]:checked').parentNode;
    const v = { name: el.name.value.trim(), phone: el.phone.value.trim(), age: el.age.value, hall: opt.label,
      who: who.querySelector(`[data-l=${L}]`).textContent, message: el.message.value.trim() };
    const show = viaWa => {
      done.querySelector('.lf-ok-msg').hidden = viaWa;
      done.querySelector('.lf-wa-msg').hidden = !viaWa;
      // if the POST failed the details still reach the club through this button
      done.querySelector('[data-after-wa]').href = wa(viaWa ? fill(f.dataset.tpl, v) : fill(f.dataset.after, v));
      const g = done.querySelector('[data-after-group]');
      if (opt.dataset.group) { g.href = opt.dataset.group; g.hidden = false; }
      f.hidden = true; done.hidden = false; done.focus();
    };
    // honeypot filled: a bot, so it gets the thank-you and nothing is sent
    if (el.website.value) return show(false);
    document.dispatchEvent(new CustomEvent('ga', { detail: { name: 'lead_submit', params: { venue: el.hall.value || 'none', method: f.dataset.endpoint ? 'form' : 'whatsapp' } } }));
    if (!f.dataset.endpoint) { open(wa(fill(f.dataset.tpl, v)), '_blank', 'noopener'); return show(true); }
    const body = new URLSearchParams(new FormData(f));
    body.set('phone', tel()); body.set('lang', L); body.set('hall_name', v.hall);
    // Apps Script sends no CORS headers, so the response is opaque; reaching it is the success signal
    fetch(f.dataset.endpoint, { method: 'POST', mode: 'no-cors', body }).then(() => show(false), () => show(true));
  });
})();
