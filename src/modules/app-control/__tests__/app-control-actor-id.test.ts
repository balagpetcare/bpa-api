import { prisma } from '../../../database/prisma';
import { createEntity, updateEntity, publishEntity, reorderEntities } from '../app-control.service';
import type { AuditContext } from '../../../utils/audit';
import type { AppBanner } from '@prisma/client';

// Regression test for a real Prisma-layer defect found while investigating a
// banner edit failure: BPA Admin's only real sign-in path is WPA Central
// Auth SSO, whose JWT `sub` claim is Central Auth's own id format (not a
// UUID — e.g. a cuid like "cm3x8f2k10000abc123def456"), and
// app-control.service.ts wrote that raw value straight into
// `updatedById`/`createdById`, both `@db.Uuid` FK columns on AppBanner.
// Prisma's query engine then throws P2023 ("Inconsistent column data: Error
// creating UUID..."), which errorHandler.ts maps to the generic
// `VALIDATION_ERROR` / "Invalid data format in request" — with no
// relationship to the actual submitted content.
//
// This test runs against the real, shared seeded record
// (10000000-0000-0000-0000-000000000401) rather than a throwaway row,
// because that's the exact record the original defect was reported against.
// Since that row's real content legitimately changes over time (it is a
// live, admin-editable banner — at investigation time it held a real
// published vaccination-campaign banner, not its original seed content), the
// test captures whatever is actually in the row before it runs and restores
// exactly that snapshot afterward — it must NEVER hardcode a fixed "restore"
// payload, which would silently clobber real content the next time this
// suite runs against a database where the row has since been legitimately
// edited (this happened once already during development of this test).

const SEEDED_BANNER_ID = '10000000-0000-0000-0000-000000000401';
const CENTRAL_AUTH_STYLE_SUB = 'cm3x8f2k10000abc123def456'; // real Central Auth id shape: not a UUID
const LOCAL_UUID_SUB = '3d08ef01-0bd7-43d5-9db2-0c4106b8369c';

function ctx(actorId: string): AuditContext {
  return { actorId, actorEmail: 'admin@wpa.com', ipAddress: '127.0.0.1', userAgent: 'jest' };
}

describe('app-control actor attribution — non-UUID Central Auth sub must not crash writes', () => {
  let originalRow: AppBanner | null = null;

  beforeAll(async () => {
    originalRow = await prisma.appBanner.findUnique({ where: { id: SEEDED_BANNER_ID } });
  });

  afterAll(async () => {
    if (!originalRow) return;
    const { id, createdAt, updatedAt, ...data } = originalRow;
    await prisma.appBanner.update({ where: { id }, data });
  });

  it('updateEntity on the exact seeded banner succeeds for a Central Auth (non-UUID sub) actor', async () => {
    expect(originalRow).not.toBeNull();

    const dto = {
      title: 'Actor-id regression test title',
      destinationType: 'INTERNAL_PAGE' as const,
      destinationValue: 'app_dashboard',
      sortOrder: 0,
      isActive: false,
      startsAt: null,
      endsAt: null,
      targetAudience: 'all' as const,
      status: 'draft' as const,
    };

    const result = await updateEntity('banners', SEEDED_BANNER_ID, dto, ctx(CENTRAL_AUTH_STYLE_SUB));

    expect(result.id).toBe(SEEDED_BANNER_ID);
    expect(result.destinationType).toBe('INTERNAL_PAGE');
    expect(result.destinationValue).toBe('app_dashboard');
    expect(result.isActive).toBe(false);

    const row = await prisma.appBanner.findUnique({ where: { id: SEEDED_BANNER_ID } });
    // The FK is left null rather than corrupted/crashing — there is no
    // bpa_api local user row for this Central Auth principal to point to.
    expect(row?.updatedById).toBeNull();
  });

  it('updateEntity still attributes updatedById for a real local bpa_api UUID actor', async () => {
    const localUser = await prisma.user.findFirst({ where: { id: LOCAL_UUID_SUB } });
    // Only assert attribution if this exact seeded admin user exists in the
    // target DB; the "doesn't crash" behavior above is the real regression
    // guard and doesn't depend on this user existing.
    if (!localUser) return;

    const result = await updateEntity('banners', SEEDED_BANNER_ID, { sortOrder: originalRow?.sortOrder ?? 0 }, ctx(LOCAL_UUID_SUB));
    expect(result.id).toBe(SEEDED_BANNER_ID);

    const row = await prisma.appBanner.findUnique({ where: { id: SEEDED_BANNER_ID } });
    expect(row?.updatedById).toBe(LOCAL_UUID_SUB);
  });

  it('createEntity with a non-UUID actor does not crash and leaves createdById/updatedById null', async () => {
    const created = await createEntity(
      'banners',
      {
        title: 'Actor-id regression test banner (throwaway)',
        destinationType: 'NONE',
        sortOrder: 9999,
        isActive: false,
        targetAudience: 'all',
        status: 'draft',
      },
      ctx(CENTRAL_AUTH_STYLE_SUB),
    );
    expect(created.id).toBeTruthy();

    const row = await prisma.appBanner.findUnique({ where: { id: created.id } });
    expect(row?.createdById).toBeNull();
    expect(row?.updatedById).toBeNull();

    await prisma.appBanner.delete({ where: { id: created.id } });
  });

  it('publishEntity with a non-UUID actor does not crash', async () => {
    const result = await publishEntity('banners', SEEDED_BANNER_ID, { published: false }, ctx(CENTRAL_AUTH_STYLE_SUB));
    expect(result.status).toBe('draft');
  });

  it('reorderEntities with a non-UUID actor does not crash', async () => {
    const result = await reorderEntities(
      'banners',
      { items: [{ id: SEEDED_BANNER_ID, sortOrder: originalRow?.sortOrder ?? 0 }] },
      ctx(CENTRAL_AUTH_STYLE_SUB),
    );
    expect(result.reordered).toBe(1);
  });
});
