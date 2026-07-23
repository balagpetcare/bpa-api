jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
  TriState: {},
}));

import { clinicDirectorySeedData } from '../seed/data/clinic-directory.seed-data';
import { seedClinicDirectory } from '../seed/clinic-directory.seed';

describe('clinic directory seed', () => {
  it('processes the full clinic snapshot deterministically', async () => {
    const organizationRows = new Map<string, { id: string }>();
    const branchRows = new Map<string, { id: string }>();

    const prisma = {
      clinicOrganization: {
        upsert: jest.fn(async ({ where }: any) => {
          organizationRows.set(where.slug, { id: `org:${where.slug}` });
        }),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => organizationRows.get(where.slug)),
      },
      clinicBranch: {
        upsert: jest.fn(async ({ where }: any) => {
          branchRows.set(where.slug, { id: `branch:${where.slug}` });
        }),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => branchRows.get(where.slug)),
      },
      clinicBranchPhone: { upsert: jest.fn(async () => undefined) },
      clinicBranchOpeningHours: { upsert: jest.fn(async () => undefined) },
      clinicBranchService: { upsert: jest.fn(async () => undefined) },
      clinicBranchAnimalType: { upsert: jest.fn(async () => undefined) },
      clinicBranchFacility: { upsert: jest.fn(async () => undefined) },
      clinicBranchSource: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
      },
      clinicOrganizationSocialLink: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
      },
      clinicBranchSocialLink: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
      },
      clinicBranchImage: { upsert: jest.fn(async () => undefined) },
    } as any;

    const result = await seedClinicDirectory(prisma);

    const expectedOrganizations = clinicDirectorySeedData.organizations.length;
    const expectedBranches = clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.length, 0);

    expect(result.organizations).toBe(expectedOrganizations);
    expect(result.branches).toBe(expectedBranches);
    expect(prisma.clinicOrganization.upsert).toHaveBeenCalledTimes(expectedOrganizations);
    expect(prisma.clinicBranch.upsert).toHaveBeenCalledTimes(expectedBranches);
  });
});
