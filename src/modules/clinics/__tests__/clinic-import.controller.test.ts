jest.mock('../clinic-import.service', () => ({
  importClinicDirectory: jest.fn(),
}));

jest.mock('../../../utils/audit', () => ({
  auditContextFromRequest: jest.fn(() => ({})),
  auditCreate: jest.fn(),
}));

import { importClinicsHandler } from '../clinic-import.controller';
import { importClinicDirectory } from '../clinic-import.service';
import { auditCreate } from '../../../utils/audit';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('importClinicsHandler', () => {
  it('rejects a request with no uploaded file', async () => {
    const req: any = { file: undefined, query: {} };
    const res = mockRes();
    const next = jest.fn();

    await importClinicsHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(importClinicDirectory).not.toHaveBeenCalled();
  });

  it('defaults to a dry run (commit: false) when ?commit is not "true"', async () => {
    (importClinicDirectory as jest.Mock).mockResolvedValue({
      totalRows: 1,
      inserted: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      invalid: 0,
      committed: false,
      rows: [],
    });
    const req: any = { file: { buffer: Buffer.from('x'), originalname: 'd.xlsx' }, query: {} };
    const res = mockRes();

    await importClinicsHandler(req, res, jest.fn());

    expect(importClinicDirectory).toHaveBeenCalledWith(req.file.buffer, { commit: false });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('commits and writes an audit log only when ?commit=true', async () => {
    (importClinicDirectory as jest.Mock).mockResolvedValue({
      totalRows: 1,
      inserted: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      invalid: 0,
      committed: true,
      rows: [],
    });
    const req: any = { file: { buffer: Buffer.from('x'), originalname: 'd.xlsx' }, query: { commit: 'true' } };
    const res = mockRes();

    await importClinicsHandler(req, res, jest.fn());

    expect(importClinicDirectory).toHaveBeenCalledWith(req.file.buffer, { commit: true });
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
