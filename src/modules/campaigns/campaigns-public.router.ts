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
  publicCampaignSessionsQuerySchema, type PublicCampaignSessionsQuery,
} from './campaigns.types';
import { resolveLocationNamePath } from '../locations/locations.repository';
import { computeSessionStatus } from './campaign-session-status';

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

// App Control CTA destinations may carry either the campaign slug or its
// UUID id (see app-control.service.ts validation) — fall back to an id
// lookup so both resolve without a second endpoint. Shared by every public
// per-campaign route below. Full variant — includes the whole `sessions`
// collection; only use where the caller actually needs it (the classic
// `GET /:slug` with `includeSessions` defaulted/true).
async function resolvePublicCampaign(slugOrId: string) {
  let campaign = await repo.getCampaignBySlug(slugOrId);
  if (!campaign && isValidUuid(slugOrId)) {
    campaign = await repo.getCampaignById(slugOrId);
  }
  if (!campaign || !PUBLIC_STATUSES.includes(campaign.status as CampaignStatus)) {
    throw AppError.notFound('Campaign not found');
  }
  return campaign;
}

// Lite variant — same slug/id/status resolution, but never fetches the
// `sessions` relation at the DB level. Use for any route that only needs
// campaign metadata/id/status (coverage summary, paginated session list,
// single-session lookup) — none of these need the raw sessions collection.
async function resolvePublicCampaignLite(slugOrId: string) {
  let campaign = await repo.getCampaignBySlugLite(slugOrId);
  if (!campaign && isValidUuid(slugOrId)) {
    campaign = await repo.getCampaignByIdLite(slugOrId);
  }
  if (!campaign || !PUBLIC_STATUSES.includes(campaign.status as CampaignStatus)) {
    throw AppError.notFound('Campaign not found');
  }
  return campaign;
}

// GET /api/v1/public/campaigns/:slug
// `includeSessions=false` returns campaign metadata plus a small bounded
// `sessionStats` aggregate instead of the (potentially hundreds-long) raw
// `sessions` array — `sessions` is still present as `[]` so the response
// shape stays stable for consumers that don't opt in to the lite form.
// Default (param omitted or any value other than the literal "false")
// preserves the exact original full-payload behaviour for every existing
// consumer (mobile app, registration/waitlist flows that request it, etc).
router.get(
  '/:slug',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeSessions = req.query.includeSessions !== 'false';

      if (!includeSessions) {
        const campaign = await resolvePublicCampaignLite(req.params.slug);
        const sessionStats = await repo.getCampaignSessionStats(campaign.id);
        sendSuccess(res, { ...campaign, sessions: [], sessionStats });
        return;
      }

      const campaign = await resolvePublicCampaign(req.params.slug);
      const withPaths = await withVenueLocationPaths(campaign);
      const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
      const filtered = locationId ? await repo.filterSessionsByBestTier(withPaths, locationId) : withPaths;
      sendSuccess(res, filtered);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/:slug/coverage — compact divisions/districts/
// venues/sessions/capacity summary + a bounded Division -> District -> Venue
// tree, so the public page never has to derive coverage from a full session
// dump on the client.
router.get(
  '/:slug/coverage',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await resolvePublicCampaignLite(req.params.slug);
      const summary = await repo.getCampaignCoverageSummary(campaign.id);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/:slug/sessions — searchable/filterable/
// paginated session list backing the "Sessions & Venues" UI and the
// Register/Waitlist session pickers. Defaults to upcoming sessions, soonest
// first; never returns more than `limit` rows.
router.get(
  '/:slug/sessions',
  publicReadLimiter,
  validate(publicCampaignSessionsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await resolvePublicCampaignLite(req.params.slug);
      const query = req.query as never as PublicCampaignSessionsQuery;
      const result = await repo.listCampaignSessions(campaign.id, campaign.status as CampaignStatus, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/public/campaigns/:slug/sessions/:sessionId — resolves exactly
// one session by its canonical UUID. Backs `?session=<id>` deep links
// (Register/Waitlist) so resuming a specific session never requires
// downloading every session in the campaign to find it.
router.get(
  '/:slug/sessions/:sessionId',
  publicReadLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isValidUuid(req.params.sessionId)) {
        throw AppError.notFound('Session not found');
      }
      const campaign = await resolvePublicCampaignLite(req.params.slug);
      const session = await repo.getCampaignSessionById(campaign.id, req.params.sessionId);
      if (!session) {
        throw AppError.notFound('Session not found');
      }
      const status = computeSessionStatus(session, { status: campaign.status as CampaignStatus });
      sendSuccess(res, {
        id: session.id,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        capacity: session.capacity,
        bookedCount: session.bookedCount,
        isActive: session.isActive,
        notes: session.notes,
        status,
        venue: session.venue ? {
          id: session.venue.id,
          name: session.venue.name,
          address: session.venue.address,
          googleMapsUrl: session.venue.googleMapsUrl,
          locationId: session.venue.locationId,
          locationLabel: repo.venueLocationLabel(session.venue),
        } : null,
      });
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
