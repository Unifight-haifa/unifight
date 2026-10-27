import {Composition, registerRoot} from 'remotion';
import './fonts';
import {Ilana, ILANA_FRAMES} from './ilana';
import {Natanel, NATANEL_FRAMES} from './natanel';
import {Promo, promoLength} from './Promo';
import {Reel, ReelThumb} from './Reel';
import {reelLength} from './reelData';

const SIZES = {'16x9': [1920, 1080], '9x16': [1080, 1920]};
const COACHES = {
  ilana: [Ilana, ILANA_FRAMES],
  natanel: [Natanel, NATANEL_FRAMES],
};

const Profile = ({coach}) => {
  const [Component] = COACHES[coach];
  return <Component />;
};

const Root = () => (
  <>
  <Composition
    id="CoachProfile"
    component={Profile}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={1}
    defaultProps={{coach: 'ilana', format: '16x9'}}
    calculateMetadata={({props}) => {
      const [width, height] = SIZES[props.format];
      return {width, height, durationInFrames: COACHES[props.coach][1]};
    }}
  />
  <Composition
    id="Promo"
    component={Promo}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={1}
    defaultProps={{format: '16x9'}}
    calculateMetadata={({props}) => {
      const [width, height] = SIZES[props.format];
      return {width, height, durationInFrames: promoLength(props.format)};
    }}
  />
  <Composition
    id="Reel"
    component={Reel}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={1}
    defaultProps={{reel: 'sumo'}}
    calculateMetadata={({props}) => ({durationInFrames: reelLength(props.reel)})}
  />
  <Composition id="ReelThumb" component={ReelThumb} fps={30} width={1280} height={720} durationInFrames={1} defaultProps={{reel: 'sumo'}} />
  </>
);

registerRoot(Root);
