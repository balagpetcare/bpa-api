import { PLATFORM_SHOWCASE_ITEMS, PLATFORM_SHOWCASE_SECTION_KEY } from '../seed/platform-showcases.seed';

describe('platform showcase seed content', () => {
  it('keeps the showcase in a safe draft without invented media or links', () => {
    expect(PLATFORM_SHOWCASE_SECTION_KEY).toBe('digital-ecosystem');
    expect(PLATFORM_SHOWCASE_ITEMS).toHaveLength(4);
    expect(PLATFORM_SHOWCASE_ITEMS.map((item) => item.platformKey)).toEqual([
      'bpa-app',
      'furtail-app',
      'furtail-website',
      'wpa-website',
    ]);
    expect(PLATFORM_SHOWCASE_ITEMS.every((item) => item.badgeText === 'Official BPA App' || item.badgeText === 'Coming Soon')).toBe(true);
    expect(JSON.stringify(PLATFORM_SHOWCASE_ITEMS)).not.toContain('http');
    expect(JSON.stringify(PLATFORM_SHOWCASE_ITEMS)).not.toContain('"#"');
  });

  it('provides the required BPA app content', () => {
    const bpa = PLATFORM_SHOWCASE_ITEMS[0];
    expect(bpa.name).toBe('Bangladesh Pet Association App');
    expect(bpa.badgeText).toBe('Official BPA App');
    expect(bpa.featureBullets).toEqual([
      'Vaccination Campaign Registration',
      'Find a Clinic',
      'Spay & Neuter Booking',
      'Community Care Membership',
      'My Pets & Pet Records',
      'Digital Vaccination Certificates',
      'Donation',
      'BPA Updates',
    ]);
  });
});
