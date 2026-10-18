import {AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, KANJI, fontsFor} from './fonts';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
export const photo = (name) => staticFile(`photos/${name}.jpg`);
export const ease = (f, a, b, from, to, e = Easing.bezier(0.22, 1, 0.36, 1)) =>
  interpolate(f, [a, b], [from, to], {...clamp, easing: e});
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

export const useLayout = (lang) => {
  const {width, height} = useVideoConfig();
  return {v: height > width, rtl: lang === 'he', W: width, H: height, ...fontsFor(lang)};
};

export const Grain = ({opacity = 0.16}) => {
  const f = useCurrentFrame();
  const x = Math.floor(random(`gx${f}`) * 512);
  const y = Math.floor(random(`gy${f}`) * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('grain.png')})`,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: 'overlay',
        opacity,
      }}
    />
  );
};

export const Vignette = ({strength = 0.55}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)`}} />
);

export const Flash = ({at, len = 6, color = '#fff', max = 0.7}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 1, at + len], [0, max, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{background: color, opacity: o, mixBlendMode: 'screen'}} /> : null;
};

// Cover-fit photo with a slow push; card = whole photo framed over a blurred copy of itself.
export const Photo = ({src, focus = '50% 50%', card, dur, zoom = [1.04, 1.12], drift = 0, tilt = 0, border, style}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, dur], [0, 1], clamp);
  const s = zoom[0] + (zoom[1] - zoom[0]) * p;
  const url = photo(src);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: C.ink, ...style}}>
      <Img
        src={url}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus,
          transform: `scale(${card ? 1.25 : s}) translateX(${(p - 0.5) * drift}px)`,
          filter: card ? 'blur(36px) brightness(.35) saturate(1.1)' : 'none',
        }}
      />
      {card && (
        <div style={{position: 'absolute', inset: '7% 8%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Img
            src={url}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
              border: border ?? `10px solid ${C.paper}`, boxShadow: '0 30px 80px rgba(0,0,0,.6)',
              transform: `rotate(${tilt * (1 - p * 0.5)}deg) scale(${1 + 0.04 * p})`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export const Kanji = ({text, size, start = 0, color = C.gold, opacity = 1, vertical = true, style}) => {
  const f = useCurrentFrame();
  const p = ease(f, start, start + 22, 0, 100);
  return (
    <div
      style={{
        position: 'absolute', fontFamily: KANJI, fontSize: size, lineHeight: 1, color, opacity,
        writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
        clipPath: vertical ? `inset(0 0 ${100 - p}% 0)` : `inset(0 ${100 - p}% 0 0)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

// Words rise out of a mask with a spring, staggered.
export const Rise = ({text, start = 0, stagger = 2, style, rtl, damping = 16}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const parts = text.split(' ');
  return (
    <div style={{direction: rtl ? 'rtl' : 'ltr', textWrap: 'balance', ...style}}>
      {parts.map((w, i) => {
        const s = spring({frame: f - start - i * stagger, fps, config: {damping, stiffness: 120, mass: 0.7}});
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em', marginBottom: '-0.08em', verticalAlign: 'top'}}>
            <span style={{display: 'inline-block', transform: `translateY(${(1 - s) * 110}%)`, whiteSpace: 'pre'}}>
              {i < parts.length - 1 ? w + ' ' : w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const EndCard = ({lang, dur, tagline, site, whatsapp, kanji = '道'}) => {
  const L = useLayout(lang);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - 2, fps, config: {damping: 18, stiffness: 90}});
  const fadeOut = interpolate(f, [dur - 24, dur - 1], [0, 1], clamp);
  const row = (d) => ({opacity: ease(f, d, d + 14, 0, 1), transform: `translateY(${ease(f, d, d + 18, 24, 0)}px)`});
  return (
    <AbsoluteFill style={{background: C.ink, alignItems: 'center', justifyContent: 'center', color: C.paper, textAlign: 'center', paddingBottom: L.v ? 280 : 0}}>
      <Kanji text={kanji} size={L.v ? 1000 : 900} opacity={0.07} vertical={false} style={{left: '50%', top: '50%', transform: 'translate(-50%,-52%)'}} />
      <div style={{width: L.v ? 300 : 240, height: L.v ? 300 : 240, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: `4px solid ${C.gold}`, transform: `scale(${0.85 + 0.15 * s})`, opacity: s}}>
        <Img src={staticFile('logo.png')} style={{width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(1.04)'}} />
      </div>
      <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: L.v ? 96 : 88, letterSpacing: '0.18em', marginTop: 30, ...row(8)}}>UNIFIGHT HAIFA</div>
      <div style={{width: 220 * ease(f, 14, 30, 0, 1), height: 4, background: C.gold, margin: '18px 0 28px'}} />
      <div dir={L.rtl ? 'rtl' : 'ltr'} style={{fontFamily: L.body, fontSize: L.v ? 44 : 38, opacity: 0.85, maxWidth: L.v ? 900 : 1400, ...row(16)}}>
        {tagline}
      </div>
      <div style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 50 : 46, color: C.gold, marginTop: 44, letterSpacing: '0.04em', ...row(24)}}>{site}</div>
      <div style={{fontFamily: 'Oswald', fontWeight: 500, fontSize: L.v ? 50 : 46, marginTop: 10, letterSpacing: '0.04em', ...row(30)}}>{whatsapp}</div>
      <AbsoluteFill style={{background: '#000', opacity: fadeOut}} />
    </AbsoluteFill>
  );
};
