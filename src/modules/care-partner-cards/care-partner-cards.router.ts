import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { validateUuid } from '../../middlewares/validateUuid';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { RESOURCES, ACTIONS } from '../../config/constants';
import { revokeCardSchema, reactivateCardSchema, cardListQuerySchema, verifyCardQuerySchema, verificationLogListQuerySchema } from './care-partner-cards.types';
import {
  listCardsHandler, getCardHandler, revokeCardHandler, reactivateCardHandler,
  listVerificationLogsHandler, getVerificationLogHandler,
  verifyCardHandler,
} from './care-partner-cards.controller';

const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/', authorize(RESOURCES.CARE_PARTNER_CARDS, ACTIONS.READ), validate(cardListQuerySchema, 'query'), listCardsHandler);
// Specific literal routes MUST come before the /:id wildcard or Express will match them as UUIDs
adminRouter.get('/verification-logs', authorize(RESOURCES.CARD_VERIFICATION_LOGS, ACTIONS.READ), validate(verificationLogListQuerySchema, 'query'), listVerificationLogsHandler);
adminRouter.get('/verification-logs/:id', validateUuid('id'), authorize(RESOURCES.CARD_VERIFICATION_LOGS, ACTIONS.READ), getVerificationLogHandler);
adminRouter.get('/:id', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_CARDS, ACTIONS.READ), getCardHandler);
adminRouter.patch('/:id/revoke', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_CARDS, ACTIONS.UPDATE), validate(revokeCardSchema), revokeCardHandler);
adminRouter.patch('/:id/reactivate', validateUuid('id'), authorize(RESOURCES.CARE_PARTNER_CARDS, ACTIONS.UPDATE), validate(reactivateCardSchema), reactivateCardHandler);

const publicRouter = Router();
publicRouter.get('/verify', publicReadLimiter, validate(verifyCardQuerySchema, 'query'), verifyCardHandler);

export { adminRouter as carePartnerCardsAdminRouter, publicRouter as carePartnerCardsPublicRouter };
