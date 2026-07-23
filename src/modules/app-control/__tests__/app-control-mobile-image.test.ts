import { prisma } from '../../../database/prisma';
import { createEntity, updateEntity } from '../app-control.service';
import { appControlUpdateSchema } from '../app-control.types';
import type { AuditContext } from '../../../utils/audit';

// Regression coverage for the banner image-field null/empty-string
// contract: explicitly clearing mobileImageUrl (e.g. the Admin "Remove"
// action on the Mobile Banner Image picker) must persist a real `null`,
// never a stale value, an empty string, or a validation error. Uses a
// throwaway banner record created and deleted within this suite — never
// touches the real seeded/published banners.

const ctx: AuditContext = { actorId: undefined, actorEmail: 'test@example.com', ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('appControlUpdateSchema — imageUrl/mobileImageUrl null and empty-string normalization', () => {
  it('accepts an explicit null for mobileImageUrl (clears the field)', () => {
    const result = appControlUpdateSchema.safeParse({ mobileImageUrl: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mobileImageUrl).toBeNull();
  });

  it('normalizes an empty string for mobileImageUrl to null instead of rejecting it', () => {
    const result = appControlUpdateSchema.safeParse({ mobileImageUrl: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mobileImageUrl).toBeNull();
  });

  it('normalizes an empty string for imageUrl to null the same way', () => {
    const result = appControlUpdateSchema.safeParse({ imageUrl: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imageUrl).toBeNull();
  });

  it('omitting mobileImageUrl entirely leaves it absent from the parsed output (preserve-on-omit)', () => {
    const result = appControlUpdateSchema.safeParse({ title: 'Only title changed' });
    expect(result.success).toBe(true);
    if (result.success) expect('mobileImageUrl' in result.data).toBe(false);
  });

  it('still rejects a genuinely malformed URL (not empty, not null, not valid)', () => {
    const result = appControlUpdateSchema.safeParse({ mobileImageUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('app-control service — mobileImageUrl clear/preserve behavior end-to-end (isolated throwaway record)', () => {
  let bannerId: string;

  beforeAll(async () => {
    const created = await createEntity(
      'banners',
      {
        title: 'Mobile image clear/preserve test banner',
        imageUrl: 'http://10.0.2.2:4000/uploads/main-test.jpg',
        mobileImageUrl: 'http://10.0.2.2:4000/uploads/mobile-test.jpg',
        destinationType: 'NONE',
        sortOrder: 9998,
        isActive: false,
        targetAudience: 'all',
        status: 'draft',
      },
      ctx,
    );
    bannerId = created.id;
  });

  afterAll(async () => {
    await prisma.appBanner.delete({ where: { id: bannerId } }).catch(() => {});
  });

  it('explicitly setting mobileImageUrl to null clears the previously-set real value', async () => {
    const updated = await updateEntity('banners', bannerId, { mobileImageUrl: null }, ctx);
    expect(updated.mobileImageUrl).toBeNull();

    const row = await prisma.appBanner.findUnique({ where: { id: bannerId } });
    expect(row?.mobileImageUrl).toBeNull();
  });

  it('a subsequent update that omits mobileImageUrl preserves the cleared null (does not resurrect stale content)', async () => {
    const updated = await updateEntity('banners', bannerId, { title: 'Renamed, mobileImageUrl untouched' }, ctx);
    expect(updated.title).toBe('Renamed, mobileImageUrl untouched');

    const row = await prisma.appBanner.findUnique({ where: { id: bannerId } });
    expect(row?.mobileImageUrl).toBeNull();
    // imageUrl (main image) must also be untouched by an update that never mentioned it.
    expect(row?.imageUrl).toBe('http://10.0.2.2:4000/uploads/main-test.jpg');
  });

  it('setting mobileImageUrl back to a real URL after clearing it works (re-adding a mobile image)', async () => {
    const updated = await updateEntity(
      'banners',
      bannerId,
      { mobileImageUrl: 'http://10.0.2.2:4000/uploads/mobile-test-2.jpg' },
      ctx,
    );
    expect(updated.mobileImageUrl).toBe('http://10.0.2.2:4000/uploads/mobile-test-2.jpg');
  });
});
