import { Request, Response } from 'express';

// The middleware reads config.SPAY_NEUTER_ENABLED at call time (not at
// module-load time), so we mock the whole config module and mutate the
// mocked value between assertions rather than re-importing per test.
const mockConfig: { SPAY_NEUTER_ENABLED: string } = { SPAY_NEUTER_ENABLED: 'true' };
jest.mock('../../config', () => ({
  get config() {
    return mockConfig;
  },
}));

import { requireSpayNeuterEnabled } from '../spayNeuterEnabled';

function makeRes(): Response {
  return {} as Response;
}

describe('requireSpayNeuterEnabled (SPAY_NEUTER_ENABLED kill switch)', () => {
  afterEach(() => {
    mockConfig.SPAY_NEUTER_ENABLED = 'true';
  });

  it('calls next() with no error when the flag is enabled (default)', () => {
    mockConfig.SPAY_NEUTER_ENABLED = 'true';
    const next = jest.fn();
    requireSpayNeuterEnabled({} as Request, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(err) with a stable 503 SPAY_NEUTER_DISABLED error when the flag is disabled', () => {
    mockConfig.SPAY_NEUTER_ENABLED = 'false';
    const next = jest.fn();
    requireSpayNeuterEnabled({} as Request, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SPAY_NEUTER_DISABLED');
  });

  it('treats any value other than the literal string "false" as enabled', () => {
    // Defensive: zod coerces to 'true'/'false' strings only, but guard
    // against a future refactor accidentally loosening the comparison.
    mockConfig.SPAY_NEUTER_ENABLED = 'TRUE';
    const next = jest.fn();
    requireSpayNeuterEnabled({} as Request, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
