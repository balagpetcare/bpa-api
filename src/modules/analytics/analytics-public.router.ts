import { Router } from 'express';
import { publicEventTrackerHandler } from './analytics.controller';
import { authenticateOptional } from '../../middlewares/authenticateOptional';

const router = Router();

router.post('/events', authenticateOptional, publicEventTrackerHandler);

export default router;
