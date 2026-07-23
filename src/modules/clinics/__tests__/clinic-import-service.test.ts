import * as XLSX from 'xlsx';

jest.mock('../../../database/prisma', () => ({
  prisma: {
    clinicBranch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clinicBranchSource: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    clinicBranchPhone: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    clinicOrganization: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../database/prisma';
import { importClinicDirectory } from '../clinic-import.service';

const mocked = {
  branchFindUnique: prisma.clinicBranch.findUnique as jest.Mock,
  branchFindFirst: prisma.clinicBranch.findFirst as jest.Mock,
  branchCreate: prisma.clinicBranch.create as jest.Mock,
  branchUpdate: prisma.clinicBranch.update as jest.Mock,
  sourceFindMany: prisma.clinicBranchSource.findMany as jest.Mock,
  sourceDeleteMany: prisma.clinicBranchSource.deleteMany as jest.Mock,
  sourceCreateMany: prisma.clinicBranchSource.createMany as jest.Mock,
  phoneDeleteMany: prisma.clinicBranchPhone.deleteMany as jest.Mock,
  phoneCreateMany: prisma.clinicBranchPhone.createMany as jest.Mock,
  orgFindFirst: prisma.clinicOrganization.findFirst as jest.Mock,
  orgFindUniqueOrThrow: prisma.clinicOrganization.findUniqueOrThrow as jest.Mock,
  orgCreate: prisma.clinicOrganization.create as jest.Mock,
};

function bufferFromRows(rows: Record<string, unknown>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Directory');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const VALID_ROW = {
  'Clinic / Hospital / Vet Point Name': 'MewMew Pet Care',
  'Branch / Area': 'Banasree / Rampura',
  'City Corporation': 'DSCC (inferred)',
  'Address': 'House 34, Block F, Road 2, Banasree',
  'Contact Number': '01711-791249',
  'Normalized Unique Phone(s)': '01711791249',
  'Primary Phone Key': '01711791249',
  'Phone Duplicate Status': 'Unique primary phone',
  'Google Maps Search URL': 'https://maps.example.com/x',
  'Source URL(s)': 'https://mewmewshopbd.com/blog/vets-near-me',
  'Record Type': 'Branch/contact-level',
  'Notes': '',
};

beforeEach(() => jest.clearAllMocks());

describe('importClinicDirectory — dry run (commit: false)', () => {
  it('reports a new row as "inserted" without writing anything', async () => {
    mocked.branchFindUnique.mockResolvedValue(null);

    const report = await importClinicDirectory(bufferFromRows([VALID_ROW]), { commit: false });

    expect(report.totalRows).toBe(1);
    expect(report.inserted).toBe(1);
    expect(report.committed).toBe(false);
    expect(mocked.branchCreate).not.toHaveBeenCalled();
    expect(mocked.orgCreate).not.toHaveBeenCalled();
  });

  it('flags a row with no clinic name as "invalid" and never writes it', async () => {
    const report = await importClinicDirectory(
      bufferFromRows([{ ...VALID_ROW, 'Clinic / Hospital / Vet Point Name': '' }]),
      { commit: false },
    );

    expect(report.invalid).toBe(1);
    expect(report.inserted).toBe(0);
    expect(mocked.branchFindUnique).not.toHaveBeenCalled();
  });

  it('skips an exact duplicate row within the same workbook', async () => {
    mocked.branchFindUnique.mockResolvedValue(null);

    const report = await importClinicDirectory(bufferFromRows([VALID_ROW, VALID_ROW]), { commit: false });

    expect(report.inserted).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it('reports "unchanged" when the existing branch already matches, without writing', async () => {
    mocked.branchFindUnique.mockResolvedValue({
      id: 'branch-1',
      branchName: VALID_ROW['Clinic / Hospital / Vet Point Name'],
      address: VALID_ROW['Address'],
      area: VALID_ROW['Branch / Area'],
      cityCorporation: VALID_ROW['City Corporation'],
      googleMapUrl: VALID_ROW['Google Maps Search URL'],
      importNotes: null,
      phones: [{ phoneNumber: '01711791249' }],
    });
    mocked.sourceFindMany.mockResolvedValue([{ sourceUrl: 'https://mewmewshopbd.com/blog/vets-near-me' }]);

    const report = await importClinicDirectory(bufferFromRows([VALID_ROW]), { commit: false });

    expect(report.unchanged).toBe(1);
    expect(report.updated).toBe(0);
    expect(mocked.branchUpdate).not.toHaveBeenCalled();
  });

  it('reports "updated" when an existing branch differs from the sheet', async () => {
    mocked.branchFindUnique.mockResolvedValue({
      id: 'branch-1',
      branchName: VALID_ROW['Clinic / Hospital / Vet Point Name'],
      address: 'A stale, different address',
      area: VALID_ROW['Branch / Area'],
      cityCorporation: VALID_ROW['City Corporation'],
      googleMapUrl: VALID_ROW['Google Maps Search URL'],
      importNotes: null,
      phones: [{ phoneNumber: '01711791249' }],
    });
    mocked.sourceFindMany.mockResolvedValue([{ sourceUrl: 'https://mewmewshopbd.com/blog/vets-near-me' }]);

    const report = await importClinicDirectory(bufferFromRows([VALID_ROW]), { commit: false });

    expect(report.updated).toBe(1);
    expect(mocked.branchUpdate).not.toHaveBeenCalled(); // still a dry run
  });
});

describe('importClinicDirectory — commit: true', () => {
  it('creates a new organization and branch, never inventing lat/long or tri-state facts', async () => {
    mocked.branchFindUnique.mockResolvedValue(null);
    mocked.branchFindFirst.mockResolvedValue(null);
    mocked.orgFindFirst.mockResolvedValue(null);
    mocked.orgCreate.mockResolvedValue({ id: 'org-1', slug: 'mewmew-pet-care' });
    mocked.orgFindUniqueOrThrow.mockResolvedValue({ id: 'org-1', slug: 'mewmew-pet-care' });
    mocked.branchCreate.mockResolvedValue({ id: 'branch-1' });

    await importClinicDirectory(bufferFromRows([VALID_ROW]), { commit: true });

    expect(mocked.orgCreate).toHaveBeenCalledTimes(1);
    const branchCreateArgs = mocked.branchCreate.mock.calls[0][0];
    expect(branchCreateArgs.data.organizationId).toBe('org-1');
    // The importer never sets latitude/longitude/emergencyAvailability/
    // open24Hours — those stay at the schema's UNKNOWN/null defaults
    // because the source sheet has no such columns.
    expect(branchCreateArgs.data).not.toHaveProperty('latitude');
    expect(branchCreateArgs.data).not.toHaveProperty('longitude');
    expect(branchCreateArgs.data).not.toHaveProperty('emergencyAvailability');
    expect(branchCreateArgs.data).not.toHaveProperty('open24Hours');
  });

  it('reuses an existing organization matched by case-insensitive name instead of duplicating it', async () => {
    mocked.branchFindUnique.mockResolvedValue(null);
    mocked.branchFindFirst.mockResolvedValue(null);
    mocked.orgFindFirst
      .mockResolvedValueOnce(null) // exact-slug lookup
      .mockResolvedValueOnce({ id: 'existing-org', slug: 'existing-org-slug' }); // case-insensitive name lookup
    mocked.orgFindUniqueOrThrow.mockResolvedValue({ id: 'existing-org', slug: 'existing-org-slug' });
    mocked.branchCreate.mockResolvedValue({ id: 'branch-1' });

    await importClinicDirectory(bufferFromRows([VALID_ROW]), { commit: true });

    expect(mocked.orgCreate).not.toHaveBeenCalled();
    const branchCreateArgs = mocked.branchCreate.mock.calls[0][0];
    expect(branchCreateArgs.data.organizationId).toBe('existing-org');
  });
});
