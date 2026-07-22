import { Router, Request, Response, NextFunction } from 'express';
import { CampaignStatus } from '@prisma/client';
import { isValidUuid } from '../../utils/uuid';
import { validate } from '../../middlewares/validate';
import { publicReadLimiter } from '../../middlewares/rateLimiter';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as repo from './campaigns.repository';
import {
  campaignListQuerySchema, publicCampaignVenuesQuerySchema, type PublicCampaignVenuesQuery,
  publicCampaignDiscoverQuerySchema, type PublicCampaignDiscoverQuery,
} from './campaigns.types';
import { resolveLocationNamePath } from '../locations/locations.repository';

const router = Router();

// All statuses visible to the public (excludes draft/cancelled)
const PUBLIC_STATUSES: CampaignStatus[] = [
  CampaignStatus.published,
  CampaignStatus.registration_open,
  CampaignStatus.registration_closed,
  CampaignStatus.completed,
];

// Default listing shows only actively open/upcoming campaigns
const ACTIVE_PUBLIC_STATUSES: CampaignStatus[] = [
  CampaignStatus.published,
  CampaignStatus.registration_open,
];

// GET /api/v1/public/campaigns/featured
router.get(
  '/featured',
  publicReadLimiter,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await repo.listFeaturedCampaigns();
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/venues — location-first venue discovery
// (Dhaka City / Outside Dhaka -> Division -> District -> Upazila/Zone).
// Used by the public booking flow to find venues with an upcoming session
// in a given area before a specific campaign is chosen.
router.get(
  '/venues',
  publicReadLimiter,
  validate(publicCampaignVenuesQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as never as PublicCampaignVenuesQuery;
      const venues = await repo.listPublicCampaignVenues(query);
      const enriched = await Promise.all(venues.map(async (v) => ({
        ...v,
        locationPath: v.location ? await resolveLocationNamePath(v.location.id) : [],
      })));
      sendSuccess(res, enriched);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/discover — location-first campaign discovery.
// Given a selected location node (any level), find campaigns covering it or
// the nearest covered ancestor (Union -> Upazila -> District -> Division ->
// Nationwide). Returns [] when nothing is available in the area — that is
// an expected, valid response, not an error.
router.get(
  '/discover',
  publicReadLimiter,
  validate(publicCampaignDiscoverQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { locationId } = req.query as never as PublicCampaignDiscoverQuery;
      const results = await repo.discoverCampaignsByLocation(locationId);
      sendSuccess(res, results);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns
router.get(
  '/',
  publicReadLimiter,
  validate(campaignListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const query = req.query as never as import('./campaigns.types').CampaignListQuery;
      const requestedStatus = (query.status && PUBLIC_STATUSES.includes(query.status as CampaignStatus))
        ? (query.status as CampaignStatus)
        : undefined;

      const result = await repo.listCampaigns({ ...query, status: requestedStatus });

      let items = result.items.filter(c => PUBLIC_STATUSES.includes(c.status as CampaignStatus));

      if (!requestedStatus) {
        // Default: only show active/upcoming campaigns, filter out expired registration windows
        items = items.filter(c =>
          ACTIVE_PUBLIC_STATUSES.includes(c.status as CampaignStatus) &&
          (c.registrationCloseAt === null || new Date(c.registrationCloseAt) > now),
        );
      } else if (requestedStatus === CampaignStatus.registration_open) {
        // Even when explicitly filtering registration_open, exclude expired windows
        items = items.filter(c =>
          c.registrationCloseAt === null || new Date(c.registrationCloseAt) > now,
        );
      }

      sendSuccess(res, items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/:slug
router.get(
  '/:slug',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // App Control CTA destinations may carry either the campaign slug or
      // its UUID id (see app-control.service.ts validation) — fall back to
      // an id lookup so both resolve without a second endpoint.
      let campaign = await repo.getCampaignBySlug(req.params.slug);
      if (!campaign && isValidUuid(req.params.slug)) {
        campaign = await repo.getCampaignById(req.params.slug);
      }
      if (!campaign || !PUBLIC_STATUSES.includes(campaign.status as CampaignStatus)) {
        throw AppError.notFound('Campaign not found');
      }
      const withPaths = await withVenueLocationPaths(campaign);
      const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
      const filtered = locationId ? await repo.filterSessionsByBestTier(withPaths, locationId) : withPaths;
      sendSuccess(res, filtered);
    } catch (err) {
      next(err);
    }
  },
);

// Attach a resolved root->leaf location name path to each session's venue
// (e.g. "Dhaka Division > Dhaka District > Savar Upazila > Union X") so the
// public booking flow can show real area names instead of raw ids.
async function withVenueLocationPaths<
  T extends { sessions: Array<{ venue: { location?: { id: string } | null } | null }> },
>(campaign: T): Promise<T> {
  const locationIds = Array.from(new Set(
    campaign.sessions.map((s) => s.venue?.location?.id).filter((id): id is string => Boolean(id)),
  ));
  if (locationIds.length === 0) return campaign;

  const pathEntries = await Promise.all(
    locationIds.map(async (id) => [id, await resolveLocationNamePath(id)] as const),
  );
  const pathMap = new Map(pathEntries);

  for (const s of campaign.sessions) {
    if (s.venue?.location) {
      (s.venue as Record<string, unknown>).locationPath = pathMap.get(s.venue.location.id) ?? [];
    }
  }
  return campaign;
}

export default router;
