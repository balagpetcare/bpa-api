import { Prisma } from '@prisma/client';
import { errorHandler } from '../errorHandler';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq() {
  return { requestId: 'req-1', headers: {} } as any;
}

describe('errorHandler - schema drift errors (P2021/P2022)', () => {
  const originalEnv = process.env.NODE_ENV;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('logs a P2021 (missing table) error even in production, and responds 500 (not 200/[])', () => {
    process.env.NODE_ENV = 'production';
    const err = new Prisma.PrismaClientKnownRequestError('The table `public.partner_clinics` does not exist', {
      code: 'P2021',
      clientVersion: '5.22.0',
      meta: { table: 'public.partner_clinics' },
    });

    const res = mockRes();
    errorHandler(err, mockReq(), res, jest.fn());

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArg = consoleErrorSpy.mock.calls[0][0];
    expect(loggedArg.code).toBe('P2021');
    expect(loggedArg.message).toMatch(/schema drift/i);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).not.toBe('NOT_FOUND');
  });

  it('does not mistake a P2021 error for an empty result', () => {
    process.env.NODE_ENV = 'production';
    const err = new Prisma.PrismaClientKnownRequestError('missing column', {
      code: 'P2022',
      clientVersion: '5.22.0',
      meta: { column: 'status' },
    });

    const res = mockRes();
    errorHandler(err, mockReq(), res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
