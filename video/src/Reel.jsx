import {AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from './fonts';
import {Flash, Grain, LightLeak, Vignette} from './fx';
import {EndCard, Line, LogoBug, Whip} from './Promo';
import {REEL, TALL, THUMBS, reelLength} from './reelData';

const F = (s) => Math.round(s * 30);
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const GRADE = 'contrast(1.06) saturate(0.95) sepia(0.06)';
const L = {v: false, W: 1920, H: 1080};

const cover = {position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'};

const Shot = ({shot, dur, i}) => {
  const f = useCurrentFrame();
  const p = f / dur;
  const lift = shot.lift ? `brightness(${shot.lift})` : '';
  const vid = (style, vol = 0) => (
    <OffthreadVideo
      src={staticFile(`reel/${shot.src}.mp4`)}
      trimBefore={F(shot.at)}
      playbackRate={shot.rate ?? 1}
      muted={!vol}
      volume={vol}
      style={style}
    />
  );
  let body;
  if (TALL.has(shot.src)) {
    // portrait phone clip: full height in the middle, a blurred copy of itself fills the sides
    const w = (1080 * 9) / 16;
    body = (
      <AbsoluteFill>
        {vid({...cover, filter: `blur(36px) brightness(0.45) saturate(0.8) ${lift}`, transform: 'scale(1.25)'})}
        <div style={{position: 'absolute', top: 0, height: 1080, width: w, left: (1920 - w) / 2, overflow: 'hidden', boxShadow: '0 0 90px rgba(0,0,0,.8)', transform: `scale(${1 + 0.03 * p})`}}>
          {vid({...cover, filter: lift}, shot.vol)}
        </div>
        <div style={{position: 'absolute', top: 0, bottom: 0, width: 4, left: (1920 - w) / 2 - 4, background: C.gold, opacity: 0.8}} />
        <div style={{position: 'absolute', top: 0, bottom: 0, width: 4, left: (1920 + w) / 2, background: C.gold, opacity: 0.8}} />
      </AbsoluteFill>
    );
  } else {
    body = <AbsoluteFill style={{transform: `scale(${1.03 + 0.05 * p})`}}>{vid({...cover, filter: lift}, shot.vol)}</AbsoluteFill>;
  }
  return i ? <Whip dir={i % 2 ? -1 : 1}>{body}</Whip> : body;
};

const Sfx = ({at, name, volume}) => (
  <Sequence from={Math.max(0, F(at))} layout="none">
    <Audio src={staticFile(`promo/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

export const Reel = ({reel}) => {
  const r = REEL[reel];
  const total = reelLength(reel);
  const end = F(r.end);
  const flashes = r.shots.filter((s) => s.flash).map((s) => s.from);
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <Audio
        src={staticFile(`reel/${r.music}.mp3`)}
        trimBefore={r.from * 30}
        volume={(f) => Math.min(interpolate(f, [0, 8], [0, 1], clamp), r.fade ? interpolate(f, [total - 75, total - 5], [1, 0], clamp) : 1)}
      />
      {flashes.map((t) => <Sfx key={t} at={t - 0.3} name="whoosh" volume={0.3} />)}
      <Sfx at={r.end} name="hit" volume={0.6} />

      <AbsoluteFill style={{filter: GRADE}}>
        {r.shots.map((s, i) => (
          <Sequence key={i} from={F(s.from)} durationInFrames={F(s.to) - F(s.from)}>
            <Shot shot={s} dur={F(s.to) - F(s.from)} i={i} />
          </Sequence>
        ))}
      </AbsoluteFill>
      <LightLeak strength={0.14} />
      {flashes.map((t) => <Flash key={t} at={F(t)} len={5} max={0.4} />)}
      <Vignette />
      <Sequence from={F(r.shots[0].to)} durationInFrames={end - F(r.shots[0].to)} layout="none">
        <LogoBug L={L} />
      </Sequence>
      {r.lines.map((l, k) => (
        <Sequence key={k} from={F(l.from)} durationInFrames={F(l.to) - F(l.from)}>
          <Line line={l} L={L} dur={F(l.to) - F(l.from)} />
        </Sequence>
      ))}
      <Sequence from={end} durationInFrames={total - end}>
        <EndCard L={L} dur={total - end} />
      </Sequence>
      <Grain />
    </AbsoluteFill>
  );
};

// 1280x720 still in the style of the coach thumbnails: type on the left, footage on the right.
export const ReelThumb = ({reel}) => {
  const t = THUMBS[reel];
  const big = {fontFamily: 'Oswald', fontWeight: 700, fontSize: 150, lineHeight: 1, textTransform: 'uppercase', color: C.paper};
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <div style={{position: 'absolute', right: 0, top: 0, width: 600, height: 720, overflow: 'hidden'}}>
        <OffthreadVideo src={staticFile(`reel/${t.clip}.mp4`)} trimBefore={F(t.at)} muted style={{...cover, filter: GRADE}} />
        <AbsoluteFill style={{background: `linear-gradient(90deg, ${C.ink}, transparent 35%)`}} />
      </div>
      <div style={{position: 'absolute', left: 60, width: 640, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
        <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 30, letterSpacing: '0.25em', color: C.gold, marginBottom: 18}}>UNIFIGHT HAIFA</div>
        <div style={big}>{t.top}</div>
        <div style={{...big, background: C.red, padding: '0 28px', marginTop: 8}}>{t.bar}</div>
        <div style={{display: 'flex', gap: 22, alignItems: 'center', marginTop: 30, whiteSpace: 'nowrap', fontFamily: 'Rubik', fontWeight: 600, fontSize: 34, color: C.paper}}>
          <span dir="rtl" style={{fontFamily: '"Secular One"', fontWeight: 400, fontSize: 38}}>{t.sub[0]}</span>
          <span style={{color: C.gold}}>·</span>
          <span>{t.sub[1]}</span>
        </div>
        <div style={{fontFamily: 'Oswald', fontWeight: 600, fontSize: 44, color: C.gold, marginTop: 22, letterSpacing: '0.06em', textTransform: 'uppercase'}}>{t.year}</div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
