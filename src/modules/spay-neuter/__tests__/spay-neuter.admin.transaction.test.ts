// Regression coverage for Phase 4's "creation is transactional so the
// clinic profile and default services do not become partially created"
// requirement. A real-Postgres integration test can't easily fault-inject
// a failure partway through a live transaction, so this proves the actual
// code-level guarantee instead: createClinicProfile performs exactly one
// prisma.$transaction() call, and both the profile create and the service
// createMany happen through the transactional `tx` client passed into it —
// never as two independent top-level prisma calls that could partially
// commit.

const txSpayClinicProfileCreate = jest.fn();
const txSpayClinicServiceCreateMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    clinicBranch: { findUnique: jest.fn() },
    spayClinicProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../utils/audit', () => ({ writeAuditLog: jest.fn() }));

import { prisma } from '../../../database/prisma';
import { createClinicProfile } from '../spay-neuter.admin.service';

const mockedFindUniqueBranch = prisma.clinicBranch.findUnique as jest.Mock;
// This single mock backs BOTH real call sites in createClinicProfile: the
// pre-transaction duplicate check, and (on the success path only)
// getClinicProfile's final read. Configured per-test via
// mockResolvedValueOnce so each call site gets the right answer.
const mockedFindUniqueProfile = prisma.spayClinicProfile.findUnique as jest.Mock;
const mockedTransaction = prisma.$transaction as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedFindUniqueBranch.mockResolvedValue({ id: 'branch-1' });
});

describe('createClinicProfile — transactional integrity', () => {
  it('creates the profile and both default services through a single $transaction call, not independent top-level writes', async () => {
    mockedFindUniqueProfile
      .mockResolvedValueOnce(null) // duplicate check: no existing profile
      .mockResolvedValueOnce({ id: 'profile-1', services: [] }); // getClinicProfile's final read
    txSpayClinicProfileCreate.mockResolvedValue({ id: 'profile-1' });
    txSpayClinicServiceCreateMany.mockResolvedValue({ count: 2 });

    mockedTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        spayClinicProfile: { create: txSpayClinicProfileCreate },
        spayClinicService: { createMany: txSpayClinicServiceCreateMany },
      }),
    );

    await createClinicProfile({ clinicBranchId: 'branch-1', concurrentOperationCapacity: 1 } as never, 'actor-1');

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(txSpayClinicProfileCreate).toHaveBeenCalledTimes(1);
    expect(txSpayClinicServiceCreateMany).toHaveBeenCalledTimes(1);
    // The service createMany call is not observable outside the tx callback
    // ordering above — proven by both mocks only ever being invoked via the
    // object handed to the $transaction callback, never via a bare
    // `prisma.spayClinicProfile.create`/`prisma.spayClinicService.createMany`.
  });

  it('propagates a failure from the service seeding step without the caller ever seeing a created profile (the whole transaction rejects)', async () => {
    mockedFindUniqueProfile.mockResolvedValueOnce(null); // duplicate check only — getClinicProfile must never run
    txSpayClinicProfileCreate.mockResolvedValue({ id: 'profile-1' });
    txSpayClinicServiceCreateMany.mockRejectedValue(new Error('simulated DB failure seeding default services'));

    mockedTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        spayClinicProfile: { create: txSpayClinicProfileCreate },
        spayClinicService: { createMany: txSpayClinicServiceCreateMany },
      }),
    );

    await expect(createClinicProfile({ clinicBranchId: 'branch-1', concurrentOperationCapacity: 1 } as never, 'actor-1')).rejects.toThrow(
      'simulated DB failure seeding default services',
    );

    // createClinicProfile must never reach getClinicProfile's final
    // success-path read once the transaction itself has rejected — only
    // one call to the shared findUnique mock (the duplicate check).
    expect(mockedFindUniqueProfile).toHaveBeenCalledTimes(1);
  });
});
