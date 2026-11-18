import { freeStep } from './free-step.js';
import { whackFree } from '../bot/features/whack.js';

export default freeStep({
  name: 'whack.dig',
  label: 'whack-a-ninja',
  event: 'dig',
  clock: 'whackAt',
  setting: 'digs',
  gapSetting: 'whackGapMin',
  call: whackFree,
  key: 'dug',
  flag: 'dig',
});
