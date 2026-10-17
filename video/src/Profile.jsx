import {AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {COACHES, SITE, UI, WHATSAPP, at, timeline} from './data';
import {C, KANJI, fontsFor} from './fonts';
import {Flash, Grain, Kanji, LightLeak, Photo, Rise, Sweep, Vignette, ease} from './fx';

const useLayout = (lang) => {
  const {width, height} = useVideoConfig();
  const v = height > width;
  return {v, rtl: lang === 'he', W: width, H: height, ...fontsFor(lang)};
};

// Photo panel with a diagonal edge that wipes in. Landscape: one side; vertical: top.
const Panel = ({L, children, side, size = 0.56}) => {
  const f = useCurrentFrame();
  const p = ease(f, 0, 16, 0, 1);
  let clip;
  if (L.v) {
    const b = 100 * p;
    clip = `polygon(0 0, 100% 0, 100% ${b * 0.94}%, 0 ${b}%)`;
  } else if (side === 'right') {
    const x = 100 - 100 * p;
    clip = `polygon(${x + 6}% 0, 100% 0, 100% 100%, ${x}% 100%)`;
  } else {
    const x = 100 * p;
    clip = `polygon(0 0, ${x}% 0, ${x - 6}% 100%, 0 100%)`;
  }
  const box = L.v
    ? {left: 0, top: 0, width: '100%', height: `${size * 100}%`}
    : {top: 0, height: '100%', width: `${size * 100}%`, [side]: 0};
  return <div style={{position: 'absolute', overflow: 'hidden', clipPath: clip, ...box}}>{children}</div>;
};

const textBox = (L, side, size = 0.56) =>
  L.v
    ? {position: 'absolute', left: 80, right: 100, top: `${size * 100 + 2}%`, bottom: 330}
    : {position: 'absolute', top: 0, bottom: 0, width: `${(1 - size) * 100 - 6}%`, [side]: '4%'};

const Open = ({c, dur}) => {
  const L = useLayout('en');
  return (
    <AbsoluteFill style={{background: C.ink}}>
      {c.open.map((o, i) => (
        <Sequence key={i} from={at(i)} durationInFrames={i === 2 ? dur - at(2) : at(i + 1) - at(i)}>
          {L.v ? (
            <>
              <Photo src={o.src} focus={o.focus} card dur={24} />
              <div style={{position: 'absolute', left: 0, right: 0, top: '18%', height: '64%', overflow: 'hidden'}}>
                <Photo src={o.src} focus={o.focus} dur={24} zoom={[1.0, 1.08]} />
              </div>
            </>
          ) : (
            <Photo src={o.src} focus={o.focus} dur={24} zoom={i === 1 ? [1.0, 1.06] : [1.04, 1.14]} />
          )}
          <Flash at={0} len={5} max={0.45} />
        </Sequence>
      ))}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(10,9,8,.25), transparent 30%, transparent 70%, rgba(10,9,8,.45))'}} />
    </AbsoluteFill>
  );
};

const Name = ({c, lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const [first, ...rest] = c.json.name[lang].split(' ');
  const side = L.rtl ? 'left' : 'right';
  const tside = L.rtl ? 'right' : 'left';
  const bar = ease(f, 14, 34, 0, 1);
  const nameSize = L.v ? 150 : 168;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Kanji
        text="柔道"
        size={L.v ? 340 : 440}
        start={4}
        opacity={0.16}
        style={L.v ? {[side]: 40, top: '50%'} : {[side]: '45%', top: 40}}
      />
      <Panel L={L} side={side} size={L.v ? 0.52 : 0.5}>
        <Photo src={c.hero.src} focus={c.hero.focus} dur={dur} zoom={[1.12, 1.02]} drift={0} />
        <AbsoluteFill style={{background: L.v ? 'linear-gradient(0deg, rgba(10,9,8,.7), transparent 35%)' : `linear-gradient(${L.rtl ? 270 : 90}deg, rgba(10,9,8,.6), transparent 30%)`}} />
      </Panel>
      <div
        style={{
          ...textBox(L, tside, L.v ? 0.52 : 0.5),
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          direction: L.rtl ? 'rtl' : 'ltr', color: C.paper,
        }}
      >
        <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 30, letterSpacing: '0.35em', color: C.gold, opacity: ease(f, 6, 20, 0, 1), direction: 'ltr', textAlign: L.rtl ? 'right' : 'left'}}>
          UNIFIGHT HAIFA
        </div>
        <Rise
          text={first}
          by={L.rtl ? 'word' : 'char'}
          start={6}
          stagger={1.5}
          rtl={L.rtl}
          style={{fontFamily: L.display, fontWeight: 700, fontSize: nameSize, lineHeight: 1.02, textTransform: L.upper, marginTop: 18}}
        />
        <Rise
          text={rest.join(' ')}
          by={L.rtl ? 'word' : 'char'}
          start={12}
          stagger={1.5}
          rtl={L.rtl}
          style={{fontFamily: L.display, fontWeight: 700, fontSize: nameSize, lineHeight: 1.02, textTransform: L.upper, color: C.gold}}
        />
        <div style={{height: 6, width: 160 * bar, background: C.red, margin: '30px 0 26px'}} />
        <Rise
          text={c.json.role[lang]}
          start={22}
          stagger={2}
          rtl={L.rtl}
          style={{fontFamily: L.body, fontWeight: 500, fontSize: L.v ? 44 : 40, lineHeight: 1.3, opacity: 0.9}}
        />
      </div>
    </AbsoluteFill>
  );
};

