import {AbsoluteFill, Audio, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, KANJI} from './fonts';
import {EndCard, Flash, Grain, Photo, Rise, Vignette, clamp, ease, inOut, photo, useLayout} from './common';
import {ILANA, SITE, TAGLINE, WHATSAPP} from './text';

// Mountain Emperor runs at 120 BPM: one beat is exactly 15 frames at 30 fps.
const BEAT = 15;
const T = {open: 0, title: 90, journey: 240, station: 120, today: 960, end: 1110, total: 1283};
export const ILANA_FRAMES = T.total;

// Must match the projection in scripts/prep_media.py.
const MAP = {lon0: -80, lat1: 75, ppd: 20, w: 5200, h: 2300};
const mx = (lon) => (lon - MAP.lon0) * MAP.ppd;
const my = (lat) => (MAP.lat1 - lat) * MAP.ppd;
const ST = ILANA.stations;

const OPEN = [
  ['ilana-bout-3', '72% 40%'],
  ['ilana-bout-4', '40% 30%'],
  ['ilana-bout-5', '38% 30%'],
  ['ilana-bout-44', '35% 40%'],
  ['ilana-bout', '30% 35%'],
  ['ilana-bout-57', '45% 40%'],
];

const Open = () => {
  const f = useCurrentFrame();
  const i = Math.min(OPEN.length - 1, Math.floor(f / BEAT));
  const k = f - i * BEAT;
  const [src, focus] = OPEN[i];
  const punch = ease(k, 0, 7, 1.14, 1.0);
  const shake = k < 4 ? (random(`s${f}`) - 0.5) * 18 : 0;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Img
        src={photo(src)}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus,
          transform: `scale(${punch}) translate(${shake}px, ${-shake / 2}px)`,
          filter: 'contrast(1.12) saturate(1.1)',
        }}
      />
      <Flash at={i * BEAT} len={4} max={0.55} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(194,35,46,.28), transparent 40%)', mixBlendMode: 'multiply'}} />
    </AbsoluteFill>
  );
};

const Title = ({lang}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [first, ...rest] = ILANA.json.name[lang].split(' ');
  const slab = spring({frame: f - 4, fps, config: {damping: 13, stiffness: 170}});
  const words = ILANA.disciplines[lang];
  const side = L.rtl ? 'left' : 'right';
  const tside = L.rtl ? 'right' : 'left';
  const panel = ease(f, 0, 12, 0, 1);
  const size = L.v ? 170 : 210;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div
        style={{
          position: 'absolute', top: 0, bottom: L.v ? '45%' : 0, [side]: 0, width: L.v ? '100%' : '46%',
          clipPath: L.v ? `inset(0 0 ${100 - 100 * panel}% 0)` : `polygon(${L.rtl ? `0 0, ${88 * panel}% 0, ${100 * panel}% 100%, 0 100%` : `${100 - 100 * panel + 12}% 0, 100% 0, 100% 100%, ${100 - 100 * panel}% 100%`})`,
        }}
      >
        <Photo src="ilana-bw" focus="50% 22%" dur={150} zoom={[1.15, 1.04]} />
      </div>
      <div
        style={{
          position: 'absolute', [tside]: L.v ? 70 : 110, [side]: L.v ? 70 : 'auto', top: L.v ? '54%' : 0, bottom: 0,
          display: 'flex', flexDirection: 'column', justifyContent: L.v ? 'flex-start' : 'center',
          alignItems: L.rtl ? 'flex-end' : 'flex-start', direction: L.rtl ? 'rtl' : 'ltr',
        }}
      >
        <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 30, letterSpacing: '0.4em', color: C.gold, opacity: ease(f, 4, 14, 0, 1)}}>UNIFIGHT HAIFA</div>
        <div style={{fontFamily: L.display, fontWeight: 700, fontSize: size, lineHeight: 0.95, color: C.paper, textTransform: L.upper, marginTop: 10, transform: `translateX(${(L.rtl ? 1 : -1) * (1 - slab) * 140}px)`, opacity: slab}}>
          {first}
        </div>
        <div style={{position: 'relative', marginTop: 6}}>
          <div style={{position: 'absolute', inset: '6% -24px 2% -24px', background: C.red, transform: `scaleX(${slab})`, transformOrigin: L.rtl ? 'right' : 'left'}} />
          <div style={{position: 'relative', fontFamily: L.display, fontWeight: 700, fontSize: size, lineHeight: 0.95, color: C.paper, textTransform: L.upper, clipPath: `inset(0 ${L.rtl ? 0 : 100 - ease(f, 8, 20, 0, 100)}% 0 ${L.rtl ? 100 - ease(f, 8, 20, 0, 100) : 0}%)`}}>
            {rest.join(' ')}
          </div>
        </div>
        <div style={{display: 'flex', gap: 26, marginTop: 40, flexWrap: 'wrap'}}>
          {words.map((w, i) => {
            const at = 2 * BEAT + i * BEAT * 2;
            const s = spring({frame: f - at, fps, config: {damping: 11, stiffness: 200}});
            return (
              <div key={i} style={{fontFamily: L.display, fontWeight: 700, fontSize: L.v ? 64 : 58, letterSpacing: L.rtl ? 0 : '0.06em', color: i === words.length - 1 ? C.gold : C.paper, opacity: Math.min(1, s * 2), transform: `scale(${1.7 - 0.7 * s})`, WebkitTextStroke: i === 1 ? `2px ${C.paper}` : 'none', WebkitTextFillColor: i === 1 ? 'transparent' : undefined}}>
                {w}
              </div>
            );
          })}
        </div>
      </div>
      {words.map((_, i) => <Flash key={i} at={2 * BEAT + i * BEAT * 2} len={4} color={C.red} max={0.25} />)}
    </AbsoluteFill>
  );
};

