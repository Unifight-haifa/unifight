import {AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {C, KANJI} from './fonts';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
export const photo = (name) => staticFile(`photos/${name}.jpg`);
export const ease = (f, a, b, from, to, e = Easing.bezier(0.22, 1, 0.36, 1)) =>
  interpolate(f, [a, b], [from, to], {...clamp, easing: e});

export const Grain = () => {
  const f = useCurrentFrame();
  const x = Math.floor(random(`gx${f}`) * 512);
  const y = Math.floor(random(`gy${f}`) * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('grain.png')})`,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: 'overlay',
        opacity: 0.16,
      }}
    />
  );
};

export const Vignette = () => (
  <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)'}} />
);

// Slow warm blobs; screen blend keeps blacks black.
export const LightLeak = ({seed = 0, strength = 0.35}) => {
  const f = useCurrentFrame();
  const t = f / 30 + seed * 7;
  const x1 = 20 + 30 * Math.sin(t * 0.35);
  const y1 = 25 + 20 * Math.cos(t * 0.27);
  const x2 = 80 + 15 * Math.cos(t * 0.31);
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: 'screen',
        opacity: strength,
        background: `radial-gradient(circle at ${x1}% ${y1}%, rgba(212,168,75,.55), transparent 38%),
          radial-gradient(circle at ${x2}% 85%, rgba(194,35,46,.45), transparent 34%)`,
      }}
    />
  );
};

// Diagonal red + gold bars crossing the frame; centred on a cut.
export const Sweep = ({at, dir = 1}) => {
  const f = useCurrentFrame();
  const {width} = useVideoConfig();
  const bar = (delay, color, w) => {
    const p = interpolate(f, [at - 8 + delay, at + 6 + delay], [-0.6, 1.6], {...clamp, easing: Easing.bezier(0.6, 0, 0.3, 1)});
    if (p <= -0.6 || p >= 1.6) return null;
    return (
      <div
        style={{
          position: 'absolute', top: '-30%', height: '160%', width: w,
          left: dir > 0 ? p * width - w / 2 : (1 - p) * width - w / 2,
          background: color, transform: 'skewX(-18deg)',
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {bar(0, C.red, width * 0.22)}
      {bar(2, C.gold, width * 0.06)}
    </AbsoluteFill>
  );
};

export const Flash = ({at, len = 6, color = '#fff', max = 0.7}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 1, at + len], [0, max, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{background: color, opacity: o, mixBlendMode: 'screen'}} /> : null;
};

// Ken Burns photo. card = whole picture on a paper frame over a blurred copy of itself.
export const Photo = ({src, focus = '50% 50%', card, dur, zoom = [1.06, 1.16], drift = 30, tilt = -2, style}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, dur], [0, 1], clamp);
  const s = zoom[0] + (zoom[1] - zoom[0]) * p;
  const url = photo(src);
  const bg = (
    <Img
      src={url}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus,
        transform: `scale(${card ? 1.25 : s}) translateX(${(p - 0.5) * (card ? 0 : drift)}px)`,
        filter: card ? 'blur(36px) brightness(.38) saturate(1.2)' : 'none',
      }}
    />
  );
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: C.ink, ...style}}>
      {bg}
      {card && (
        <div style={{position: 'absolute', inset: '7% 9%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Img
            src={url}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
              border: `12px solid ${C.paper}`, boxShadow: '0 30px 80px rgba(0,0,0,.6)',
              transform: `rotate(${tilt * (1 - p * 0.5)}deg) scale(${1 + 0.05 * p})`,
            }}
          />
        </div>
      )}
    </div>
  );
};

// Brush kanji revealed top-to-bottom like an ink stroke.
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

// Words (or letters) rise out of a mask with a spring, staggered.
export const Rise = ({text, start = 0, stagger = 2, by = 'word', style, rtl}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const parts = by === 'char' ? [...text] : text.split(' ');
  return (
    <div style={{direction: rtl ? 'rtl' : 'ltr', textWrap: 'balance', ...style}}>
      {parts.map((w, i) => {
        const s = spring({frame: f - start - i * stagger, fps, config: {damping: 16, stiffness: 120, mass: 0.7}});
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em', marginBottom: '-0.08em'}}>
            <span style={{display: 'inline-block', transform: `translateY(${(1 - s) * 110}%)`, whiteSpace: 'pre'}}>
              {by === 'char' ? w : (i < parts.length - 1 ? w + ' ' : w)}
            </span>
          </span>
        );
      })}
    </div>
  );
};
