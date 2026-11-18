import { freeStep } from './free-step.js';
import { trainFree } from '../bot/features/school.js';

export default freeStep({
  name: 'school.train',
  label: 'ninjutsu school',
  event: 'studySkill',
  clock: 'schoolAt',
  setting: 'schoolTrains',
  gapSetting: 'schoolGapMin',
  call: trainFree,
  key: 'trained',
});