// Red hanko-style stamp carrying the brush kanji; lands with a little overshoot.
const Seal = ({text, size}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - 1, fps, config: {damping: 11, stiffness: 160}});
  return (
    <div
      style={{
        fontFamily: KANJI, fontSize: size, lineHeight: 1.05, color: C.paper, background: C.red,
        padding: '10px 10px 12px', borderRadius: 6, writingMode: 'vertical-rl', marginBottom: 26,
        transform: `scale(${1.8 - 0.8 * s}) rotate(${-4 * s}deg)`, opacity: Math.min(1, s * 2),
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      }}
    >
      {text}
    </div>
  );
};

const Credential = ({L, big, line, sub, kicker, seal}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - 3, fps, config: {damping: 14, stiffness: 140}});
  return (
    <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', height: '100%', direction: L.rtl ? 'rtl' : 'ltr', color: C.paper}}>
      {seal && <Seal text={seal} size={L.v ? 52 : 56} />}
      {kicker && (
        <Rise text={kicker} start={2} rtl={L.rtl} style={{fontFamily: L.display, fontWeight: 700, fontSize: L.v ? 150 : 140, color: C.gold, textTransform: L.upper, lineHeight: 1}} />
      )}
      {big && (
        <div
          dir="ltr"
          style={{
            fontFamily: 'Oswald', fontWeight: 700, fontSize: L.v ? 240 : 280, lineHeight: 0.9, color: C.gold,
            transform: `scale(${1.35 - 0.35 * s})`, transformOrigin: L.rtl ? 'right center' : 'left center',
            opacity: Math.min(1, s * 1.5), filter: `blur(${(1 - s) * 8}px)`, textAlign: L.rtl ? 'right' : 'left',
          }}
        >
          {big}
        </div>
      )}
      <div style={{height: 5, width: 120 * ease(f, 8, 24, 0, 1), background: C.red, margin: '28px 0 24px'}} />
      <Rise text={line} start={9} rtl={L.rtl} style={{fontFamily: L.display, fontWeight: 500, fontSize: L.v ? 72 : 64, lineHeight: 1.1, textTransform: L.upper}} />
      {sub && (
        <div style={{fontFamily: L.body, fontSize: L.v ? 42 : 36, lineHeight: 1.35, marginTop: 18, textWrap: 'balance', opacity: 0.8 * ease(f, 18, 30, 0, 1), transform: `translateY(${ease(f, 18, 34, 16, 0)}px)`}}>
          {sub}
        </div>
      )}
    </div>
  );
};

