import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SITE, WHATSAPP} from './data';
import {C, fontsFor} from './fonts';
import {Flash, Grain, Kanji, LightLeak, Rise, Vignette, ease} from './fx';
import {CLUB, COPY, CUTS, PFPS} from './promoData';

const F = (s) => Math.round(s * PFPS);
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
// Shared grade on top of the per-source prep, so phone, WhatsApp and cinema clips read as one film.
const GRADE = 'contrast(1.06) saturate(0.9) sepia(0.08) brightness(0.97)';
const LOW_RES = 'saturate(0.7) contrast(1.12)';

const useL = (lang) => {
  const {width, height} = useVideoConfig();
  return {v: height > width, W: width, H: height, rtl: lang === 'he', ...fontsFor(lang)};
};

const cover = (focus) => ({position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus});

// A short sideways smear into each cut instead of a plain hard cut.
const Whip = ({dir, children}) => {
  const f = useCurrentFrame();
  const p = ease(f, 0, 6, 1, 0);
  return (
    <AbsoluteFill style={{transform: `translateX(${dir * p * 9}%)`, filter: p > 0.02 ? `blur(${p * 18}px)` : 'none'}}>
      {children}
    </AbsoluteFill>
  );
};

const ClipShot = ({shot, dur, L}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = f / dur;
  const vid = (style) => (
    <OffthreadVideo
      src={staticFile(`promo/clips/${shot.src}.mp4`)}
      trimBefore={F(shot.at)}
      playbackRate={shot.rate ?? 1}
      muted
      style={style}
    />
  );
  if (!shot.panel) {
    const z = (shot.zoom ?? 1.03) + 0.05 * p;
    return <AbsoluteFill style={{transform: `translateY(${shot.y ?? 0}%) scale(${z})`, transformOrigin: shot.focus ?? 'center'}}>{vid(cover(shot.focus))}</AbsoluteFill>;
  }
  // WhatsApp-grade footage: kept small and framed, over a blurred copy of itself.
  const punch = shot.punch ? 1 + 0.12 * (1 - spring({frame: f, fps, config: {damping: 14, stiffness: 120}})) : 1;
  const w = L.v ? 1000 : 1100;
  const box = {position: 'absolute', width: w, height: (w * 9) / 16, left: (L.W - w) / 2, top: L.v ? 470 : 70};
  return (
    <AbsoluteFill>
      {vid({...cover('center'), filter: 'blur(28px) brightness(0.4) saturate(0.7)', transform: 'scale(1.2)'})}
      <div style={{...box, overflow: 'hidden', outline: `3px solid ${C.gold}`, outlineOffset: 10, boxShadow: '0 30px 90px rgba(0,0,0,.7)', transform: `scale(${(1 + 0.04 * p) * punch})`}}>
        {vid({...cover('center'), filter: LOW_RES})}
      </div>
    </AbsoluteFill>
  );
};

// Photos get depth: a blurred layer drifts one way while the picture turns slightly in 3D.
const PhotoShot = ({shot, dur, L, dir}) => {
  const f = useCurrentFrame();
  const p = f / dur;
  const src = staticFile(`promo/photos/${shot.src}.jpg`);
  const {card} = shot;
  return (
    <AbsoluteFill style={{perspective: 1400, background: C.ink}}>
      <Img src={src} style={{...cover('center'), filter: 'blur(30px) brightness(0.42)', transform: `scale(1.3) translateX(${-dir * (p - 0.5) * 60}px)`}} />
      {card ? (
        <div style={{position: 'absolute', inset: L.v ? '22% 6% 30%' : '8% 14% 10%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Img
            src={src}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: `12px solid ${C.paper}`,
              boxShadow: '0 40px 90px rgba(0,0,0,.65)',
              transform: `rotateY(${dir * (6 - 9 * p)}deg) rotateZ(${dir * -1.5}deg) scale(${0.95 + 0.07 * p})`,
            }}
          />
        </div>
      ) : (
        <Img
          src={src}
          style={{
            ...cover(shot.focus ?? 'center'),
            transform: `rotateY(${dir * (2.5 - 5 * p)}deg) scale(${(shot.zoom ?? 1.06) + 0.08 * p}) translateX(${dir * (p - 0.5) * 30}px)`,
          }}
        />
      )}
      {shot.dim && <AbsoluteFill style={{background: C.ink, opacity: shot.dim}} />}
    </AbsoluteFill>
  );
};

