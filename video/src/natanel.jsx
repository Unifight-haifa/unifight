import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from './fonts';
import {EndCard, Flash, Grain, Kanji, Photo, Rise, Row, Tri, Vignette, clamp, ease, inOut, photo, useLayout} from './common';
import {NATANEL, SITE, TAGLINE, WHATSAPP} from './text';

// Mistake the Getaway measures 141 BPM and the cut starts on a beat, so beat n is frame n * BEAT.
// The open sits in the track's quiet dip; the name lands where the band comes back in.
const BEAT = (60 / 141) * 30;
const b = (n) => Math.round(n * BEAT);
const T = {intimate: 0, name: b(16), club: b(28), u23: b(40), europe: b(56), riga: b(64), coach: b(72), portrait: b(82), end: b(92), hit: b(98), total: 1356};
export const NATANEL_FRAMES = T.total;
const OV = 12;
const NAVY = '#1b2d6b';

// ink.png holds the order in which pixels get inked; thresholding it gives a ragged, spreading edge.
let ink = null;
const inkHandle = delayRender('ink');
const inkImg = new Image();
inkImg.onload = () => {
  const c = document.createElement('canvas');
  c.width = inkImg.width;
  c.height = inkImg.height;
  const g = c.getContext('2d');
  g.drawImage(inkImg, 0, 0);
  ink = {w: c.width, h: c.height, v: g.getImageData(0, 0, c.width, c.height).data};
  continueRender(inkHandle);
};
inkImg.src = staticFile('ink.png');

const inkCache = new Map();
const inkMask = (p) => {
  const key = Math.round(p * 200);
  if (inkCache.has(key)) return inkCache.get(key);
  const c = document.createElement('canvas');
  c.width = ink.w;
  c.height = ink.h;
  const g = c.getContext('2d');
  const out = g.createImageData(ink.w, ink.h);
  const t = (key / 200) * 1.25 - 0.1;
  for (let i = 0; i < ink.v.length; i += 4) {
    const a = Math.max(0, Math.min(1, (t - ink.v[i] / 255) * 14));
    out.data[i + 3] = a * 255;
  }
  g.putImageData(out, 0, 0);
  const url = c.toDataURL();
  inkCache.set(key, url);
  return url;
};

const InkIn = ({children, dur = 2 * OV}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, dur], [0, 1], {...clamp, easing: inOut});
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  const url = inkMask(p);
  const m = {maskImage: `url(${url})`, WebkitMaskImage: `url(${url})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%'};
  return <AbsoluteFill style={m}>{children}</AbsoluteFill>;
};

// A tatami strip crosses the frame; the new scene is revealed behind its trailing edge.
const TatamiIn = ({children, dur = 2 * OV + 6}) => {
  const f = useCurrentFrame();
  const {width} = useVideoConfig();
  const bw = width * 0.3;
  const x = interpolate(f, [0, dur], [-bw, width], {...clamp, easing: inOut});
  if (x >= width) return <AbsoluteFill>{children}</AbsoluteFill>;
  const edge = Math.max(0, x + bw * 0.5);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: `inset(0 ${width - edge}px 0 0)`}}>{children}</AbsoluteFill>
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: x, width: bw,
          backgroundImage: `url(${staticFile('tatami.jpg')})`, backgroundSize: '100% auto', backgroundRepeat: 'repeat-y',
          boxShadow: '0 0 60px rgba(0,0,0,.7)',
        }}
      />
    </AbsoluteFill>
  );
};

const Letterbox = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  const open = ease(f, T.coach, T.coach + 40, 0, 1, inOut);
  const h = (L.v ? L.H * 0.06 : L.H * 0.125) * (1 - open);
  return (
    <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000'}} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000'}} />
    </>
  );
};

// {ru: [a, b], ...} -> {ru: a, ...}
const pick = (o, k) => ({he: o.he[k], ru: o.ru[k], en: o.en[k]});

const Intimate = ({dur, out}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const w = ease(f, 6, 140, 0, 1, inOut);
  const fade = ease(f, 0, 50, 0, 1);
  const slitW = L.v ? L.W * 0.7 : 640;
  const slitH = L.v ? L.H * 0.56 : L.H * 0.74;
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <div
        style={{
          position: 'absolute', width: slitW, height: slitH, top: L.v ? '11%' : '13%',
          ...(L.v ? {left: (L.W - slitW) / 2} : {right: '12%'}),
          clipPath: `inset(0 ${50 - 50 * w}% 0 ${50 - 50 * w}%)`, opacity: fade,
        }}
      >
        <Photo src="natanel-erfurt" focus="50% 20%" dur={dur} zoom={[1.12, 1.0]} />
        <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(5,5,5,.6), transparent 35%)'}} />
      </div>
      <div style={{position: 'absolute', ...(L.v ? {left: 60, right: 60, top: '70%'} : {left: '4%', width: '46%', top: '40%'})}}>
        <div style={{height: 2, width: 120 * ease(f, 60, 100, 0, 1), background: C.gold, margin: '0 auto 26px'}} />
        <Tri text={NATANEL.raised} start={70} end={out} size={L.v ? 50 : 46} weight={500} track="0.32em" style={{color: C.paper}} />
      </div>
    </AbsoluteFill>
  );
};

const Fabric = () => (
  <AbsoluteFill
    style={{
      background: `repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 2px, transparent 2px 7px),
        repeating-linear-gradient(-45deg, rgba(0,0,0,.12) 0 2px, transparent 2px 7px),
        radial-gradient(ellipse at 50% 40%, #233a85, #0c1638 75%)`,
    }}
  />
);