const Beat = ({beat, lang, i, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const [line, sub] = beat.text[lang];
  // Alternate sides so consecutive beats don't feel stamped from one template.
  const flip = (i % 2 === 1) !== L.rtl;
  const side = flip ? 'left' : 'right';
  const tside = flip ? 'right' : 'left';
  const has = beat.photos.length > 0;
  const size = L.v ? 0.52 : 0.56;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      {!has && (
        <div
          style={{
            position: 'absolute', width: L.v ? 760 : 820, height: L.v ? 760 : 820, borderRadius: '50%',
            border: `10px solid ${C.red}`, opacity: 0.55 * ease(f, 0, 20, 0, 1),
            transform: `scale(${ease(f, 0, 30, 0.85, 1)})`,
            ...(L.v ? {left: 160, top: 60} : {[side]: '6%', top: 130}),
          }}
        />
      )}
      {!has && (
        <Kanji
          text={beat.kanji}
          size={L.v ? 360 : 440}
          opacity={0.92}
          style={L.v ? {left: '50%', top: 120, marginLeft: -180} : {[side]: '16%', top: 100}}
        />
      )}
      {has && (
        <Panel L={L} side={side} size={size}>
          {beat.photos.map((p, k) => {
            const n = beat.photos.length;
            const pane = n === 1 ? {inset: 0} : {top: 0, bottom: 0, left: `${(k * 100) / n}%`, width: `${100 / n}%`};
            return (
              <div key={k} style={{position: 'absolute', overflow: 'hidden', ...pane, borderLeft: k ? `6px solid ${C.gold}` : 'none'}}>
                <Photo src={p.src} focus={p.focus} card={p.card} dur={dur} drift={n > 1 ? 0 : 30} />
                {p.label && <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(10,9,8,.85), transparent 30%)'}} />}
                {p.label && (
                  <div style={{position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center', fontFamily: L.display, fontSize: 40, color: C.paper, textTransform: L.upper, letterSpacing: '0.12em', textShadow: '0 4px 20px rgba(0,0,0,.8)', opacity: ease(f, 14 + k * 4, 26 + k * 4, 0, 1)}}>
                    {p.label[lang]}
                  </div>
                )}
              </div>
            );
          })}
          {beat.caption && (
            <div dir={L.rtl ? 'rtl' : 'ltr'} style={{position: 'absolute', bottom: 34, [L.rtl ? 'right' : 'left']: 40, fontFamily: L.body, fontSize: 24, color: C.paper, opacity: 0.85 * ease(f, 16, 28, 0, 1), borderInlineStart: `3px solid ${C.gold}`, paddingInlineStart: 12, textShadow: '0 2px 10px rgba(0,0,0,.9)'}}>
              {beat.caption[lang]}
            </div>
          )}
        </Panel>
      )}
      <div style={has ? textBox(L, tside, size) : L.v ? {position: 'absolute', left: 80, right: 100, top: '48%', bottom: 380} : {position: 'absolute', top: 0, bottom: 0, [tside]: '8%', width: '52%'}}>
        <Credential L={L} big={beat.big} line={line} sub={sub} seal={has ? beat.kanji : null} />
      </div>
    </AbsoluteFill>
  );
};

const Today = ({c, lang, dur}) => {
  const L = useLayout(lang);
  const side = L.rtl ? 'left' : 'right';
  const tside = L.rtl ? 'right' : 'left';
  const size = L.v ? 0.52 : 0.5;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Panel L={L} side={side} size={size}>
        <Photo src={c.today.photo.src} focus={c.today.photo.focus} card={c.today.photo.card} dur={dur} zoom={[1.02, 1.1]} tilt={2} />
      </Panel>
      <div style={textBox(L, tside, size)}>
        <Credential L={L} kicker={UI[lang].today} line={c.today.text[lang]} seal="師" />
      </div>
    </AbsoluteFill>
  );
};

const End = ({lang, dur}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - 2, fps, config: {damping: 18, stiffness: 90}});
  const fadeOut = interpolate(f, [dur - 24, dur - 2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const row = (d) => ({opacity: ease(f, d, d + 14, 0, 1), transform: `translateY(${ease(f, d, d + 18, 24, 0)}px)`});
  return (
    <AbsoluteFill style={{background: C.ink, alignItems: 'center', justifyContent: 'center', color: C.paper, textAlign: 'center', paddingBottom: L.v ? 280 : 0}}>
      <Kanji text="道" size={L.v ? 1000 : 900} start={0} opacity={0.07} vertical={false} style={{left: '50%', top: '50%', transform: 'translate(-50%,-52%)'}} />
      <div style={{width: L.v ? 300 : 240, height: L.v ? 300 : 240, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `4px solid ${C.gold}`, transform: `scale(${0.85 + 0.15 * s})`, opacity: s}}>
        <Img src={staticFile('logo.png')} style={{width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.04)'}} />
      </div>
      <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: L.v ? 96 : 88, letterSpacing: '0.18em', marginTop: 30, ...row(8)}}>UNIFIGHT HAIFA</div>
      <div style={{width: 220 * ease(f, 14, 30, 0, 1), height: 4, background: C.gold, margin: '18px 0 28px'}} />
      <div dir={L.rtl ? 'rtl' : 'ltr'} style={{fontFamily: L.body, fontSize: L.v ? 44 : 38, opacity: 0.85, maxWidth: L.v ? 900 : 1400, ...row(16)}}>
        {UI[lang].tagline}
      </div>
      <div style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 50 : 46, color: C.gold, marginTop: 44, letterSpacing: '0.04em', ...row(24)}}>{SITE}</div>
      <div style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 50 : 46, marginTop: 10, letterSpacing: '0.04em', ...row(30)}}>{WHATSAPP}</div>
      <AbsoluteFill style={{background: '#000', opacity: fadeOut}} />
    </AbsoluteFill>
  );
};

export const Profile = ({coach, lang}) => {
  const c = COACHES[coach];
  const {parts, total} = timeline(coach);
  const scene = (p) => {
    switch (p.name) {
      case 'open': return <Open c={c} dur={p.dur} />;
      case 'name': return <Name c={c} lang={lang} dur={p.dur} />;
      case 'beat': return <Beat beat={p.beat} i={p.i} lang={lang} dur={p.dur} />;
      case 'today': return <Today c={c} lang={lang} dur={p.dur} />;
      default: return <End lang={lang} dur={p.dur} />;
    }
  };
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio
        src={staticFile('audio/trailer.m4a')}
        volume={(f) => interpolate(f, [0, 4, total - 45, total - 2], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
      />
      {parts.map((p, k) => (
        <Sequence key={k} from={p.from} durationInFrames={p.dur}>
          {scene(p)}
        </Sequence>
      ))}
      <LightLeak strength={0.22} />
      {parts.slice(1, -1).map((p, k) => (
        <Sweep key={k} at={p.from} dir={lang === 'he' ? -1 : 1} />
      ))}
      <Flash at={parts[1].from} len={10} color={C.gold} max={0.5} />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};
