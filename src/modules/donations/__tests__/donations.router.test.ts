jest.mock('../donations.controller', () => ({
  getDonationPageDataHandler: jest.fn((_req, res) => {
    res.status(200).json({ success: true, data: { route: 'page-data' } });
  }),
  getActivePurposesHandler: jest.fn(),
  getActiveCampaignsHandler: jest.fn(),
  getCampaignDetailHandler: jest.fn(),
  initializeDonationHandler: jest.fn(),
  getDonationStatusHandler: jest.fn(),
  getDonationReceiptHandler: jest.fn(),
  getDonationReceiptPdfHandler: jest.fn(),
  qrRedirectHandler: jest.fn(),
  getPublishedImpactStoriesHandler: jest.fn(),
  getImpactStoryDetailHandler: jest.fn(),
  getDashboardStatsHandler: jest.fn(),
  exportDonationsCsvHandler: jest.fn(),
  listDonationsHandler: jest.fn(),
  getDonationDetailHandler: jest.fn(),
  updateDonationStatusHandler: jest.fn(),
  listPurposesHandler: jest.fn(),
  createPurposeHandler: jest.fn(),
  updatePurposeHandler: jest.fn(),
  deletePurposeHandler: jest.fn(),
  listCampaignsHandler: jest.fn(),
  createCampaignHandler: jest.fn(),
  updateCampaignHandler: jest.fn(),
  deleteCampaignHandler: jest.fn(),
  listQrCodesHandler: jest.fn(),
  createQrCodeHandler: jest.fn(),
  updateQrCodeHandler: jest.fn(),
  deleteQrCodeHandler: jest.fn(),
  generateQrImageHandler: jest.fn(),
  listImpactStoriesHandler: jest.fn(),
  createImpactStoryHandler: jest.fn(),
  updateImpactStoryHandler: jest.fn(),
  deleteImpactStoryHandler: jest.fn(),
  listTransparencyReportsHandler: jest.fn(),
  createTransparencyReportHandler: jest.fn(),
  updateTransparencyReportHandler: jest.fn(),
  deleteTransparencyReportHandler: jest.fn(),
  getSettingsHandler: jest.fn(),
  updateSettingsHandler: jest.fn(),
}));

jest.mock('../../../middlewares/authenticateOptional', () => ({
  authenticateOptional: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middlewares/authenticate', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middlewares/authorize', () => ({
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import express from 'express';
import { donationsPublicRouter } from '../donations.router';

describe('donations public router', () => {
  it('serves GET /page-data as an alias of the donation page payload route', async () => {
    const app = express();
    app.use('/api/v1/public/donations', donationsPublicRouter);

    const res = await request(app).get('/api/v1/public/donations/page-data');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { route: 'page-data' },
    });
  });
});