const Patch = ({children, w, h, start, style}) => {
  const f = useCurrentFrame();
  const p = ease(f, start, start + 22, 0, 1);
  return (
    <div
      style={{
        width: w, height: h, background: '#f7f5ef', borderRadius: 18, boxShadow: '0 18px 50px rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative',
        opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${1.06 - 0.06 * p})`, filter: `blur(${(1 - p) * 6}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Name = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  const letters = NATANEL.patch.split('');
  const pw = L.v ? 900 : 1040;
  return (
    <AbsoluteFill>
      <Fabric />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: C.paper}}>
        <Patch w={pw} h={L.v ? 300 : 320} start={0}>
          <div style={{display: 'flex', fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 150 : 170, color: NAVY, letterSpacing: '0.04em'}}>
            {letters.map((ch, i) => (
              <span key={i} style={{opacity: ease(f, 6 + i * 2, 12 + i * 2, 0, 1)}}>{ch}</span>
            ))}
          </div>
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 52, background: NAVY, color: '#f7f5ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 600, fontSize: 34, letterSpacing: '0.5em'}}>ISR</div>
        </Patch>
        <Rise text={NATANEL.json.name.en} start={b(4)} stagger={4} damping={22}
          style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: L.v ? 84 : 76, marginTop: 50, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center'}} />
        <Row text={NATANEL.json.name} langs={['he', 'ru']} start={b(4) + 8} size={L.v ? 50 : 44} weight={500} upper={false} style={{marginTop: 8}} />
        <Row text={NATANEL.json.role} start={b(6)} size={L.v ? 40 : 34} font="body" weight={500} upper={false} style={{marginTop: 18, color: C.gold}} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Club = ({dur, out}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <OffthreadVideo src={staticFile('clips/club-randori.mp4')} muted
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.08 + 0.05 * f / dur})`, filter: 'brightness(.45)'}} />
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(10,9,8,.85), rgba(10,9,8,.2) 70%)'}} />
      <Kanji text="道" size={L.v ? 560 : 640} start={10} opacity={0.12} style={L.v ? {right: 40, top: 160} : {right: 120, top: 120}} />
      <div style={{position: 'absolute', color: C.paper, ...(L.v ? {left: 60, right: 60, top: '42%'} : {left: 100, width: '56%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center'})}}>
        <Tri text={pick(NATANEL.teen, 0)} start={10} end={out} size={L.v ? 92 : 84} weight={700} gap={0.06} />
        <div style={{height: 3, width: 140 * ease(f, 26, 50, 0, 1), background: C.gold, margin: '30px auto 26px'}} />
        <Tri text={pick(NATANEL.teen, 1)} start={30} end={out} size={L.v ? 42 : 38} font="body" weight={400} upper={false} gap={0.3} style={{opacity: 0.92}} />
      </div>
    </AbsoluteFill>
  );
};

const U23 = ({dur, out}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const n = NATANEL.years.filter((_, i) => f >= OV + b(2 + 2 * i)).length;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, top: 0, height: '46%'} : {top: 0, bottom: 0, left: 0, width: '40%'})}}>
        <Photo src="natanel-u23" focus="50% 30%" card dur={dur} tilt={-2} />
      </div>
      <div
        style={{
          position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, color: C.paper,
          ...(L.v ? {left: 0, right: 0, top: '49%'} : {right: 80, top: 0, bottom: 0, justifyContent: 'center', width: '52%'}),
        }}
      >
        <div style={{display: 'flex', gap: 20}}>
          {NATANEL.years.map((y, i) => (
            <Patch key={y} w={L.v ? 270 : 250} h={L.v ? 140 : 130} start={OV + b(2 + 2 * i) - 6}>
              <div style={{fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 96 : 92, color: NAVY}}>{y}</div>
            </Patch>
          ))}
        </div>
        <div style={{fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 170 : 160, color: C.gold, lineHeight: 1, opacity: n ? 1 : 0}}>{n}×</div>
        <Tri text={NATANEL.u23} start={OV + b(8)} end={out} size={L.v ? 58 : 54} weight={600} />
      </div>
    </AbsoluteFill>
  );
};

// Two silver discs and the year: the medal count without words.
const Medals = ({start, end}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const gone = end === undefined ? 0 : ease(f, end - 6, end, 0, 1, inOut);
  const disc = (i) => {
    const s = spring({frame: f - start - i * 4, fps, config: {damping: 12, stiffness: 180}});
    return (
      <div key={i} style={{width: 54, height: 54, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff, #c9ced6 45%, #7d848f)', border: '3px solid #e8ebef', boxShadow: '0 6px 18px rgba(0,0,0,.5)', transform: `scale(${s})`}} />
    );
  };
  return (
    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16, opacity: 1 - gone}}>
      {disc(0)}
      {disc(1)}
      <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 48, marginLeft: 12, opacity: ease(f, start + 8, start + 18, 0, 1)}}>2022</div>
    </div>
  );
};

const Caption = ({place, head, sub, medals, start = 14, end, style}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const plate = ease(f, start, start + 10, 0, 0.55) * (end === undefined ? 1 : ease(f, end - 6, end, 1, 0));
  return (
    <div style={{position: 'absolute', display: 'flex', justifyContent: 'center', ...style}}>
      <div style={{color: C.paper, textShadow: '0 3px 24px rgba(0,0,0,.7)', padding: '22px 44px', background: `rgba(10,9,8,${plate})`, borderRadius: 6}}>
      {place && <Row text={place} start={start} end={end} size={L.v ? 34 : 32} track="0.3em" style={{color: C.gold}} />}
      <Tri text={head} start={start + 6} end={end} size={L.v ? 70 : 64} weight={700} gap={0.06} style={{marginTop: place ? 12 : 0}} />
      {medals && <Medals start={start + 20} end={end} />}
      {sub && <Tri text={sub} start={start + 20} end={end} size={L.v ? 40 : 36} font="body" weight={500} upper={false} gap={0.2} style={{marginTop: 16}} />}
      </div>
    </div>
  );
};

const lower = (L) => (L.v ? {left: 40, right: 40, bottom: '19%'} : {left: 80, bottom: '15%', width: '54%'});

const Sarajevo = ({dur, out}) => {
  const L = useLayout();
  return (
    <AbsoluteFill>
      <Photo src="natanel-sarajevo" focus={L.v ? '62% 30%' : '58% 30%'} dur={dur} zoom={[1.04, 1.14]} drift={-30} />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.85), transparent 55%)'}} />
      <Caption place={NATANEL.sarajevo} head={pick(NATANEL.ec, 0)} medals start={4} end={out} style={lower(L)} />
    </AbsoluteFill>
  );
};

const Riga = ({dur, out}) => {
  const L = useLayout();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, top: 0, height: '46%'} : {top: 0, bottom: 0, left: 0, width: '64%'})}}>
        <Photo src="natanel-grip" focus={L.v ? '76% 8%' : '72% 25%'} dur={dur} zoom={[1.08, 1.2]} />
        <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.85), transparent 60%)'}} />
      </div>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, bottom: 0, top: '71%'} : {top: 0, bottom: 0, right: 0, width: '36%'})}}>
        <Photo src="natanel-riga" focus="50% 20%" card dur={dur} tilt={2} />
      </div>
      <Caption place={NATANEL.riga} head={pick(NATANEL.ec, 1)} sub={NATANEL.gp} start={4} end={out}
        style={L.v ? {left: 30, right: 30, top: '46.5%'} : {left: 60, bottom: '14.5%', width: '58%'}} />
    </AbsoluteFill>
  );
};

const Coach = ({dur, out}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <OffthreadVideo src={staticFile('clips/natanel-coach.mp4')} muted playbackRate={0.7}
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: L.v ? `${interpolate(f, [0, dur], [30, 18], clamp)}% 50%` : '50% 50%', transform: `scale(${1.08 + 0.06 * f / dur})`, transformOrigin: '30% 50%'}} />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.85), transparent 50%)'}} />
      <Caption head={NATANEL.today} start={OV + b(1)} end={out} style={lower(L)} />
    </AbsoluteFill>
  );
};

// Studio portrait on white: framed as a card on the judogi-blue fabric of the name scene.
const Portrait = ({dur, out}) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const p = interpolate(f, [0, dur], [0, 1], clamp);
  const k = ease(f, 6, 30, 0, 1);
  const h = L.v ? L.H * 0.44 : L.H * 0.78;
  return (
    <AbsoluteFill>
      <Fabric />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.75), transparent 55%)'}} />
      <Kanji text="師" size={L.v ? 250 : 460} start={10} opacity={0.85} style={L.v ? {right: 50, top: '12%'} : {left: 150, top: 80}} />
      <div style={{position: 'absolute', top: L.v ? '10%' : (L.H - h) / 2, ...(L.v ? {left: 90} : {right: '12%'})}}>
        <div style={{position: 'absolute', inset: 0, background: C.gold, transform: 'translate(16px, 16px)', opacity: k}} />
        <Img src={photo('natanel-portrait')}
          style={{
            position: 'relative', display: 'block', height: h, width: h * 0.726, objectFit: 'cover', objectPosition: '50% 20%',
            border: `12px solid ${C.paper}`, boxShadow: '0 30px 80px rgba(0,0,0,.6)', opacity: k,
            transform: `translateY(${(1 - k) * 50}px) rotate(${-2 + p}deg) scale(${1 + 0.04 * p})`, filter: `blur(${(1 - k) * 8}px)`,
          }} />
      </div>
      <Caption head={NATANEL.next} start={16} end={out}
        style={L.v ? {left: 40, right: 40, top: '63%'} : {left: 80, bottom: '14%', width: '52%'}} />
    </AbsoluteFill>
  );
};

export const Natanel = () => {
  const scenes = [
    [T.intimate, T.name, Intimate, null],
    [T.name, T.club, Name, 'cut'],
    [T.club, T.u23, Club, 'ink'],
    [T.u23, T.europe, U23, 'tatami'],
    [T.europe, T.riga, Sarajevo, 'cut'],
    [T.riga, T.coach, Riga, 'cut'],
    [T.coach, T.portrait, Coach, 'tatami'],
    [T.portrait, T.end, Portrait, 'ink'],
  ];
  const startOf = ([from, , , kind], i) => (i === 0 || kind === 'cut' ? from : from - OV);
  const wrap = (kind, el) => (kind === 'ink' ? <InkIn>{el}</InkIn> : kind === 'tatami' ? <TatamiIn>{el}</TatamiIn> : el);
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio src={staticFile('audio/natanel.m4a')} volume={(f) => interpolate(f, [0, 10], [0, 1], clamp)} />
      {scenes.map((sc, i) => {
        const start = startOf(sc, i);
        const dur = sc[1] + OV - start;
        // Captions leave before the next scene's transition begins.
        const out = (scenes[i + 1] ? startOf(scenes[i + 1], i + 1) : T.end - OV) - start;
        const Scene = sc[2];
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            {wrap(sc[3], <Scene dur={dur} out={out} />)}
          </Sequence>
        );
      })}
      <Sequence from={T.end - OV} durationInFrames={T.total - T.end + OV}>
        <InkIn>
          <EndCard dur={T.total - T.end + OV} tagline={TAGLINE} site={SITE} whatsapp={WHATSAPP} kanji="師" />
        </InkIn>
      </Sequence>
      {scenes.filter((s) => s[3] === 'cut').map(([at]) => (
        <Flash key={at} at={at} len={at === T.name ? 9 : 5} max={at === T.name ? 0.85 : 0.45} />
      ))}
      <Flash at={T.hit} len={8} max={0.3} />
      <Letterbox />
      <Vignette strength={0.6} />
      <Grain opacity={0.14} />
    </AbsoluteFill>
  );
};