// Quadratic arc between two venues, lifted toward the north.
const arc = (a, b) => {
  const [x1, y1, x2, y2] = [mx(a.lon), my(a.lat), mx(b.lon), my(b.lat)];
  const d = Math.hypot(x2 - x1, y2 - y1);
  return `M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - d * 0.28} ${x2},${y2}`;
};

const camera = (f, L) => {
  // Where we are: station index + move progress, or a wide view for "today".
  const local = f - T.journey;
  const idx = Math.max(0, Math.min(ST.length - 1, Math.floor(local / T.station)));
  const k = local - idx * T.station;
  const t = idx === 0 ? 1 : interpolate(k, [0, 22], [0, 1], {...clamp, easing: inOut});
  const a = ST[Math.max(0, idx - 1)];
  const b = ST[idx];
  const lon = a.lon + (b.lon - a.lon) * t;
  const lat = a.lat + (b.lat - a.lat) * t;
  const far = Math.hypot(b.lon - a.lon, b.lat - a.lat);
  const base = L.v ? 0.62 : 0.78;
  let z = base * (1 - Math.min(0.45, far / 260) * Math.sin(Math.PI * t));
  let ax = L.v ? 0.5 : L.rtl ? 0.7 : 0.3;
  let ay = L.v ? 0.3 : 0.4;
  let cx = mx(lon), cy = my(lat);
  if (f >= T.today) {
    const w = ease(f, T.today, T.today + 40, 0, 1, inOut);
    z = z + ((L.v ? 0.26 : 0.32) - z) * w;
    cx = cx + (mx(32) - cx) * w;
    cy = cy + (my(14) - cy) * w;
    ax = ax + ((L.v ? 0.5 : L.rtl ? 0.64 : 0.36) - ax) * w;
    ay = ay + (0.5 - ay) * w;
  }
  return {idx, k, t, z, x: L.W * ax - cx * z, y: L.H * ay - cy * z};
};

