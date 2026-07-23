import { publicClinicListQuerySchema, publicClinicSlugParamsSchema } from '../clinics-public.types';

describe('publicClinicListQuerySchema', () => {
  it('accepts an empty query (all filters optional)', () => {
    expect(publicClinicListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects radiusKm without latitude/longitude', () => {
    const result = publicClinicListQuerySchema.safeParse({ radiusKm: '5' });
    expect(result.success).toBe(false);
  });

  it('rejects latitude without longitude', () => {
    const result = publicClinicListQuerySchema.safeParse({ latitude: '23.7' });
    expect(result.success).toBe(false);
  });

  it('rejects sortBy=distance without coordinates', () => {
    const result = publicClinicListQuerySchema.safeParse({ sortBy: 'distance' });
    expect(result.success).toBe(false);
  });

  it('accepts a full valid geo query', () => {
    const result = publicClinicListQuerySchema.safeParse({
      latitude: '23.79',
      longitude: '90.41',
      radiusKm: '10',
      sortBy: 'distance',
      page: '1',
      limit: '20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a limit above the 50 cap', () => {
    expect(publicClinicListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    const result = publicClinicListQuerySchema.safeParse({ latitude: '200', longitude: '90' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown animalType value', () => {
    expect(publicClinicListQuerySchema.safeParse({ animalType: 'DINOSAUR' }).success).toBe(false);
  });

  it('only accepts the literal "true" for boolean-style flags (never "false")', () => {
    expect(publicClinicListQuerySchema.safeParse({ openNow: 'true' }).success).toBe(true);
    expect(publicClinicListQuerySchema.safeParse({ openNow: 'false' }).success).toBe(false);
  });

  it('accepts a valid facilityType and rejects an unknown one', () => {
    expect(publicClinicListQuerySchema.safeParse({ facilityType: 'SURGERY' }).success).toBe(true);
    expect(publicClinicListQuerySchema.safeParse({ facilityType: 'ROOFTOP_POOL' }).success).toBe(false);
  });

  it('accepts appointmentRequired as a "true"-only flag, same as the other tri-state filters', () => {
    expect(publicClinicListQuerySchema.safeParse({ appointmentRequired: 'true' }).success).toBe(true);
    expect(publicClinicListQuerySchema.safeParse({ appointmentRequired: 'false' }).success).toBe(false);
  });
});

describe('publicClinicSlugParamsSchema', () => {
  it('accepts a well-formed slug', () => {
    expect(publicClinicSlugParamsSchema.safeParse({ slug: 'mewmew-pet-care-banasree' }).success).toBe(true);
  });

  it('rejects an empty slug', () => {
    expect(publicClinicSlugParamsSchema.safeParse({ slug: '' }).success).toBe(false);
  });

  it('rejects a slug with uppercase or spaces', () => {
    expect(publicClinicSlugParamsSchema.safeParse({ slug: 'Not A Slug' }).success).toBe(false);
  });
});
