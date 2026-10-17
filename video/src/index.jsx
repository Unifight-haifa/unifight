import {Composition, registerRoot} from 'remotion';
import {FPS, timeline} from './data';
import './fonts';
import {Profile} from './Profile';

const SIZES = {'16x9': [1920, 1080], '9x16': [1080, 1920]};

const Root = () => (
  <Composition
    id="CoachProfile"
    component={Profile}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={1}
    defaultProps={{coach: 'ilana', lang: 'ru', format: '16x9'}}
    calculateMetadata={({props}) => {
      const [width, height] = SIZES[props.format];
      return {width, height, durationInFrames: timeline(props.coach).total};
    }}
  />
);

registerRoot(Root);
