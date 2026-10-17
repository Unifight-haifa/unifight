(() => {
  const H = document.documentElement, LANGS = ['he', 'ru', 'en'];

  const hd = document.getElementById('hd');
  const solid = () => hd.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', solid, { passive: true });
  solid();
  document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => { a.closest('details').open = false; }));

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
  let grade = +(store('uf-grade') ?? -1), venue = store('uf-venue') || '';
  // Saturday has no classes, so the week view opens on Sunday
  const wd = new Date().getDay(), today = wd === 6 ? 0 : wd;
  let shown = today;
  const press = (sel, on) => sec.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', on(b)));
  const apply = () => {
    let total = 0;
    days.forEach((d, i) => {
      let n = 0;
      d.querySelectorAll('.ses').forEach(s => {
        const [a, b] = s.dataset.g.split('-').map(Number);
        const ok = (grade < 0 || (a <= grade && grade <= b)) && (!venue || s.dataset.v === venue);
        s.classList.toggle('off', !ok); n += ok;
      });
      d.classList.toggle('empty', !n); d.classList.toggle('shown', i === shown); total += n;
      tabs[i].querySelector('.tab-n').textContent = n || '–';
    });
    tabs.forEach((t, i) => t.setAttribute('aria-pressed', i === shown));
    press('[data-grade]', b => +b.dataset.grade === grade);
    press('[data-venue]', b => b.dataset.venue === venue);
    sec.querySelector('.sc-none').classList.toggle('on', !total);
  };
  days[today]?.classList.add('is-today'); tabs[today]?.classList.add('is-today');
  sec.addEventListener('click', e => {
    const b = e.target.closest('button, .ses-wa');
    if (!b) return;
    if (b.dataset.grade !== undefined) store('uf-grade', grade = +b.dataset.grade);
    else if (b.dataset.venue !== undefined) store('uf-venue', venue = b.dataset.venue);
    else if (b.dataset.tab !== undefined) shown = +b.dataset.tab;
    else if (b.classList.contains('ses-wa')) {
      // prefill the class details in the visitor's language
      const s = b.closest('.ses'), L = document.documentElement.lang;
      const txt = [...s.querySelectorAll(`.ses-time, :is(.ses-grade, .ses-venue, .ses-kind) [data-l=${L}]`)].map(x => x.textContent.trim());
      const day = b.closest('.day').querySelector(`.day-h [data-l=${L}]`).textContent;
      b.href = b.href.split('?')[0] + '?text=' + encodeURIComponent(sec.querySelector(`.wa-msg[data-l=${L}]`).textContent + day + ', ' + txt.join(', '));
      return;
    }
    apply();
  });
  apply();
})();
