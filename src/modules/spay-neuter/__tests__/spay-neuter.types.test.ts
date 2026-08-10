import { upsertClinicProfileSchema } from '../spay-neuter.types';

// Regression coverage for the "VALIDATION_ERROR / Invalid data format in
// request" bug reported when creating a Spay & Neuter participating
// clinic. That specific bug's root cause turned out to be a missing
// requireLocalUser middleware (see spay-neuter.router.ts), not a schema
// problem — these tests instead pin down the schema's actual, intended
// contract so Admin and API can never drift apart on field names, numeric
// typing, or valid ranges again.

const VALID_PAYLOAD = {
  clinicBranchId: '11111111-1111-1111-1111-111111111111',
  concurrentOperationCapacity: 1,
  slotHoldMinutes: 10,
  cancellationCutoffHours: 24,
  arriveBeforeMinutes: 20,
  checkinEarlyMinutes: 60,
};

describe('upsertClinicProfileSchema', () => {
  it('accepts a valid create payload with the documented defaults applied', () => {
    const result = upsertClinicProfileSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isAcceptingBookings).toBe(true);
      expect(result.data.bookingHorizonDays).toBe(30);
      expect(result.data.timezone).toBe('Asia/Dhaka');
    }
  });

  it('applies the documented defaults when optional numeric fields are omitted entirely', () => {
    const result = upsertClinicProfileSchema.safeParse({
      clinicBranchId: VALID_PAYLOAD.clinicBranchId,
      concurrentOperationCapacity: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slotHoldMinutes).toBe(10);
      expect(result.data.cancellationCutoffHours).toBe(24);
      expect(result.data.arriveBeforeMinutes).toBe(20);
      expect(result.data.checkinEarlyMinutes).toBe(60);
    }
  });

  it('rejects numeric fields sent as strings — the API contract requires real numbers, never numeric strings', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, concurrentOperationCapacity: '1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'concurrentOperationCapacity')).toBe(true);
    }
  });

  it('rejects a missing clinicBranchId', () => {
    const { clinicBranchId: _omit, ...rest } = VALID_PAYLOAD;
    const result = upsertClinicProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'clinicBranchId')).toBe(true);
    }
  });

  it('rejects a clinicBranchId that is not a valid UUID (e.g. a label or slug instead of an id)', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, clinicBranchId: 'Bala G Pet Clinic' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'clinicBranchId')).toBe(true);
    }
  });

  it('rejects a concurrent capacity below 1 with a structured, field-scoped detail', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, concurrentOperationCapacity: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'concurrentOperationCapacity');
      expect(issue).toBeDefined();
      expect(typeof issue?.message).toBe('string');
    }
  });

  it('rejects a negative cancellation cutoff', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, cancellationCutoffHours: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer slot hold', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, slotHoldMinutes: 10.5 });
    expect(result.success).toBe(false);
  });

  it('rejects earliest check-in set earlier than the recommended arrival window, scoped to the checkinEarlyMinutes field', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, arriveBeforeMinutes: 20, checkinEarlyMinutes: 10 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'checkinEarlyMinutes');
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/earlier than the recommended arrival/i);
    }
  });

  it('accepts earliest check-in exactly equal to the recommended arrival window (boundary, not strictly less-than)', () => {
    const result = upsertClinicProfileSchema.safeParse({ ...VALID_PAYLOAD, arriveBeforeMinutes: 20, checkinEarlyMinutes: 20 });
    expect(result.success).toBe(true);
  });
});
