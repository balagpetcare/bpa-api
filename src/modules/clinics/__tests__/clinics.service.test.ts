jest.mock('../clinics.repository');

import { Prisma } from '@prisma/client';
import * as repo from '../clinics.repository';
import * as svc from '../clinics.service';

const mockRepo = repo as jest.Mocked<typeof repo>;

function makeMediaFile(overrides: Partial<{ id: string; url: string; mimeType: string }> = {}) {
  return { id: 'media-1', url: 'https://cdn.example.com/media/photo.jpg', mimeType: 'image/jpeg', ...overrides } as never;
}

function makeBranch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'branch-1',
    organizationId: 'org-1',
    branchName: 'Test Branch',
    address: '123 Road',
    latitude: null,
    longitude: null,
    email: null,
    phones: [{ phoneNumber: '01711791249' }],
    openingHours: [],
    verificationStatus: 'UNKNOWN',
    ...overrides,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('clinics.service — organization archive/restore', () => {
  it('archives an organization and forces it unpublished at the repository layer', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.setOrganizationArchived.mockResolvedValue(undefined as never);

    await svc.setOrganizationArchived('org-1', true, 'actor-1');

    expect(mockRepo.setOrganizationArchived).toHaveBeenCalledWith('org-1', true, 'actor-1');
  });

  it('restores an archived organization', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.setOrganizationArchived.mockResolvedValue(undefined as never);

    await svc.setOrganizationArchived('org-1', false, 'actor-1');

    expect(mockRepo.setOrganizationArchived).toHaveBeenCalledWith('org-1', false, 'actor-1');
  });
});

describe('clinics.service — permanent delete dependency protection', () => {
  it('blocks organization deletion when active branches still exist, listing sample names', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.countActiveBranches.mockResolvedValue(2);
    mockRepo.listBranchNamesForOrganization.mockResolvedValue(['Branch A', 'Branch B']);

    await expect(svc.deleteOrganization('org-1')).rejects.toThrow(/active branch/i);
    expect(mockRepo.deleteOrganization).not.toHaveBeenCalled();
  });

  it('allows organization deletion once it has zero active branches', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.countActiveBranches.mockResolvedValue(0);
    mockRepo.deleteOrganization.mockResolvedValue(undefined as never);

    await svc.deleteOrganization('org-1');

    expect(mockRepo.deleteOrganization).toHaveBeenCalledWith('org-1');
  });
});

describe('clinics.service — branch publish prerequisites', () => {
  it('rejects publishing a branch with no address, no coordinates, and no contact method', () => {
    expect(() =>
      svc.assertBranchPublishable(
        makeBranch({ address: null, latitude: null, longitude: null, phones: [], email: null }),
      ),
    ).toThrow(/address or map coordinates/i);
  });

  it('accepts a branch with coordinates but no address, as long as it has a phone', () => {
    expect(() =>
      svc.assertBranchPublishable(makeBranch({ address: null, latitude: 23.7, longitude: 90.4 })),
    ).not.toThrow();
  });

  it('rejects a branch with a location but no phone and no email', () => {
    expect(() => svc.assertBranchPublishable(makeBranch({ phones: [], email: null }))).toThrow(/phone number or an email/i);
  });

  it('setBranchPublished enforces the same prerequisites as create/update', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch({ address: null, latitude: null, longitude: null, phones: [], email: null }));

    await expect(svc.setBranchPublished('branch-1', true, 'actor-1')).rejects.toThrow(/address or map coordinates/i);
    expect(mockRepo.updateBranch).not.toHaveBeenCalled();
  });

  it('never blocks unpublishing, even if the branch is missing required fields', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch({ address: null, latitude: null, longitude: null, phones: [], email: null }));
    mockRepo.updateBranch.mockResolvedValue(undefined as never);

    await svc.setBranchPublished('branch-1', false, 'actor-1');

    expect(mockRepo.updateBranch).toHaveBeenCalledWith('branch-1', { published: false }, 'actor-1');
  });
});

describe('clinics.service — bulk publish skips unpublishable branches instead of forcing them', () => {
  it('publishes only the branches that meet the prerequisites and reports the rest as skipped', async () => {
    mockRepo.getBranchById.mockImplementation(async (id: string) =>
      id === 'good'
        ? makeBranch({ id: 'good' })
        : makeBranch({ id: 'bad', address: null, latitude: null, longitude: null, phones: [], email: null }),
    );
    mockRepo.bulkSetBranchPublished.mockResolvedValue(1);

    const result = await svc.bulkSetBranchPublished(['good', 'bad'], true, 'actor-1');

    expect(mockRepo.bulkSetBranchPublished).toHaveBeenCalledWith(['good'], true, 'actor-1');
    expect(result).toEqual({ count: 1, skipped: ['bad'] });
  });

  it('bulk-unpublish never needs the publishable check and always applies to every id', async () => {
    mockRepo.bulkSetBranchPublished.mockResolvedValue(2);

    const result = await svc.bulkSetBranchPublished(['a', 'b'], false, 'actor-1');

    expect(mockRepo.getBranchById).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 2, skipped: [] });
  });
});

