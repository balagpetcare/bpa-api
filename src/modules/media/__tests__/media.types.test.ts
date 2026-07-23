import { mediaListQuerySchema, mediaIdParamSchema } from '../media.types';

describe('mediaListQuerySchema', () => {
  it('accepts a typical picker request (page/limit/mimeType prefix)', () => {
    const result = mediaListQuerySchema.safeParse({ page: '1', limit: '24', mimeType: 'image/' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(24);
      expect(result.data.mimeType).toBe('image/');
    }
  });

  it('accepts an empty query (all fields optional)', () => {
    expect(mediaListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects a limit above the max page size', () => {
    const result = mediaListQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive page', () => {
    const result = mediaListQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });
});

describe('mediaIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = mediaIdParamSchema.safeParse({ id: '013a2da5-e907-40be-856b-766b1831d71b' });
    expect(result.success).toBe(true);
  });

  // Regression test for the "Invalid data format in request" bug: a URL
  // (or any non-UUID string) passed as the :id param used to reach Prisma
  // directly and surface as a confusing P2023-derived VALIDATION_ERROR.
  // It must now be rejected here, before ever reaching the database.
  it('rejects a URL passed where an id was expected', () => {
    const result = mediaIdParamSchema.safeParse({ id: 'https://placehold.co/400x400?text=File+Missing' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(mediaIdParamSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('rejects a missing id field', () => {
    expect(mediaIdParamSchema.safeParse({}).success).toBe(false);
  });
});
