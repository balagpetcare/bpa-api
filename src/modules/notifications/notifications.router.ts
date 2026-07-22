import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import {
  handleListNotifications,
  handleUnreadCount,
  handleMarkRead,
  handleDismiss,
  handleMarkAllRead,
} from './notifications.controller';

const router = Router();

router.use(authenticate);

router.get('/',              handleListNotifications);
router.get('/unread-count',  handleUnreadCount);
router.patch('/mark-all-read', handleMarkAllRead);
router.patch('/:id/read',    handleMarkRead);
router.patch('/:id/dismiss', handleDismiss);

export default router;