describe('clinics.service — Media Library validation for organization logo/cover', () => {
  it('rejects a logoMediaId that does not exist', async () => {
    mockRepo.getOrganizationBySlug.mockResolvedValue(null);
    mockRepo.getMediaFileById.mockResolvedValue(null);

    await expect(
      svc.createOrganization({ name: 'Org', slug: 'org', logoMediaId: 'missing-media' } as never, 'actor-1'),
    ).rejects.toThrow(/does not exist/i);
    expect(mockRepo.createOrganization).not.toHaveBeenCalled();
  });

  it('rejects a coverMediaId that is not an image', async () => {
    mockRepo.getOrganizationBySlug.mockResolvedValue(null);
    mockRepo.getMediaFileById.mockResolvedValue(makeMediaFile({ mimeType: 'application/pdf' }));

    await expect(
      svc.createOrganization({ name: 'Org', slug: 'org', coverMediaId: 'media-1' } as never, 'actor-1'),
    ).rejects.toThrow(/not an image/i);
    expect(mockRepo.createOrganization).not.toHaveBeenCalled();
  });

  it('accepts a valid image media reference and persists it', async () => {
    mockRepo.getOrganizationBySlug.mockResolvedValue(null);
    mockRepo.getMediaFileById.mockResolvedValue(makeMediaFile());
    mockRepo.createOrganization.mockResolvedValue({ id: 'org-1' } as never);

    await svc.createOrganization({ name: 'Org', slug: 'org', logoMediaId: 'media-1' } as never, 'actor-1');

    expect(mockRepo.createOrganization).toHaveBeenCalled();
  });

  it('never re-validates when logoMediaId/coverMediaId are simply absent from an update', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.updateOrganization.mockResolvedValue({ id: 'org-1' } as never);

    await svc.updateOrganization('org-1', { name: 'Renamed' } as never, 'actor-1');

    expect(mockRepo.getMediaFileById).not.toHaveBeenCalled();
  });

  it('allows explicitly clearing logoMediaId (null) without a media lookup', async () => {
    mockRepo.getOrganizationById.mockResolvedValue({ id: 'org-1', name: 'Org' } as never);
    mockRepo.updateOrganization.mockResolvedValue({ id: 'org-1' } as never);

    await svc.updateOrganization('org-1', { logoMediaId: null } as never, 'actor-1');

    expect(mockRepo.getMediaFileById).not.toHaveBeenCalled();
    expect(mockRepo.updateOrganization).toHaveBeenCalled();
  });
});

describe('clinics.service — Media Library validation and dedup for branch gallery images', () => {
  it('rejects adding a non-image media file to the gallery', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch());
    mockRepo.getMediaFileById.mockResolvedValue(makeMediaFile({ mimeType: 'video/mp4' }));

    await expect(
      svc.addBranchImage('branch-1', { url: 'https://cdn.example.com/x.mp4', mediaFileId: 'media-1', isCover: false, sortOrder: 0 }),
    ).rejects.toThrow(/not an image/i);
    expect(mockRepo.addBranchImage).not.toHaveBeenCalled();
  });

  it('reports a friendly conflict when the same media file is already in the gallery (DB unique violation)', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch());
    mockRepo.getMediaFileById.mockResolvedValue(makeMediaFile());
    mockRepo.addBranchImage.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['branch_id', 'media_file_id'] },
      }),
    );

    await expect(
      svc.addBranchImage('branch-1', { url: 'https://cdn.example.com/x.jpg', mediaFileId: 'media-1', isCover: false, sortOrder: 0 }),
    ).rejects.toThrow(/already in the gallery/i);
  });

  it('rejects a full gallery replace containing the same mediaFileId twice', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch());

    await expect(
      svc.updateBranchRelated('branch-1', {
        images: [
          { url: 'https://cdn.example.com/a.jpg', mediaFileId: 'media-1', isCover: true, sortOrder: 0 },
          { url: 'https://cdn.example.com/a.jpg', mediaFileId: 'media-1', isCover: false, sortOrder: 1 },
        ],
      } as never),
    ).rejects.toThrow(/twice/i);
    expect(mockRepo.replaceBranchRelated).not.toHaveBeenCalled();
  });

  it('allows multiple legacy (mediaFileId-less) images in the same gallery replace', async () => {
    mockRepo.getBranchById.mockResolvedValue(makeBranch());
    mockRepo.replaceBranchRelated.mockResolvedValue(makeBranch());

    await svc.updateBranchRelated('branch-1', {
      images: [
        { url: 'https://cdn.example.com/legacy-a.jpg', isCover: true, sortOrder: 0 },
        { url: 'https://cdn.example.com/legacy-b.jpg', isCover: false, sortOrder: 1 },
      ],
    } as never);

    expect(mockRepo.replaceBranchRelated).toHaveBeenCalled();
  });
});

describe('clinics.service — UNKNOWN tri-state values are passed through untouched', () => {
  it('branchDataQualityWarnings never coerces missing data into a false/negative claim, only flags it', () => {
    const warnings = svc.branchDataQualityWarnings({
      latitude: null,
      longitude: null,
      phones: [],
      openingHours: [],
      verificationStatus: 'UNKNOWN',
    });

    expect(warnings).toEqual(
      expect.arrayContaining(['missing_coordinates', 'missing_phone', 'missing_hours', 'not_verified']),
    );
  });
});
