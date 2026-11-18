import { freeStep } from './free-step.js';
import { captureFree } from '../bot/features/hut.js';

export default freeStep({
  name: 'hut.capture',
  label: 'ninja hut',
  event: 'capture',
  clock: 'hutAt',
  setting: 'hutCaptures',
  gapSetting: 'hutGapMin',
  call: captureFree,
  key: 'captured',
});
