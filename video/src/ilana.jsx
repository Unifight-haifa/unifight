import {AbsoluteFill, Audio, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, KANJI} from './fonts';
import {EndCard, Flash, Grain, Photo, Row, Tri, Vignette, clamp, ease, inOut, photo, useLayout} from './common';
import {ILANA, SITE, TAGLINE, WHATSAPP} from './text';

// Heroic Age measures 130.01 BPM and the cut starts on a downbeat, so beat n is frame n * BEAT.
// Title lands on the full-band entrance; station arrivals (+2 beats) fall on downbeats.
const BEAT = (60 / 130.01) * 30;
const b = (n) => Math.round(n * BEAT);
const T = {open: 0, title: b(8), journey: b(22), today: b(70), end: b(80), hit: b(86), total: 1300};
const stAt = (i) => b(22 + 8 * i);
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

// Shots speed up with the drum build.
const OPEN_AT = [0, 2, 4, 5, 6, 7].map(b);

const Open = () => {
  const f = useCurrentFrame();
  const i = OPEN_AT.findLastIndex((a) => a <= f);
  const k = f - OPEN_AT[i];
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
      <Flash at={OPEN_AT[i]} len={4} max={0.55} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(194,35,46,.28), transparent 40%)', mixBlendMode: 'multiply'}} />
    </AbsoluteFill>
  );
};

const Title = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const name = ILANA.json.name;
  const [first, ...rest] = name.en.split(' ');
  const slab = spring({frame: f - 4, fps, config: {damping: 13, stiffness: 170}});
  const D = ILANA.disciplines;
  const panel = ease(f, 0, 12, 0, 1);
  const size = L.v ? 150 : 190;
  const big = {fontFamily: 'Oswald', fontWeight: 700, fontSize: size, lineHeight: 0.95, color: C.paper, textTransform: 'uppercase'};
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div
        style={{
          position: 'absolute', top: 0, bottom: L.v ? '50%' : 0, right: 0, width: L.v ? '100%' : '46%',
          clipPath: L.v ? `inset(0 0 ${100 - 100 * panel}% 0)` : `polygon(${100 - 100 * panel + 12}% 0, 100% 0, 100% 100%, ${100 - 100 * panel}% 100%)`,
        }}
      >
        <Photo src="ilana-bw" focus="50% 22%" dur={T.journey - T.title} zoom={[1.15, 1.04]} />
      </div>
      <div
        style={{
          position: 'absolute', left: L.v ? 50 : 60, width: L.v ? L.W - 100 : '50%', top: L.v ? '52%' : 0, bottom: 0,
          display: 'flex', flexDirection: 'column', justifyContent: L.v ? 'flex-start' : 'center', alignItems: 'center', textAlign: 'center',
        }}
      >
        <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 30, letterSpacing: '0.4em', color: C.gold, opacity: ease(f, 4, 14, 0, 1)}}>UNIFIGHT HAIFA</div>
        <div style={{...big, marginTop: 10, transform: `translateX(${-(1 - slab) * 140}px)`, opacity: slab}}>{first}</div>
        <div style={{position: 'relative', marginTop: 6}}>
          <div style={{position: 'absolute', inset: '6% -24px 2% -24px', background: C.red, transform: `scaleX(${slab})`, transformOrigin: 'left'}} />
          <div style={{...big, position: 'relative', clipPath: `inset(0 ${100 - ease(f, 8, 20, 0, 100)}% 0 0)`}}>{rest.join(' ')}</div>
        </div>
        <Row text={name} langs={['he', 'ru']} start={16} size={L.v ? 48 : 46} weight={500} upper={false} style={{marginTop: 24, color: C.paper}} />
        <div style={{display: 'flex', gap: 54, marginTop: 34}}>
          {D.en.map((_, i) => {
            const at = b(4 + 2 * i);
            const s = spring({frame: f - at, fps, config: {damping: 11, stiffness: 200}});
            return (
              <div key={i} style={{opacity: Math.min(1, s * 2), transform: `scale(${1.5 - 0.5 * s})`, color: i === D.en.length - 1 ? C.gold : C.paper}}>
                <Tri text={{he: D.he[i], ru: D.ru[i], en: D.en[i]}} start={at - 2} stagger={4} size={46} weight={700} track="0.06em" gap={0.04} />
              </div>
            );
          })}
        </div>
      </div>
      {D.en.map((_, i) => <Flash key={i} at={b(4 + 2 * i)} len={4} color={C.red} max={0.25} />)}
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
  const idx = Math.max(0, ST.findLastIndex((_, i) => stAt(i) <= f));
  const k = f - stAt(idx);
  const t = idx === 0 ? 1 : interpolate(k, [0, b(2)], [0, 1], {...clamp, easing: inOut});
  const p = ST[Math.max(0, idx - 1)];
  const q = ST[idx];
  const lon = p.lon + (q.lon - p.lon) * t;
  const lat = p.lat + (q.lat - p.lat) * t;
  const far = Math.hypot(q.lon - p.lon, q.lat - p.lat);
  const base = L.v ? 0.62 : 0.78;
  // Beat kick on the map, harder at every station.
  const kick = f < T.today ? (1 - (((f - T.journey) / BEAT) % 1)) ** 4 * 0.01 * (1 + idx * 0.6) : 0;
  let z = base * (1 - Math.min(0.45, far / 260) * Math.sin(Math.PI * t)) * (1 + kick);
  let ax = L.v ? 0.5 : 0.3;
  let ay = L.v ? 0.3 : 0.4;
  let cx = mx(lon), cy = my(lat);
  if (f >= T.today) {
    const w = ease(f, T.today, T.today + 40, 0, 1, inOut);
    z = z + ((L.v ? 0.26 : 0.32) - z) * w;
    cx = cx + (mx(32) - cx) * w;
    cy = cy + (my(14) - cy) * w;
    ax = ax + ((L.v ? 0.5 : 0.36) - ax) * w;
    ay = ay + (0.5 - ay) * w;
  }
  return {idx, k, t, z, x: L.W * ax - cx * z, y: L.H * ay - cy * z};
};