const Shot = ({shot, dur, L, i}) => {
  const f = useCurrentFrame();
  const dir = (i % 2 ? -1 : 1) * (L.rtl ? -1 : 1);
  const body = shot.kind === 'v' ? <ClipShot shot={shot} dur={dur} L={L} /> : <PhotoShot shot={shot} dur={dur} L={L} dir={dir} />;
  const fade = shot.fadeIn ? ease(f, 0, shot.fadeIn, 0, 1) : 1;
  return (
    <AbsoluteFill style={{opacity: fade}}>
      {i > 0 && !shot.fadeIn ? <Whip dir={dir}>{body}</Whip> : body}
    </AbsoluteFill>
  );
};

// Cinema bars for the quiet beats; consecutive letterboxed shots share one set.
const Letterbox = ({shots, L}) => {
  const f = useCurrentFrame();
  if (L.v) return null;
  const ranges = [];
  shots.forEach((s) => {
    if (!s.lb) return;
    const last = ranges[ranges.length - 1];
    if (last && Math.abs(last[1] - s.from) < 0.01) last[1] = s.to;
    else ranges.push([s.from, s.to]);
  });
  const a = Math.max(0, ...ranges.map(([x, y]) => interpolate(f, [F(x) - 10, F(x), F(y) - 8, F(y)], [0, 1, 1, 0], clamp)));
  const h = ((L.H - L.W / 2.39) / 2) * a;
  return (
    <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000'}} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000'}} />
    </>
  );
};

const Line = ({line, lang, L, dur}) => {
  const f = useCurrentFrame();
  const out = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  const text = COPY[line.key][lang];
  const display = {fontFamily: L.display, fontWeight: 600, color: C.paper, textTransform: L.upper, textShadow: '0 4px 24px rgba(0,0,0,.85)'};
  if (line.zone === 'cta') {
    const sizes = L.v ? [84, 44, 42] : [88, 52, 46];
    const top = (L.v ? [600, 830, 900] : [300, 470, 550])[line.row];
    return (
      <div style={{position: 'absolute', left: 70, right: 70, top, textAlign: 'center', opacity: out}}>
        <Rise
          text={text}
          rtl={L.rtl}
          start={0}
          style={{
            ...display, fontSize: sizes[line.row], lineHeight: 1.15,
            fontFamily: line.row ? L.body : L.display, fontWeight: line.row ? 500 : 600,
            color: line.row === 1 ? C.gold : C.paper, textTransform: line.row ? 'none' : L.upper,
          }}
        />
      </div>
    );
  }
  const size = L.v ? 74 : 70;
  const bar = ease(f, 2, 14, 0, 1);
  return (
    <AbsoluteFill style={{opacity: out}}>
      <AbsoluteFill style={{background: `linear-gradient(0deg, rgba(10,9,8,.72), transparent ${L.v ? 42 : 38}%)`, opacity: ease(f, 0, 10, 0, 1)}} />
      <div
        dir={L.rtl ? 'rtl' : 'ltr'}
        style={{position: 'absolute', left: L.v ? 70 : 140, right: L.v ? 70 : 140, bottom: L.v ? 470 : 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}
      >
        <div style={{height: 6, width: 110 * bar, background: line.big ? C.gold : C.red, marginBottom: 22}} />
        <Rise text={text} rtl={L.rtl} start={2} stagger={2} style={{...display, fontSize: size, lineHeight: 1.12, maxWidth: L.v ? 940 : 1500}} />
      </div>
    </AbsoluteFill>
  );
};

const LogoBug = ({L}) => (
  <div style={{position: 'absolute', top: L.v ? 90 : 46, [L.rtl ? 'left' : 'right']: L.v ? 60 : 56, width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', background: '#fff', opacity: 0.75}}>
    <Img src={staticFile('logo.png')} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
  </div>
);

const EndCard = ({lang, L, dur}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f, fps, config: {damping: 12, stiffness: 140}});
  const row = (d) => ({opacity: ease(f, d, d + 12, 0, 1), transform: `translateY(${ease(f, d, d + 16, 24, 0)}px)`});
  const fade = interpolate(f, [dur - 20, dur - 1], [0, 1], clamp);
  const logo = L.v ? 320 : 280;
  return (
    <AbsoluteFill style={{background: C.ink, alignItems: 'center', justifyContent: 'center', color: C.paper, textAlign: 'center', paddingBottom: L.v ? 200 : 0}}>
      <LightLeak seed={3} strength={0.3} />
      <Kanji text="道" size={L.v ? 1000 : 900} opacity={0.06} vertical={false} style={{left: '50%', top: '50%', transform: 'translate(-50%,-52%)'}} />
      <div style={{width: logo, height: logo, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `5px solid ${C.gold}`, transform: `scale(${1.5 - 0.5 * s})`, opacity: Math.min(1, s * 2)}}>
        <Img src={staticFile('logo.png')} style={{width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.04)'}} />
      </div>
      <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: L.v ? 92 : 86, letterSpacing: '0.18em', marginTop: 34, ...row(6)}}>UNIFIGHT HAIFA</div>
      <div style={{width: 220 * ease(f, 12, 28, 0, 1), height: 4, background: C.gold, margin: '18px 0 26px'}} />
      <div dir={L.rtl ? 'rtl' : 'ltr'} style={{fontFamily: L.body, fontSize: L.v ? 46 : 40, opacity: 0.88, ...row(14)}}>{CLUB[lang]}</div>
      <div style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 52 : 48, color: C.gold, marginTop: 40, letterSpacing: '0.03em', ...row(22)}}>{SITE}</div>
      <div dir="ltr" style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 52 : 48, marginTop: 10, letterSpacing: '0.03em', ...row(28)}}>{WHATSAPP}</div>
      <Flash at={0} len={10} color={C.gold} max={0.6} />
      <AbsoluteFill style={{background: '#000', opacity: fade}} />
    </AbsoluteFill>
  );
};

