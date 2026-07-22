import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import {
  handleSummary,
  handlePendingActions,
  handleRecentActivity,
  handleSystemHealth,
} from './dashboard.controller';

const router = Router();

router.use(authenticate);

router.get('/summary',         handleSummary);
router.get('/recent-activity', handleRecentActivity);
router.get('/pending-actions', handlePendingActions);
router.get('/system-health',   handleSystemHealth);

export default router;