const MapLayer = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  const cam = camera(f, L);
  const done = f >= T.today ? ST.length : cam.idx;
  const pulse = (((f - T.journey) % BEAT) + BEAT) % BEAT / BEAT;
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
                  <text x={16} y={-14} fill={C.paper} fontFamily="Oswald" fontWeight={600} fontSize={26} letterSpacing="0.12em">{s.place.en}</text>
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
const Counter = () => {
  const L = useLayout();
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
  const out = f >= T.today ? ease(f, T.today, T.today + 12, 1, 0) : 1;
  return (
    <div style={{position: 'absolute', top: L.v ? 200 : 64, left: L.v ? 70 : 90, opacity: out}}>
      <div style={{display: 'flex', height: H, overflow: 'hidden', fontFamily: 'Oswald', fontWeight: 700, fontSize: H, lineHeight: `${H}px`, color: 'rgba(212,168,75,.14)', WebkitTextStroke: `4px ${C.gold}`}}>
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
      <div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, color: C.paper}}>
        <span style={{width: 34, height: 4, background: C.red}} />
        <Row key={cam.idx} text={s.place} start={stAt(cam.idx)} size={30} track="0.2em" />
      </div>
    </div>
  );
};

const PRESS = {he: 'עיתונות', ru: 'ПРЕССА', en: 'PRESS'};

