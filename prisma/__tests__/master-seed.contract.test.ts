import { MASTER_SEED_MODULE_ORDER } from '../seed/manifest';

describe('master seed contract', () => {
  it('runs clinic seeding after location seeds and before video categories', () => {
    expect(MASTER_SEED_MODULE_ORDER.indexOf('locations')).toBeLessThan(
      MASTER_SEED_MODULE_ORDER.indexOf('clinic-directory'),
    );
    expect(MASTER_SEED_MODULE_ORDER.indexOf('location-nodes')).toBeLessThan(
      MASTER_SEED_MODULE_ORDER.indexOf('clinic-directory'),
    );
    expect(MASTER_SEED_MODULE_ORDER.indexOf('clinic-directory')).toBeLessThan(
      MASTER_SEED_MODULE_ORDER.indexOf('video-categories'),
    );
  });

  it('runs video categories before app-control so category restoration does not depend on app_* tables', () => {
    expect(MASTER_SEED_MODULE_ORDER.indexOf('video-categories')).toBeLessThan(
      MASTER_SEED_MODULE_ORDER.indexOf('app-control'),
    );
  });
});
