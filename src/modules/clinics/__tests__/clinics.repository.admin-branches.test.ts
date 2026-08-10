// Regression coverage for the Spay & Neuter "Add Participating Clinic" empty
// dropdown defect. The dropdown calls the same admin endpoint this repository
// backs (GET /admin/clinics/branches). Confirms two things directly at the
// query-construction layer:
//   1. The admin listing does NOT reuse a public-only "published" filter —
//      it must default to showing both published and unpublished branches
//      (only excluding archived ones), same as the working canonical
//      /clinics admin page.
//   2. Search/pagination parameters are forwarded into the query rather than
//      silently dropped, so a searchable selector doesn't lose branches.

jest.mock('../../../database/prisma', () => ({
  prisma: {
    clinicBranch: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  },
}));

import { prisma } from '../../../database/prisma';
import { listBranches } from '../clinics.repository';

const mockedFindMany = prisma.clinicBranch.findMany as jest.Mock;
const mockedCount = prisma.clinicBranch.count as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('clinics.repository.listBranches — admin query construction', () => {
  it('does not filter by published when the caller omits it (admin default: active-only, both publication states)', async () => {
    await listBranches({});

    const where = mockedFindMany.mock.calls[0][0].where;
    expect(where.published).toBeUndefined();
    expect(where.archivedAt).toBeNull(); // default: active (non-archived) only, per the repository's own default branch
  });

  it('respects an explicit published=true filter when the caller actually asks for it (e.g. a public-facing UI)', async () => {
    await listBranches({ published: 'true' });
    expect(mockedFindMany.mock.calls[0][0].where.published).toBe(true);
  });

  it('status=all includes archived branches instead of forcing archivedAt: null', async () => {
    await listBranches({ status: 'all' });
    expect(mockedFindMany.mock.calls[0][0].where.archivedAt).toBeUndefined();
  });

  it('forwards a search term into the query rather than dropping it silently', async () => {
    await listBranches({ search: 'gulshan' });
    const where = mockedFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('gulshan');
  });

  it('respects an explicit page/limit within the documented bound and requests the matching count', async () => {
    await listBranches({ page: 2, limit: 50 });
    expect(mockedFindMany.mock.calls[0][0].skip).toBe(50);
    expect(mockedFindMany.mock.calls[0][0].take).toBe(50);
    expect(mockedCount).toHaveBeenCalledTimes(1);
  });
});
