import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { RESOURCES, ACTIONS } from '../../config/constants';
import {
  summaryHandler,
  formsHandler,
  overviewHandler,
  trafficHandler,
  revenueHandler,
  membershipHandler,
  campaignsHandler,
  donationsHandler,
  petCensusHandler,
  supportHandler,
  conversionsHandler,
  liveHandler,
} from './analytics.controller';

const router = Router();

router.use(authenticate);
router.use(authorize(RESOURCES.ANALYTICS, ACTIONS.READ));

// Legacy compatibility routes
router.get('/summary', summaryHandler);
router.get('/forms', formsHandler);

// Redesigned analytics routes
router.get('/overview', overviewHandler);
router.get('/traffic', trafficHandler);
router.get('/revenue', revenueHandler);
router.get('/membership', membershipHandler);
router.get('/campaigns', campaignsHandler);
router.get('/donations', donationsHandler);
router.get('/pet-census', petCensusHandler);
router.get('/support', supportHandler);
router.get('/conversions', conversionsHandler);
router.get('/live', liveHandler);

export default router;
