import { appControlUpdateSchema } from '../app-control.types';

describe('appControlUpdateSchema — banner update payload contract', () => {
  it('accepts a valid full banner update payload', () => {
    const result = appControlUpdateSchema.safeParse({
      title: 'Welcome to BPA App',
      subtitle: 'Draft Banner',
      description: 'Sample banner',
      imageUrl: 'https://cdn.example.com/banner.jpg',
      mobileImageUrl: 'https://cdn.example.com/banner-mobile.jpg',
      ctaText: 'Learn More',
      destinationType: 'INTERNAL_PAGE',
      destinationValue: 'app_dashboard',
      sortOrder: 0,
      isActive: false,
      startsAt: null,
      endsAt: null,
      targetAudience: 'all',
      status: 'draft',
    });
    expect(result.success).toBe(true);
  });

  it('accepts ISO-8601 datetime strings (from toISOString()) for startsAt/endsAt', () => {
    const result = appControlUpdateSchema.safeParse({
      startsAt: new Date('2026-07-25T10:00:00.000Z').toISOString(),
      endsAt: new Date('2026-07-26T10:00:00.000Z').toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a datetime-local-style string missing seconds/timezone (not full ISO-8601)', () => {
    const result = appControlUpdateSchema.safeParse({ startsAt: '2026-07-25T10:00' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.errors.find((e) => e.path.join('.') === 'startsAt');
      expect(issue).toBeDefined();
      expect(issue?.message).not.toBe('Invalid value');
    }
  });

  it('rejects a locale-formatted date string (e.g. "22/7/2026, 11:00 PM")', () => {
    const result = appControlUpdateSchema.safeParse({ startsAt: '22/7/2026, 11:00 PM' });
    expect(result.success).toBe(false);
  });

  it('rejects endsAt before startsAt with a real, specific message', () => {
    const result = appControlUpdateSchema.safeParse({
      startsAt: '2026-07-25T10:00:00.000Z',
      endsAt: '2026-07-20T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.errors.find((e) => e.path.join('.') === 'endsAt');
      expect(issue?.message).toBe('endsAt must be after startsAt');
    }
  });

  it('coerces a numeric-string sortOrder to an integer', () => {
    const result = appControlUpdateSchema.safeParse({ sortOrder: '5' as unknown as number });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sortOrder).toBe(5);
  });

  it('rejects a non-numeric sortOrder instead of silently coercing to NaN', () => {
    const result = appControlUpdateSchema.safeParse({ sortOrder: 'abc' as unknown as number });
    expect(result.success).toBe(false);
  });

  it('accepts a campaign database ID (UUID) as destinationValue for destinationType=CAMPAIGN', () => {
    const result = appControlUpdateSchema.safeParse({
      destinationType: 'CAMPAIGN',
      destinationValue: 'a55b02f4-1f84-433a-8164-1e54c58c1bb8',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a relative media path (not a full URL) for imageUrl', () => {
    const result = appControlUpdateSchema.safeParse({ imageUrl: '/uploads/x.jpg' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.errors.find((e) => e.path.join('.') === 'imageUrl');
      expect(issue).toBeDefined();
    }
  });

  it('accepts optional fields omitted entirely (partial update) without requiring every field', () => {
    const result = appControlUpdateSchema.safeParse({ sortOrder: 3 });
    expect(result.success).toBe(true);
  });

  it('treats null as a valid "intentionally unset" value for optional dates and text', () => {
    const result = appControlUpdateSchema.safeParse({
      subtitle: null,
      imageUrl: null,
      startsAt: null,
      endsAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('requires isActive to be an actual boolean, not a string', () => {
    const result = appControlUpdateSchema.safeParse({ isActive: 'true' as unknown as boolean });
    expect(result.success).toBe(false);
  });
});
