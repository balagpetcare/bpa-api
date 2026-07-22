import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import * as ctrl from './campaign-checkin.controller';
import {
  scanQrSchema,
  searchBookingSchema,
  vaccinateSchema,
  vaccinationRecordListQuerySchema,
} from './campaign-checkin.types';

const volunteerRouter = Router();
const adminRouter = Router();

// All volunteer routes require authentication
volunteerRouter.use(authenticate);

// ─── QR + Search ─────────────────────────────────────────────────
volunteerRouter.post(
  '/scan-qr',
  authorize('campaign_checkin', 'read'),
  validate(scanQrSchema, 'body'),
  ctrl.scanQr,
);
volunteerRouter.get(
  '/search',
  authorize('campaign_checkin', 'read'),
  validate(searchBookingSchema, 'query'),
  ctrl.searchBookings,
);
volunteerRouter.get(
  '/pet-bookings/:petBookingId',
  authorize('campaign_checkin', 'read'),
  ctrl.getPetBooking,
);

// ─── Check-In ─────────────────────────────────────────────────────
volunteerRouter.patch(
  '/pet-bookings/:petBookingId/checkin',
  authorize('campaign_checkin', 'checkin'),
  ctrl.checkIn,
);

// ─── Vaccinate ────────────────────────────────────────────────────
volunteerRouter.patch(
  '/pet-bookings/:petBookingId/vaccinate',
  authorize('campaign_checkin', 'checkin'),
  validate(vaccinateSchema, 'body'),
  ctrl.vaccinate,
);

// ─── Admin routes ─────────────────────────────────────────────────
adminRouter.use(authenticate);

adminRouter.get(
  '/vaccination-records',
  authorize('vaccination_records', 'read'),
  validate(vaccinationRecordListQuerySchema, 'query'),
  ctrl.listVaccinationRecords,
);
adminRouter.get(
  '/pets/:petId/vaccination-history',
  authorize('pets', 'read'),
  ctrl.getPetVaccinationHistory,
);

export { volunteerRouter as campaignCheckinVolunteerRouter, adminRouter as campaignCheckinAdminRouter };