const Sfx = ({at, name, volume = 1}) => (
  <Sequence from={Math.max(0, F(at))} layout="none">
    <Audio src={staticFile(`promo/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

export const promoLength = (format) => F(CUTS[format].total) + 6;

export const Promo = ({lang, format}) => {
  const L = useL(lang);
  const cut = CUTS[format];
  const total = promoLength(format);
  const endFrom = F(cut.end);
  const flashes = cut.shots.filter((s) => s.flash).map((s) => s.from);
  return (
    <AbsoluteFill style={{background: C.ink}}>
      {cut.music.map((m, k) => {
        const len = F(m.to - m.from);
        return (
          <Sequence key={k} from={F(m.at)} durationInFrames={len + 1} layout="none">
            <Audio
              src={staticFile('promo/hero-suite-a.ogg')}
              trimBefore={F(m.from)}
              // tiny fades hide clicks where the edit jumps inside the track
              volume={(f) => Math.min(k ? interpolate(f, [0, 2], [0, 1], clamp) : 1, interpolate(f, [len - 2, len], [1, 0], clamp))}
            />
          </Sequence>
        );
      })}
      <Sfx at={0} name="heart" volume={0.8} />
      <Sfx at={1.2} name="breath" volume={1} />
      {flashes.map((t) => <Sfx key={t} at={t - 0.3} name="whoosh" volume={0.35} />)}
      <Sfx at={cut.drop - 1.1} name="slomo" volume={0.4} />
      <Sfx at={cut.drop} name="hit" volume={0.7} />
      <Sfx at={cut.end} name="hit" volume={0.6} />

      <AbsoluteFill style={{filter: GRADE}}>
        {cut.shots.map((s, i) => (
          <Sequence key={i} from={F(s.from)} durationInFrames={F(s.to) - F(s.from)}>
            <Shot shot={s} dur={F(s.to) - F(s.from)} L={L} i={i} />
          </Sequence>
        ))}
      </AbsoluteFill>
      <LightLeak strength={0.16} />
      {flashes.map((t) => <Flash key={t} at={F(t)} len={5} max={0.45} />)}
      <Flash at={F(cut.drop)} len={12} max={0.85} />
      <Vignette />
      <Letterbox shots={cut.shots} L={L} />
      {cut.marks.map((m, k) => (
        <Sequence key={k} from={F(m.from)} durationInFrames={F(m.to) - F(m.from)} layout="none">
          <Kanji text={m.k} size={L.v ? 120 : 110} start={4} opacity={0.45} style={{top: L.v ? 210 : 150, [L.rtl ? 'left' : 'right']: L.v ? 70 : 66}} />
        </Sequence>
      ))}
      <Sequence from={F(cut.shots[1].from)} durationInFrames={endFrom - F(cut.shots[1].from)} layout="none">
        <LogoBug L={L} />
      </Sequence>
      {cut.lines.map((l, k) => (
        <Sequence key={k} from={F(l.from)} durationInFrames={F(l.to) - F(l.from)}>
          <Line line={l} lang={lang} L={L} dur={F(l.to) - F(l.from)} />
        </Sequence>
      ))}
      <Sequence from={endFrom} durationInFrames={total - endFrom}>
        <EndCard lang={lang} L={L} dur={total - endFrom} />
      </Sequence>
      <Grain />
    </AbsoluteFill>
  );
};
