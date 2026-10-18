import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, KANJI} from './fonts';
import {EndCard, Flash, Grain, Kanji, Photo, Rise, Vignette, clamp, ease, inOut, photo, useLayout} from './common';
import {NATANEL, SITE, TAGLINE, WHATSAPP} from './text';

// Mistake the Getaway measures 141 BPM and the cut starts on a beat, so beat n is frame n * BEAT.
// The open sits in the track's quiet dip; the name lands where the band comes back in.
const BEAT = (60 / 141) * 30;
const b = (n) => Math.round(n * BEAT);
const T = {intimate: 0, name: b(16), club: b(28), u23: b(40), europe: b(56), riga: b(64), coach: b(72), demo: b(82), end: b(92), hit: b(98), total: 1356};
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

const Letterbox = ({lang}) => {
  const L = useLayout(lang);
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

const Intimate = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const w = ease(f, 6, 140, 0, 1, inOut);
  const fade = ease(f, 0, 50, 0, 1);
  const slitW = L.v ? L.W * 0.7 : 640;
  const slitH = L.v ? L.H * 0.6 : L.H * 0.74;
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <div
        style={{
          position: 'absolute', width: slitW, height: slitH, top: L.v ? '12%' : '13%',
          left: L.v ? (L.W - slitW) / 2 : L.rtl ? '12%' : 'auto', right: L.v ? 'auto' : L.rtl ? 'auto' : '12%',
          clipPath: `inset(0 ${50 - 50 * w}% 0 ${50 - 50 * w}%)`, opacity: fade,
        }}
      >
        <Photo src="natanel-erfurt" focus="50% 20%" dur={dur} zoom={[1.12, 1.0]} />
        <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(5,5,5,.6), transparent 35%)'}} />
      </div>
      <div
        style={{
          position: 'absolute', direction: L.rtl ? 'rtl' : 'ltr',
          ...(L.v ? {left: 80, right: 80, top: '76%', textAlign: 'center'} : {[L.rtl ? 'right' : 'left']: '8%', top: '44%'}),
        }}
      >
        <div style={{height: 2, width: 120 * ease(f, 60, 100, 0, 1), background: C.gold, margin: L.v ? '0 auto 26px' : '0 0 26px'}} />
        <Rise text={NATANEL.raised[lang]} start={70} stagger={5} damping={26} rtl={L.rtl}
          style={{fontFamily: L.display, fontWeight: 500, fontSize: L.v ? 54 : 46, letterSpacing: L.rtl ? 0 : '0.32em', color: C.paper}} />
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

