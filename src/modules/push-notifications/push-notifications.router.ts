import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requireLocalUser } from '../../middlewares/requireLocalUser';
import { validate } from '../../middlewares/validate';
import {
  registerDeviceSchema,
  updateDeviceTokenSchema,
  logoutDeviceSchema,
  listInboxSchema,
  trackOpenSchema,
  updatePreferencesSchema,
} from './push-notifications.types';
import {
  handleRegisterDevice,
  handleUpdateDeviceToken,
  handleLogoutDevice,
  handleGetInbox,
  handleUnreadCount,
  handleMarkRead,
  handleArchive,
  handleMarkAllRead,
  handleTrackOpen,
  handleGetPreferences,
  handleUpdatePreferences,
} from './push-notifications.controller';

const router = Router();

router.use(authenticate);
// The mobile app's only real sign-in path is WPA Central Auth SSO — its JWT
// `sub` is Central Auth's own id format, not a bpa_api local UUID. Every
// handler below filters/writes by `req.user.sub` as a `@db.Uuid` column
// (UserNotification.userId, NotificationPreference.userId,
// DeviceInstallation.userId), so it must be resolved/auto-provisioned to
// the local user row first — omitting this is what caused every real
// device user to see VALIDATION_ERROR ("Invalid data format in request")
// on both the inbox and preferences endpoints (Prisma P2023 trying to
// parse the Central Auth sub as a UUID). Same pattern as clinics.router.ts
// and membership-campaign.router.ts.
router.use(requireLocalUser);

// Devices
router.post('/devices', validate(registerDeviceSchema), handleRegisterDevice);
router.patch('/devices/token', validate(updateDeviceTokenSchema), handleUpdateDeviceToken);
router.post('/devices/logout', validate(logoutDeviceSchema), handleLogoutDevice);

// Inbox
router.get('/inbox', validate(listInboxSchema, 'query'), handleGetInbox);
router.get('/inbox/unread-count', handleUnreadCount);
router.patch('/inbox/mark-all-read', handleMarkAllRead);
router.patch('/inbox/:id/read', handleMarkRead);
router.patch('/inbox/:id/archive', handleArchive);
router.post('/inbox/:id/track', validate(trackOpenSchema), handleTrackOpen);

// Preferences
router.get('/preferences', handleGetPreferences);
router.patch('/preferences', validate(updatePreferencesSchema), handleUpdatePreferences);

export default router;
