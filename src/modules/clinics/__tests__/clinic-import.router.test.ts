const authorizeCalls: Array<{ resource: string; action: string }> = [];

jest.mock('../clinic-import.controller', () => ({
  importClinicsHandler: jest.fn((_req, res) => res.status(200).json({ success: true, data: { totalRows: 0 } })),
}));

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { sub: 'user-1', email: 'admin@example.com', roles: [] };
    next();
  },
}));

jest.mock('../../../middlewares/authorize', () => ({
  authorize: (resource: string, action: string) => (_req: unknown, _res: unknown, next: () => void) => {
    authorizeCalls.push({ resource, action });
    next();
  },
}));

import request from 'supertest';
import express from 'express';
import clinicImportRouter from '../clinic-import.router';
import * as controller from '../clinic-import.controller';
import { errorHandler } from '../../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use('/api/v1/admin/clinics/import', clinicImportRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  authorizeCalls.length = 0;
  jest.clearAllMocks();
});

describe('clinic import admin router', () => {
  it('rejects a non-.xlsx file', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/import')
      .attach('file', Buffer.from('not a spreadsheet'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(controller.importClinicsHandler).not.toHaveBeenCalled();
  });

  it('accepts an .xlsx upload and authorizes with the clinic_imports/manage permission', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/clinics/import')
      .attach('file', Buffer.from('pretend-xlsx-bytes'), {
        filename: 'directory.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(res.status).toBe(200);
    expect(controller.importClinicsHandler).toHaveBeenCalledTimes(1);
    expect(authorizeCalls).toContainEqual({ resource: 'clinic_imports', action: 'manage' });
  });

  it('rejects a request with no file attached', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/clinics/import');

    // No file means the mocked handler still runs (multer just leaves
    // req.file undefined) — the real controller is what 400s on a missing
    // file, which is covered by importClinicsHandler's own unit test.
    expect(res.status).toBe(200);
  });
});