const Cards = ({s, dur}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exit = ease(f, dur - 8, dur, 0, 1, inOut);
  return (
    <AbsoluteFill style={{transform: `translateX(${-exit * 160}px)`, opacity: 1 - exit, filter: `blur(${exit * 10}px)`}}>
      {s.cards.map((c, i) => {
        const at = b(2 + i / 2);
        const sp = spring({frame: f - at, fps, config: {damping: 12, stiffness: 190, mass: 0.8}});
        const shake = f - at > 0 && f - at < 5 ? (random(`c${f}${i}`) - 0.5) * 10 : 0;
        const x = L.v ? 0.5 - c.w * 0.85 + (c.x - 0.6) * 1.2 : c.x;
        const w = L.v ? c.w * 1.6 : c.w;
        const y = L.v ? 0.36 + c.y * 0.45 : c.y;
        return (
          <div key={i} style={{position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, opacity: Math.min(1, sp * 2), transform: `translate(${shake}px, ${shake}px) rotate(${c.rot + (1 - sp) * 10}deg) scale(${1.35 - 0.35 * sp})`}}>
            <div style={{position: 'absolute', inset: 0, background: C.red, transform: 'translate(14px, 14px)'}} />
            <Img src={photo(c.src)} style={{position: 'relative', display: 'block', width: '100%', border: `8px solid ${C.paper}`, boxShadow: '0 30px 70px rgba(0,0,0,.6)', filter: c.press ? 'sepia(.18) contrast(1.05)' : 'none'}} />
            {c.press && (
              <div style={{position: 'absolute', top: -24, left: 18, background: C.ink, color: C.gold, padding: '6px 14px', border: `2px solid ${C.gold}`}}>
                <Row text={PRESS} start={at - 4} stagger={2} size={22} weight={700} track="0.2em" />
              </div>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Latin headline; Hebrew and Cyrillic beneath only when they differ from it.
const Headline = ({text, size, start, align = 'center'}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sp = spring({frame: f - start, fps, config: {damping: 12, stiffness: 160}});
  const same = text.he === text.en && text.ru === text.en;
  return (
    <>
      <div style={{fontFamily: 'Oswald', fontWeight: 700, fontSize: size, lineHeight: 0.9, color: C.gold, textShadow: `8px 8px 0 ${C.red}`, textTransform: 'uppercase', whiteSpace: 'nowrap', transform: `scale(${1.5 - 0.5 * sp})`, transformOrigin: `${align} bottom`, opacity: Math.min(1, sp * 2)}}>
        {text.en}
      </div>
      {!same && <Row text={text} langs={['he', 'ru']} start={start + 4} size={44} weight={600} style={{marginTop: 18, color: C.gold}} />}
    </>
  );
};

const Credential = ({s, dur}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const exit = ease(f, dur - 6, dur, 0, 1, inOut);
  const size = s.big.en.length > 4 ? 130 : L.v ? 170 : 180;
  return (
    <div
      style={{
        position: 'absolute', bottom: L.v ? 360 : 92, left: L.v ? 60 : 50, width: L.v ? L.W - 120 : '49%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', color: C.paper, opacity: 1 - exit,
      }}
    >
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 22}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <Headline text={s.big} size={size} start={b(2)} />
        </div>
        <div style={{fontFamily: KANJI, fontSize: 58, lineHeight: 1.02, color: C.paper, background: C.red, padding: '8px 8px 10px', writingMode: 'vertical-rl', opacity: ease(f, b(2.5), b(2.5) + 6, 0, 1), transform: `scale(${ease(f, b(2.5), b(2.5) + 8, 1.6, 1)})`, marginBottom: 6}}>
          {s.kanji}
        </div>
      </div>
      <Tri text={s.line} start={b(2.5)} end={dur} stagger={4} size={L.v ? 50 : 44} weight={600} gap={0.06} style={{marginTop: 22}} />
      {s.sub && <Tri text={s.sub} start={b(3)} end={dur} stagger={4} size={L.v ? 34 : 30} font="body" weight={500} upper={false} gap={0.15} style={{marginTop: 14, opacity: 0.85}} />}
    </div>
  );
};

const Today = ({dur}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const open = ease(f, 6, b(2), 0, 1, inOut);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: 0, bottom: L.v ? '50%' : 0, right: 0, width: L.v ? '100%' : '40%', clipPath: L.v ? `inset(0 0 ${100 - open * 100}% 0)` : `inset(0 0 0 ${100 - open * 100}%)`}}>
        <Photo src="ilana-coach" focus="50% 20%" dur={dur} zoom={[1.1, 1.0]} />
        <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(10,9,8,.55), transparent 30%)'}} />
      </div>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 28% 78%, rgba(10,9,8,.85), transparent 55%)', opacity: ease(f, b(2), b(3), 0, 1)}} />
      <div style={{position: 'absolute', left: L.v ? 60 : 60, bottom: L.v ? 380 : 110, width: L.v ? L.W - 120 : '54%', display: 'flex', flexDirection: 'column', alignItems: 'center', color: C.paper}}>
        <Headline text={ILANA.today} size={L.v ? 170 : 190} start={b(2) - 2} />
        <Tri text={ILANA.todayLine} start={b(3)} end={dur} size={L.v ? 52 : 50} weight={600} gap={0.08} style={{marginTop: 26}} />
      </div>
    </AbsoluteFill>
  );
};

export const Ilana = () => {
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio
        src={staticFile('audio/ilana.m4a')}
        volume={(f) => interpolate(f, [0, 2, T.total - 20, T.total - 1], [0, 1, 1, 0], clamp)}
      />
      <Sequence from={T.journey} durationInFrames={T.end - T.journey}>
        <Sequence from={-T.journey}>
          <MapLayer />
        </Sequence>
      </Sequence>
      <Sequence durationInFrames={T.title}>
        <Open />
      </Sequence>
      <Sequence from={T.title} durationInFrames={T.journey - T.title}>
        <Title />
      </Sequence>
      {ST.map((s, i) => (
        <Sequence key={i} from={stAt(i)} durationInFrames={b(8)}>
          <Cards s={s} dur={b(8)} />
          <Credential s={s} dur={b(8)} />
        </Sequence>
      ))}
      <Sequence from={T.journey} durationInFrames={T.today + 12 - T.journey}>
        <Sequence from={-T.journey}>
          <Counter />
        </Sequence>
      </Sequence>
      <Sequence from={T.today} durationInFrames={T.end - T.today}>
        <Today dur={T.end - T.today} />
      </Sequence>
      <Sequence from={T.end} durationInFrames={T.total - T.end}>
        <EndCard dur={T.total - T.end} tagline={TAGLINE} site={SITE} whatsapp={WHATSAPP} />
      </Sequence>
      {[T.journey, ...ST.map((_, i) => stAt(i) + b(2)), T.today, T.end].map((a, i) => (
        <Flash key={i} at={a} len={5} max={0.5} />
      ))}
      <Flash at={T.title} len={9} max={0.85} />
      <Flash at={T.hit} len={8} max={0.3} />
      <Vignette />
      <Grain opacity={0.2} />
    </AbsoluteFill>
  );
};