const MapLayer = ({lang}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const cam = camera(f, L);
  const done = f >= T.today ? ST.length : cam.idx;
  const pulse = (f % 30) / 30;
  return (
    <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: MAP.w, height: MAP.h, transformOrigin: '0 0', transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`}}>
        <Img src={staticFile('map.png')} style={{position: 'absolute', inset: 0, width: MAP.w, height: MAP.h, opacity: 0.55}} />
        <svg width={MAP.w} height={MAP.h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          {ST.slice(1).map((s, i) => {
            const n = i + 1;
            const p = n < done ? 1 : n === done ? (f >= T.today ? 1 : cam.t) : 0;
            if (p <= 0) return null;
            return (
              <path key={n} d={arc(ST[i], s)} pathLength={1} fill="none" stroke={C.red} strokeWidth={5 / cam.z}
                strokeDasharray={`${p} 1`} strokeLinecap="round" />
            );
          })}
          {ST.map((s, i) => {
            if (i > done || (i === done && cam.t < 1 && f < T.today)) return null;
            const cur = i === cam.idx && f < T.today;
            return (
              <g key={i} transform={`translate(${mx(s.lon)},${my(s.lat)}) scale(${1 / cam.z})`}>
                {cur && <circle r={14 + 40 * pulse} fill="none" stroke={C.red} strokeWidth={3} opacity={1 - pulse} />}
                <circle r={cur ? 13 : 9} fill={cur ? C.red : C.gold} stroke={C.ink} strokeWidth={3} />
                {f >= T.today && i < ST.length - 1 && (
                  <text x={16} y={-14} fill={C.paper} fontFamily="Oswald" fontWeight={600} fontSize={26} letterSpacing="0.12em">{s.place[lang === 'he' ? 'en' : lang]}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(10,9,8,.8) 100%)'}} />
    </AbsoluteFill>
  );
};

// Year odometer: the ones digit rolls continuously, others snap.
const Counter = ({lang}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const cam = camera(f, L);
  const s = ST[cam.idx];
  const prev = ST[Math.max(0, cam.idx - 1)];
  const y0 = prev.year ?? 2013;
  const y1 = s.year;
  const show = y1 !== null;
  const v = show ? y0 + (y1 - y0) * cam.t : 0;
  const digits = String(Math.floor(v)).padStart(4, '0').split('');
  const frac = v - Math.floor(v);
  const H = L.v ? 150 : 132;
  const place = s.place[lang];
  const out = f >= T.today ? ease(f, T.today, T.today + 12, 1, 0) : 1;
  return (
    <div style={{position: 'absolute', top: L.v ? 120 : 64, [L.rtl ? 'right' : 'left']: L.v ? 70 : 90, opacity: out, direction: 'ltr', textAlign: L.rtl ? 'right' : 'left'}}>
      <div style={{display: 'flex', height: H, overflow: 'hidden', fontFamily: 'Oswald', fontWeight: 700, fontSize: H, lineHeight: `${H}px`, color: 'rgba(212,168,75,.14)', WebkitTextStroke: `4px ${C.gold}`, justifyContent: L.rtl ? 'flex-end' : 'flex-start'}}>
        {show ? digits.map((d, i) => {
          const roll = i === 3 ? frac : 0;
          const n = Number(d);
          return (
            <div key={i} style={{transform: `translateY(${-roll * H}px)`}}>
              <div>{n}</div>
              <div>{(n + 1) % 10}</div>
            </div>
          );
        }) : null}
      </div>
      <div style={{fontFamily: L.display, fontWeight: 600, fontSize: 34, letterSpacing: L.rtl ? 0 : '0.3em', color: C.paper, marginTop: 10}}>
        <span style={{display: 'inline-block', width: 34, height: 4, background: C.red, verticalAlign: 'middle', margin: L.rtl ? '0 0 0 14px' : '0 14px 0 0'}} />
        {place}
      </div>
    </div>
  );
};

const PRESS = {ru: 'ПРЕССА', he: 'עיתונות', en: 'PRESS'};

const Cards = ({s, lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exit = ease(f, dur - 8, dur, 0, 1, inOut);
  return (
    <AbsoluteFill style={{transform: `translateX(${(L.rtl ? 1 : -1) * exit * 160}px)`, opacity: 1 - exit, filter: `blur(${exit * 10}px)`}}>
      {s.cards.map((c, i) => {
        const at = 22 + i * 5;
        const sp = spring({frame: f - at, fps, config: {damping: 12, stiffness: 190, mass: 0.8}});
        const shake = f - at > 0 && f - at < 5 ? (random(`c${f}${i}`) - 0.5) * 10 : 0;
        const x = L.v ? 0.5 - c.w * 0.85 + (c.x - 0.6) * 1.2 : L.rtl ? 1 - c.x - c.w : c.x;
        const w = L.v ? c.w * 1.6 : c.w;
        const y = L.v ? 0.36 + c.y * 0.45 : c.y;
        return (
          <div key={i} style={{position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, opacity: Math.min(1, sp * 2), transform: `translate(${shake}px, ${shake}px) rotate(${c.rot + (1 - sp) * 10}deg) scale(${1.35 - 0.35 * sp})`}}>
            <div style={{position: 'absolute', inset: 0, background: C.red, transform: 'translate(14px, 14px)'}} />
            <Img src={photo(c.src)} style={{position: 'relative', display: 'block', width: '100%', border: `8px solid ${C.paper}`, boxShadow: '0 30px 70px rgba(0,0,0,.6)', filter: c.press ? 'sepia(.18) contrast(1.05)' : 'none'}} />
            {c.press && (
              <div style={{position: 'absolute', top: -22, [L.rtl ? 'right' : 'left']: 18, background: C.ink, color: C.gold, fontFamily: L.display, fontWeight: 700, fontSize: 24, letterSpacing: L.rtl ? 0 : '0.3em', padding: '6px 14px', border: `2px solid ${C.gold}`}}>
                {PRESS[lang]}
              </div>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Credential = ({s, lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sp = spring({frame: f - 30, fps, config: {damping: 12, stiffness: 160}});
  const exit = ease(f, dur - 8, dur, 0, 1, inOut);
  const big = s.big[lang];
  const size = big.length > 4 ? (L.v ? 150 : 170) : L.v ? 230 : 250;
  return (
    <div
      style={{
        position: 'absolute', bottom: L.v ? 220 : 80, [L.rtl ? 'right' : 'left']: L.v ? 70 : 90, width: L.v ? '85%' : '46%',
        direction: L.rtl ? 'rtl' : 'ltr', color: C.paper, opacity: 1 - exit, transform: `translateY(${exit * 40}px)`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 22}}>
        <div dir="auto" style={{fontFamily: L.display, fontWeight: 700, fontSize: size, lineHeight: 0.9, color: C.gold, textShadow: `8px 8px 0 ${C.red}`, transform: `scale(${1.5 - 0.5 * sp})`, transformOrigin: L.rtl ? 'right bottom' : 'left bottom', opacity: Math.min(1, sp * 2), whiteSpace: 'nowrap', textTransform: L.upper}}>
          {big}
        </div>
        <div style={{fontFamily: KANJI, fontSize: 58, lineHeight: 1.02, color: C.paper, background: C.red, padding: '8px 8px 10px', writingMode: 'vertical-rl', opacity: ease(f, 34, 40, 0, 1), transform: `scale(${ease(f, 34, 42, 1.6, 1)})`, marginBottom: 6}}>
          {s.kanji}
        </div>
      </div>
      <Rise text={s.line[lang]} start={36} rtl={L.rtl} style={{fontFamily: L.display, fontWeight: 600, fontSize: L.v ? 64 : 56, lineHeight: 1.08, textTransform: L.upper, marginTop: 26}} />
      {s.sub && (
        <div dir="auto" style={{fontFamily: L.body, fontWeight: 500, fontSize: L.v ? 40 : 34, lineHeight: 1.3, marginTop: 14, textAlign: L.rtl ? 'right' : 'left', opacity: 0.85 * ease(f, 44, 56, 0, 1), textWrap: 'balance'}}>
          {s.sub[lang]}
        </div>
      )}
    </div>
  );
};

const Today = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const side = L.rtl ? 'left' : 'right';
  const open = ease(f, 30, 52, 0, 1, inOut);
  const sp = spring({frame: f - 44, fps, config: {damping: 13, stiffness: 150}});
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: 0, bottom: L.v ? '48%' : 0, [side]: 0, width: L.v ? '100%' : '40%', clipPath: L.v ? `inset(0 0 ${100 - open * 100}% 0)` : `inset(0 ${L.rtl ? 100 - open * 100 : 0}% 0 ${L.rtl ? 0 : 100 - open * 100}%)`}}>
        <Photo src="ilana-coach" focus="50% 20%" dur={dur} zoom={[1.1, 1.0]} />
        <AbsoluteFill style={{background: `linear-gradient(${L.rtl ? 270 : 90}deg, rgba(10,9,8,.55), transparent 30%)`}} />
      </div>
      <div style={{position: 'absolute', [L.rtl ? 'right' : 'left']: L.v ? 70 : 90, bottom: L.v ? 260 : 110, width: L.v ? '85%' : '52%', direction: L.rtl ? 'rtl' : 'ltr', color: C.paper}}>
        <div style={{fontFamily: L.display, fontWeight: 700, fontSize: L.v ? 170 : 190, lineHeight: 0.9, color: C.gold, textShadow: `8px 8px 0 ${C.red}`, textTransform: L.upper, transform: `scale(${1.4 - 0.4 * sp})`, transformOrigin: L.rtl ? 'right bottom' : 'left bottom', opacity: Math.min(1, sp * 2)}}>
          {ILANA.today[lang]}
        </div>
        <Rise text={ILANA.todayLine[lang]} start={54} rtl={L.rtl} style={{fontFamily: L.display, fontWeight: 600, fontSize: L.v ? 64 : 58, lineHeight: 1.1, textTransform: L.upper, marginTop: 30}} />
      </div>
    </AbsoluteFill>
  );
};

export const Ilana = ({lang}) => {
  const st = (i) => T.journey + i * T.station;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio
        src={staticFile('audio/ilana.m4a')}
        volume={(f) => interpolate(f, [0, 2, T.total - 20, T.total - 1], [0, 1, 1, 0], clamp)}
      />
      <Sequence from={T.journey} durationInFrames={T.end - T.journey}>
        <Sequence from={-T.journey}>
          <MapLayer lang={lang} />
        </Sequence>
      </Sequence>
      <Sequence durationInFrames={T.title}>
        <Open />
      </Sequence>
      <Sequence from={T.title} durationInFrames={T.journey - T.title}>
        <Title lang={lang} />
      </Sequence>
      {ST.map((s, i) => (
        <Sequence key={i} from={st(i)} durationInFrames={T.station}>
          <Cards s={s} lang={lang} dur={T.station} />
          <Credential s={s} lang={lang} dur={T.station} />
        </Sequence>
      ))}
      <Sequence from={T.journey} durationInFrames={T.today + 12 - T.journey}>
        <Sequence from={-T.journey}>
          <Counter lang={lang} />
        </Sequence>
      </Sequence>
      <Sequence from={T.today} durationInFrames={T.end - T.today}>
        <Today lang={lang} dur={T.end - T.today} />
      </Sequence>
      <Sequence from={T.end} durationInFrames={T.total - T.end}>
        <EndCard lang={lang} dur={T.total - T.end} tagline={TAGLINE[lang]} site={SITE} whatsapp={WHATSAPP} />
      </Sequence>
      {[T.title, T.journey, ...ST.map((_, i) => st(i) + 22), T.today, T.end].map((a, i) => (
        <Flash key={i} at={a} len={5} max={0.5} />
      ))}
      <Vignette />
      <Grain opacity={0.2} />
    </AbsoluteFill>
  );
};
