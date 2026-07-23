// Integration test: exercises the real router → controller → service →
// repository stack, only the database itself is faked (Prisma mocked at the
// lowest layer) — this is the level at which "never expose admin-only
// fields" and "published-only filtering" get enforced, so it's worth
// testing above the unit level.

jest.mock('../../../database/prisma', () => ({
  prisma: {
    clinicBranch: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    clinicBranchService: { findMany: jest.fn() },
    clinicBranchAnimalType: { findMany: jest.fn() },
  },
}));

jest.mock('../../../config', () => ({ config: { FRONTEND_URL: 'https://bpa.example.com' } }));

import request from 'supertest';
import express from 'express';
import { prisma } from '../../../database/prisma';
import clinicsPublicRouter from '../clinics-public.router';
import { errorHandler } from '../../../middlewares/errorHandler';

const mockedFindMany = prisma.clinicBranch.findMany as jest.Mock;
const mockedFindFirst = prisma.clinicBranch.findFirst as jest.Mock;

function buildApp() {
  const app = express();
  app.use('/api/v1/public/clinics', clinicsPublicRouter);
  app.use(errorHandler);
  return app;
}

const FULL_BRANCH_ROW = {
  id: 'branch-1',
  organizationId: 'org-1',
  branchName: 'Central Veterinary Hospital',
  slug: 'central-veterinary-hospital-old-dhaka',
  address: '48 Kazi Alauddin Road, Dhaka 1000',
  area: 'Old Dhaka',
  cityCorporation: 'DSCC',
  district: null,
  postalCode: null,
  latitude: null,
  longitude: null,
  googleMapUrl: 'https://maps.example.com/x',
  email: null,
  timezone: 'Asia/Dhaka',
  emergencyAvailability: 'YES',
  open24Hours: 'YES',
  appointmentRequired: 'UNKNOWN',
  accessibilityNotes: null,
  verificationStatus: 'VERIFIED',
  lastVerifiedAt: null,
  published: true,
  // Admin-only bookkeeping — must never reach the public response.
  importNotes: 'Internal note: phone unverified, call before publishing',
  importKey: 'central-veterinary-hospital|old-dhaka|kazi-alauddin|01745137090',
  createdById: 'user-abc',
  updatedById: 'user-abc',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  organization: {
    id: 'org-1',
    name: 'Central Veterinary Hospital',
    slug: 'central-veterinary-hospital',
    description: null,
    logoUrl: null,
    website: null,
    verificationStatus: 'VERIFIED',
    claimedStatus: 'UNCLAIMED',
    published: true,
    featured: true,
    createdById: 'user-abc',
    updatedById: 'user-abc',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  phones: [{ id: 'p1', branchId: 'branch-1', phoneNumber: '01745137090', label: null, isPrimary: true, whatsappAvailable: 'UNKNOWN', sortOrder: 0, createdAt: new Date() }],
  socialLinks: [],
  openingHours: [],
  closures: [],
  services: [],
  animalTypes: [],
  facilities: [],
  images: [],
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/public/clinics (integration)', () => {
  it('returns a sanitized DTO that never leaks import notes, import keys, or audit fields', async () => {
    mockedFindMany.mockResolvedValue([FULL_BRANCH_ROW]);

    const res = await request(buildApp()).get('/api/v1/public/clinics');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const [clinic] = res.body.data;

    expect(clinic.branchName).toBe('Central Veterinary Hospital');
    expect(clinic.slug).toBe('central-veterinary-hospital-old-dhaka');
    for (const forbiddenKey of ['importNotes', 'importKey', 'createdById', 'updatedById', 'createdAt', 'updatedAt', 'sources']) {
      expect(clinic).not.toHaveProperty(forbiddenKey);
    }
  });

  it('only ever queries for published branches under published organizations', async () => {
    mockedFindMany.mockResolvedValue([]);

    await request(buildApp()).get('/api/v1/public/clinics');

    const whereArg = mockedFindMany.mock.calls[0][0].where;
    expect(whereArg.published).toBe(true);
    expect(whereArg.organization).toMatchObject({ published: true });
  });

  it('includes normalized call/directions/share action links', async () => {
    mockedFindMany.mockResolvedValue([FULL_BRANCH_ROW]);

    const res = await request(buildApp()).get('/api/v1/public/clinics');
    const [clinic] = res.body.data;

    expect(clinic.actions.call).toBe('tel:01745137090');
    expect(clinic.actions.directions).toBe('https://maps.example.com/x');
    expect(clinic.actions.share).toBe('https://bpa.example.com/clinics/central-veterinary-hospital-old-dhaka');
  });

  it('sets a public Cache-Control header', async () => {
    mockedFindMany.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/v1/public/clinics');

    expect(res.headers['cache-control']).toContain('public');
  });
});

describe('GET /api/v1/public/clinics/:slug (integration)', () => {
  it('returns 404 for a slug with no published match', async () => {
    mockedFindFirst.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/public/clinics/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns the sanitized clinic for a published match, with distanceKm always null', async () => {
    mockedFindFirst.mockResolvedValue(FULL_BRANCH_ROW);

    const res = await request(buildApp()).get('/api/v1/public/clinics/central-veterinary-hospital-old-dhaka');

    expect(res.status).toBe(200);
    expect(res.body.data.distanceKm).toBeNull();
    expect(res.body.data).not.toHaveProperty('importNotes');
  });

  it('queries findFirst scoped to published branch + published organization', async () => {
    mockedFindFirst.mockResolvedValue(FULL_BRANCH_ROW);

    await request(buildApp()).get('/api/v1/public/clinics/central-veterinary-hospital-old-dhaka');

    const whereArg = mockedFindFirst.mock.calls[0][0].where;
    expect(whereArg.published).toBe(true);
    expect(whereArg.organization).toMatchObject({ published: true });
  });
});