const Name = ({lang}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const letters = NATANEL.patch.split('');
  const pw = L.v ? 900 : 1040;
  return (
    <AbsoluteFill>
      <Fabric />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <Patch w={pw} h={L.v ? 300 : 320} start={0}>
          <div style={{display: 'flex', fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 150 : 170, color: NAVY, letterSpacing: '0.04em'}}>
            {letters.map((ch, i) => (
              <span key={i} style={{opacity: ease(f, 6 + i * 2, 12 + i * 2, 0, 1)}}>{ch}</span>
            ))}
          </div>
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 52, background: NAVY, color: '#f7f5ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 600, fontSize: 34, letterSpacing: '0.5em'}}>ISR</div>
        </Patch>
        <Rise text={NATANEL.json.name[lang]} start={b(4)} stagger={4} damping={22} rtl={L.rtl}
          style={{fontFamily: L.display, fontWeight: 600, fontSize: L.v ? 84 : 76, color: C.paper, marginTop: 56, textTransform: L.upper, letterSpacing: L.rtl ? 0 : '0.06em', textAlign: 'center'}} />
        <div style={{fontFamily: L.body, fontWeight: 500, fontSize: L.v ? 44 : 38, color: C.gold, marginTop: 14, opacity: ease(f, b(6), b(6) + 16, 0, 1), direction: L.rtl ? 'rtl' : 'ltr'}}>
          {NATANEL.json.role[lang]}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Club = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const [head, line] = NATANEL.teen[lang];
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <OffthreadVideo src={staticFile('clips/club-randori.mp4')} muted
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.08 + 0.05 * f / dur})`, filter: 'brightness(.45)'}} />
      <AbsoluteFill style={{background: `linear-gradient(${L.rtl ? 270 : 90}deg, rgba(10,9,8,.85), rgba(10,9,8,.2) 70%)`}} />
      <Kanji text="道" size={L.v ? 560 : 640} start={10} opacity={0.12} style={L.v ? {right: 40, top: 160} : {[L.rtl ? 'left' : 'right']: 120, top: 120}} />
      <div style={{position: 'absolute', direction: L.rtl ? 'rtl' : 'ltr', ...(L.v ? {left: 80, right: 80, top: '48%'} : {[L.rtl ? 'right' : 'left']: 140, top: '34%', width: '56%'})}}>
        <Rise text={head} start={10} stagger={4} damping={22} rtl={L.rtl} style={{fontFamily: L.display, fontWeight: 700, fontSize: L.v ? 110 : 104, color: C.paper, textTransform: L.upper, lineHeight: 1}} />
        <div style={{height: 3, width: 140 * ease(f, 26, 50, 0, 1), background: C.gold, margin: '30px 0 26px'}} />
        <Rise text={line} start={30} stagger={2} damping={22} rtl={L.rtl} style={{fontFamily: L.body, fontWeight: 400, fontSize: L.v ? 50 : 44, color: C.paper, lineHeight: 1.3, opacity: 0.92}} />
      </div>
    </AbsoluteFill>
  );
};

const U23 = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const tside = L.rtl ? 'left' : 'right';
  const n = NATANEL.years.filter((_, i) => f >= OV + b(2 + 2 * i)).length;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, top: 0, height: '56%'} : {top: 0, bottom: 0, [L.rtl ? 'right' : 'left']: 0, width: '40%'})}}>
        <Photo src="natanel-u23" focus="50% 30%" card dur={dur} tilt={L.rtl ? 2 : -2} />
      </div>
      <div
        style={{
          position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: L.v ? 'center' : L.rtl ? 'flex-end' : 'flex-start', gap: 22,
          ...(L.v ? {left: 0, right: 0, top: '59%'} : {[tside]: 130, top: 0, bottom: 0, justifyContent: 'center', width: '48%'}),
        }}
      >
        <div style={{display: 'flex', gap: 20, direction: 'ltr'}}>
          {NATANEL.years.map((y, i) => (
            <Patch key={y} w={L.v ? 290 : 250} h={L.v ? 150 : 130} start={OV + b(2 + 2 * i) - 6}>
              <div style={{fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 104 : 92, color: NAVY}}>{y}</div>
            </Patch>
          ))}
        </div>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 24, direction: L.rtl ? 'rtl' : 'ltr'}}>
          <div style={{fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 200 : 180, color: C.gold, lineHeight: 0.9, minWidth: L.v ? 150 : 140, opacity: n ? 1 : 0}}>{n}×</div>
          <Rise text={NATANEL.u23[lang]} start={OV + b(8)} stagger={3} damping={22} rtl={L.rtl}
            style={{fontFamily: L.display, fontWeight: 600, fontSize: L.v ? 64 : 58, color: C.paper, textTransform: L.upper, lineHeight: 1.05, maxWidth: L.v ? 620 : 520}} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Caption = ({lang, tag, head, sub, start = 14, style}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  return (
    <div style={{position: 'absolute', direction: L.rtl ? 'rtl' : 'ltr', color: C.paper, ...style}}>
      {tag && (
        <div style={{fontFamily: L.display, fontWeight: 600, fontSize: L.v ? 38 : 34, letterSpacing: L.rtl ? 0 : '0.4em', color: C.gold, opacity: ease(f, start, start + 16, 0, 1)}}>{tag}</div>
      )}
      <Rise text={head} start={start + 6} stagger={3} damping={22} rtl={L.rtl}
        style={{fontFamily: L.display, fontWeight: 700, fontSize: L.v ? 96 : 88, lineHeight: 1, textTransform: L.upper, marginTop: 10, textShadow: '0 4px 30px rgba(0,0,0,.6)'}} />
      {sub && (
        <div style={{fontFamily: L.body, fontWeight: 500, fontSize: L.v ? 46 : 42, marginTop: 14, opacity: 0.95 * ease(f, start + 20, start + 36, 0, 1), textShadow: '0 2px 16px rgba(0,0,0,.8)'}}>{sub}</div>
      )}
    </div>
  );
};

const lower = (L) => (L.v ? {left: 80, right: 120, bottom: '19%'} : {[L.rtl ? 'right' : 'left']: 120, bottom: '17%', width: '60%'});

const Sarajevo = ({lang, dur}) => {
  const L = useLayout(lang);
  const [head, sub] = NATANEL.ec[lang];
  return (
    <AbsoluteFill>
      <Photo src="natanel-sarajevo" focus={L.v ? '62% 30%' : '58% 30%'} dur={dur} zoom={[1.04, 1.14]} drift={-30} />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.85), transparent 55%)'}} />
      <Caption lang={lang} tag={NATANEL.sarajevo[lang]} head={head} sub={sub} start={4} style={lower(L)} />
    </AbsoluteFill>
  );
};

const Riga = ({lang, dur}) => {
  const L = useLayout(lang);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, top: 0, height: '62%'} : {top: 0, bottom: 0, [L.rtl ? 'right' : 'left']: 0, width: '64%'})}}>
        <Photo src="natanel-grip" focus={L.v ? "76% 8%" : "72% 25%"} dur={dur} zoom={[1.08, 1.2]} />
      </div>
      <div style={{position: 'absolute', ...(L.v ? {left: 0, right: 0, bottom: 0, height: '38%'} : {top: 0, bottom: 0, [L.rtl ? 'left' : 'right']: 0, width: '36%'})}}>
        <Photo src="natanel-riga" focus="50% 20%" card dur={dur} tilt={L.rtl ? -2 : 2} />
      </div>
      <Caption lang={lang} tag={NATANEL.riga[lang]} head={NATANEL.ec[lang][1]} sub={NATANEL.gp[lang]} start={4}
        style={L.v ? {left: 70, right: 70, top: '44%'} : {[L.rtl ? 'right' : 'left']: 120, bottom: '17%', width: '55%'}} />
    </AbsoluteFill>
  );
};

const Coach = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <OffthreadVideo src={staticFile('clips/natanel-coach.mp4')} muted playbackRate={0.7}
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: L.v ? `${interpolate(f, [0, dur], [30, 18], clamp)}% 50%` : '50% 50%', transform: `scale(${1.08 + 0.06 * f / dur})`, transformOrigin: '30% 50%'}} />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.8), transparent 45%)'}} />
      <Caption lang={lang} head={NATANEL.today[lang]} start={OV + b(1)} style={lower(L)} />
    </AbsoluteFill>
  );
};

const Demo = ({lang, dur}) => {
  const L = useLayout(lang);
  return (
    <AbsoluteFill>
      <Photo src="natanel-demo" focus={L.v ? '35% 40%' : '40% 40%'} dur={dur} zoom={[1.02, 1.1]} drift={L.rtl ? 30 : -30} />
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.8), transparent 50%)'}} />
      <Kanji text="師" size={L.v ? 420 : 460} start={10} opacity={0.85} style={L.v ? {right: 60, top: 140} : {[L.rtl ? 'left' : 'right']: 110, top: 90}} />
      <Caption lang={lang} head={NATANEL.next[lang]} start={16} style={lower(L)} />
    </AbsoluteFill>
  );
};

export const Natanel = ({lang}) => {
  const scenes = [
    [T.intimate, T.name, Intimate, null],
    [T.name, T.club, Name, 'cut'],
    [T.club, T.u23, Club, 'ink'],
    [T.u23, T.europe, U23, 'tatami'],
    [T.europe, T.riga, Sarajevo, 'cut'],
    [T.riga, T.coach, Riga, 'cut'],
    [T.coach, T.demo, Coach, 'tatami'],
    [T.demo, T.end, Demo, 'ink'],
  ];
  const wrap = (kind, el) => (kind === 'ink' ? <InkIn>{el}</InkIn> : kind === 'tatami' ? <TatamiIn>{el}</TatamiIn> : el);
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio src={staticFile('audio/natanel.m4a')} volume={(f) => interpolate(f, [0, 10], [0, 1], clamp)} />
      {scenes.map(([from, to, Scene, kind], i) => {
        const start = i === 0 || kind === 'cut' ? from : from - OV;
        const dur = to + OV - start;
        const el = <Scene lang={lang} dur={dur} />;
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            {wrap(kind, el)}
          </Sequence>
        );
      })}
      <Sequence from={T.end - OV} durationInFrames={T.total - T.end + OV}>
        <InkIn>
          <EndCard lang={lang} dur={T.total - T.end + OV} tagline={TAGLINE[lang]} site={SITE} whatsapp={WHATSAPP} kanji="師" />
        </InkIn>
      </Sequence>
      {scenes.filter((s) => s[3] === 'cut').map(([at]) => (
        <Flash key={at} at={at} len={at === T.name ? 9 : 5} max={at === T.name ? 0.85 : 0.45} />
      ))}
      <Flash at={T.hit} len={8} max={0.3} />
      <Letterbox lang={lang} />
      <Vignette strength={0.6} />
      <Grain opacity={0.14} />
    </AbsoluteFill>
  );
};
