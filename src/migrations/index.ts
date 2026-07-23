import * as migration_20260723_232413_initial_cms from './20260723_232413_initial_cms';

export const migrations = [
  {
    up: migration_20260723_232413_initial_cms.up,
    down: migration_20260723_232413_initial_cms.down,
    name: '20260723_232413_initial_cms',
  },
];
