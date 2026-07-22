import { CampaignStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { generateSlug } from '../../utils/slug';
import { prisma } from '../../database/prisma';
import * as repo from './campaigns.repository';
import * as locationRepo from '../locations/locations.repository';
import { getCampaignLiveStats } from './campaigns.stats';
import {
  deleteCampaignAndCollectOrphanMedia,
  performDeferredStorageCleanup,
} from '../media/media-delete.service';
import type { AuditContext } from '../../utils/audit';
import type {
  CreateCampaignDto, UpdateCampaignDto, CampaignListQuery,
  CreateSessionDto, UpdateSessionDto,
  CreateServiceDto, UpdateServiceDto,
  AssignDoctorDto, UpdateDoctorAssignmentDto, BulkAssignDoctorDto, AssignVolunteerDto,
  AvailableDoctorsQuery,
} from './campaigns.types';
import { parsePaginationQuery, buildPaginationMeta } from '../../utils/response';

// ─── Slug ────────────────────────────────────────────────────────

async function uniqueCampaignSlug(title: string, excludeId?: string): Promise<string> {
  const base = generateSlug(title);
  let candidate = base;
  let counter = 2;
  while (true) {
    const existing = await prisma.campaign.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (!existing) return candidate;
    candidate = `${base}-${counter++}`;
  }
}

// ─── Campaign ────────────────────────────────────────────────────

export async function createCampaign(dto: CreateCampaignDto, createdById: string) {
  const slug = await uniqueCampaignSlug(dto.title);
  return repo.createCampaign(dto, slug, createdById);
}

export async function listCampaigns(query: CampaignListQuery) {
  return repo.listCampaigns(query);
}

export async function getCampaign(id: string) {
  const [c, stats] = await Promise.all([
    repo.getCampaignById(id),
    getCampaignLiveStats(id).catch(() => null),
  ]);
  if (!c) throw AppError.notFound('Campaign not found');
  return { ...c, stats };
}

export async function updateCampaign(id: string, dto: UpdateCampaignDto) {
  const campaign = await getCampaign(id);
  
  if (dto.slug && dto.slug !== campaign.slug) {
    const existing = await prisma.campaign.findFirst({ where: { slug: dto.slug, id: { not: id } } });
    if (existing) throw AppError.conflict('Campaign with this slug already exists');
  }

  // Removed restriction: Only draft campaigns can be edited.
  // This allows fixing mistakes even after a campaign is published or registration is open.
  return repo.updateCampaign(id, dto);
}

export async function publishCampaign(id: string) {
  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.draft) throw AppError.badRequest('Campaign must be in draft to publish');
  return repo.updateCampaignStatus(id, CampaignStatus.published);
}

export async function openRegistration(id: string) {
  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.published) throw AppError.badRequest('Campaign must be published first');
  return repo.updateCampaignStatus(id, CampaignStatus.registration_open);
}

export async function closeRegistration(id: string) {
  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.registration_open) throw AppError.badRequest('Registration is not open');
  return repo.updateCampaignStatus(id, CampaignStatus.registration_closed);
}

export async function completeCampaign(id: string) {
  const campaign = await getCampaign(id);
  const completableStatuses: string[] = [CampaignStatus.registration_open, CampaignStatus.registration_closed];
  if (!completableStatuses.includes(campaign.status)) {
    throw AppError.badRequest('Campaign cannot be completed from its current status');
  }
  return repo.updateCampaignStatus(id, CampaignStatus.completed);
}

export async function cancelCampaign(id: string) {
  const campaign = await getCampaign(id);
  const terminalStatuses: string[] = [CampaignStatus.completed, CampaignStatus.cancelled];
  if (terminalStatuses.includes(campaign.status)) {
    throw AppError.badRequest('Campaign is already completed or cancelled');
  }
  return repo.updateCampaignStatus(id, CampaignStatus.cancelled);
}

export async function reopenCampaign(id: string) {
  const campaign = await getCampaign(id);

  const reopenableStatuses: CampaignStatus[] = [
    CampaignStatus.registration_closed,
    CampaignStatus.completed,
  ];

  if (!reopenableStatuses.includes(campaign.status as CampaignStatus)) {
    if (campaign.status === CampaignStatus.cancelled) {
      throw AppError.badRequest('Cancelled campaigns cannot be reopened. Create a new campaign instead.');
    }
    throw AppError.badRequest(`Campaign cannot be reopened from "${campaign.status}" status.`);
  }

  // Block reopen if registration close date is already past
  const now = new Date();
  const closeAt = campaign.registrationCloseAt ? new Date(campaign.registrationCloseAt) : null;
  if (closeAt && closeAt < now) {
    throw AppError.badRequest('Registration close date has passed. Update registration close date before reopening.');
  }

  return repo.updateCampaignStatus(id, CampaignStatus.registration_open);
}

export async function deleteCampaign(id: string, ctx?: AuditContext) {
  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.draft) throw AppError.badRequest('Only draft campaigns can be deleted');
  const cleanups = await prisma.$transaction((tx) =>
    deleteCampaignAndCollectOrphanMedia(tx, id),
  );
  for (const cleanup of cleanups) {
    await performDeferredStorageCleanup(cleanup.storageCleanup, ctx);
  }
  return campaign;
}

// ─── Sessions ────────────────────────────────────────────────────

async function validateVenueForSession(venueId: string): Promise<void> {
  const venue = await locationRepo.getVenueById(venueId);
  if (!venue) throw AppError.notFound('Venue not found');
  if (!venue.isActive) throw AppError.badRequest(`Venue "${venue.name}" is inactive and cannot be assigned to a session`);
}

async function getCampaignServiceOrThrow(campaignId: string, serviceId: string) {
  await getCampaign(campaignId);
  const service = await repo.getServiceById(serviceId);
  if (!service || service.campaignId !== campaignId) {
    throw AppError.notFound('Service not found in this campaign');
  }
  return service;
}

async function getCampaignServiceUsageCount(serviceId: string) {
  const [bookingUsage, vaccinationUsage] = await Promise.all([
    prisma.petBookingService.count({ where: { campaignServiceId: serviceId } }),
    prisma.vaccinationRecord.count({ where: { campaignServiceId: serviceId } }),
  ]);
  return bookingUsage + vaccinationUsage;
}

export async function createSession(campaignId: string, dto: CreateSessionDto) {
  await getCampaign(campaignId);
  await validateVenueForSession(dto.venueId);
  return repo.createSession(campaignId, dto);
}

export async function listSessions(campaignId: string) {
  await getCampaign(campaignId);
  return repo.listSessions(campaignId);
}

export async function getSession(sessionId: string) {
  const s = await repo.getSessionById(sessionId);
  if (!s) throw AppError.notFound('Session not found');
  return s;
}

export async function updateSession(campaignId: string, sessionId: string, dto: UpdateSessionDto) {
  await getCampaign(campaignId);
  const session = await getSession(sessionId);
  if (session.campaignId !== campaignId) throw AppError.notFound('Session not found in this campaign');
  if (dto.venueId) await validateVenueForSession(dto.venueId);
  return repo.updateSession(sessionId, dto);
}

export async function deleteSession(campaignId: string, sessionId: string) {
  await getCampaign(campaignId);
  const session = await getSession(sessionId);
  if (session.campaignId !== campaignId) throw AppError.notFound('Session not found in this campaign');
  const registrationCount = await prisma.campaignRegistration.count({ where: { sessionId } });
  if (registrationCount > 0) {
    throw AppError.conflict(`Cannot delete session: ${registrationCount} registration(s) exist for this session`);
  }
  return repo.deleteSession(sessionId);
}

// ─── Services ────────────────────────────────────────────────────

export async function createService(campaignId: string, dto: CreateServiceDto) {
  await getCampaign(campaignId);
  return repo.createService(campaignId, dto);
}

export async function listServices(campaignId: string, includeInactive = false) {
  return repo.listServices(campaignId, includeInactive);
}

export async function updateService(campaignId: string, serviceId: string, dto: UpdateServiceDto) {
  const service = await getCampaignServiceOrThrow(campaignId, serviceId);
  const usageCount = await getCampaignServiceUsageCount(serviceId);
  const hasUnsafeChange =
    usageCount > 0 &&
    (
      (dto.priceBdt !== undefined && dto.priceBdt !== service.priceBdt) ||
      (dto.vaccineCatalogId !== undefined && dto.vaccineCatalogId !== service.vaccineCatalogId)
    );

  if (hasUnsafeChange) {
    throw AppError.conflict('This service is already used by existing registrations, so price or vaccine mapping cannot be changed.');
  }

  return repo.updateService(serviceId, dto);
}

export async function deleteService(campaignId: string, serviceId: string) {
  const service = await getCampaignServiceOrThrow(campaignId, serviceId);
  const usageCount = await getCampaignServiceUsageCount(serviceId);

  if (usageCount === 0) {
    try {
      await repo.deleteService(serviceId);
      return { action: 'deleted' as const, service };
    } catch (err: any) {
      if (err?.code === 'P2003') {
        // A dependent row appeared between the usage check and the delete.
        const deactivated = await prisma.campaignService.update({
          where: { id: serviceId },
          data: {
            isActive: false,
            deletedAt: service.deletedAt ?? new Date(),
          },
          include: { vaccineCatalog: { select: { id: true, name: true } } },
        });
        return { action: 'deactivated' as const, service: deactivated };
      }
      throw err;
    }
  }

  const deactivated = await prisma.campaignService.update({
    where: { id: serviceId },
    data: {
      isActive: false,
      deletedAt: service.deletedAt ?? new Date(),
    },
    include: { vaccineCatalog: { select: { id: true, name: true } } },
  });

  return { action: 'deactivated' as const, service: deactivated };
}

// ─── Coverage Areas (location-first discovery) ────────────────────

export async function listCoverages(campaignId: string) {
  await getCampaign(campaignId);
  return repo.listCoverages(campaignId);
}

export async function addCoverage(campaignId: string, dto: { locationId?: string; isNationwide?: boolean }) {
  await getCampaign(campaignId);

  if (dto.isNationwide) {
    const existing = await repo.findNationwideCoverage(campaignId);
    if (existing) throw AppError.conflict('This campaign already has nationwide coverage');
    return repo.createCoverage(campaignId, { isNationwide: true });
  }

  const location = await locationRepo.getLocationById(dto.locationId as string);
  if (!location) throw AppError.notFound('Location not found');

  const existing = await repo.findCoverageByLocation(campaignId, dto.locationId as string);
  if (existing) throw AppError.conflict('This location is already covered by this campaign');
  return repo.createCoverage(campaignId, { locationId: dto.locationId });
}

export async function removeCoverage(campaignId: string, coverageId: string) {
  await getCampaign(campaignId);
  const coverage = await repo.getCoverageById(coverageId);
  if (!coverage || coverage.campaignId !== campaignId) throw AppError.notFound('Coverage not found in this campaign');
  return repo.deleteCoverage(coverageId);
}

// ─── Doctor Assignment ────────────────────────────────────────────

export async function assignDoctor(campaignId: string, dto: AssignDoctorDto, actorId?: string) {
  await getCampaign(campaignId);

  const doctor = await prisma.doctor.findUnique({ where: { id: dto.doctorId } });
  if (!doctor) throw AppError.notFound('Doctor not found');
  if (!doctor.isActive) throw AppError.badRequest('Doctor is not active and cannot be assigned');

  if (dto.sessionId) {
    const session = await prisma.campaignSession.findFirst({ where: { id: dto.sessionId, campaignId } });
    if (!session) throw AppError.notFound('Session not found in this campaign');
  }

  // If marking as signing doctor, validate only one signing doctor per session scope
  if (dto.isSigningDoctor) {
    const scope = dto.sessionId ? { campaignId, sessionId: dto.sessionId } : { campaignId, sessionId: null };
    await prisma.campaignDoctor.updateMany({ where: { ...scope, isSigningDoctor: true }, data: { isSigningDoctor: false } });
  }

  return repo.assignDoctor(campaignId, dto, actorId);
}

export async function listCampaignDoctors(campaignId: string, sessionId?: string) {
  await getCampaign(campaignId);
  return repo.listCampaignDoctors(campaignId, sessionId);
}

export async function updateDoctorAssignment(campaignId: string, assignmentId: string, dto: UpdateDoctorAssignmentDto) {
  await getCampaign(campaignId);
  const assignment = await prisma.campaignDoctor.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.campaignId !== campaignId) {
    throw AppError.notFound('Doctor assignment not found in this campaign');
  }

  // If marking as signing doctor, clear others in the same scope
  if (dto.isSigningDoctor) {
    const scope = assignment.sessionId
      ? { campaignId, sessionId: assignment.sessionId, id: { not: assignmentId } }
      : { campaignId, sessionId: null, id: { not: assignmentId } };
    await prisma.campaignDoctor.updateMany({ where: scope, data: { isSigningDoctor: false } });
  }

  return repo.updateDoctorAssignment(assignmentId, dto);
}

export async function removeDoctorAssignmentById(campaignId: string, assignmentId: string) {
  await getCampaign(campaignId);
  const assignment = await prisma.campaignDoctor.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.campaignId !== campaignId) {
    throw AppError.notFound('Doctor assignment not found in this campaign');
  }
  return repo.deleteDoctorAssignmentById(assignmentId);
}

export async function bulkAssignDoctors(campaignId: string, dto: BulkAssignDoctorDto, actorId?: string) {
  await getCampaign(campaignId);

  const results: { success: boolean; doctorId: string; error?: string }[] = [];

  for (const item of dto.assignments) {
    try {
      const doctor = await prisma.doctor.findUnique({ where: { id: item.doctorId } });
      if (!doctor || !doctor.isActive) {
        results.push({ success: false, doctorId: item.doctorId, error: !doctor ? 'Doctor not found' : 'Doctor inactive' });
        continue;
      }

      if (item.sessionId) {
        const session = await prisma.campaignSession.findFirst({ where: { id: item.sessionId, campaignId } });
        if (!session) { results.push({ success: false, doctorId: item.doctorId, error: 'Session not found' }); continue; }
      }

      if (item.isSigningDoctor) {
        const scope = item.sessionId ? { campaignId, sessionId: item.sessionId } : { campaignId, sessionId: null };
        await prisma.campaignDoctor.updateMany({ where: { ...scope, isSigningDoctor: true }, data: { isSigningDoctor: false } });
      }

      await prisma.campaignDoctor.create({
        data: {
          campaignId,
          doctorId: item.doctorId,
          sessionId: item.sessionId ?? null,
          role: item.doctorDuty.toLowerCase(),
          doctorDuty: item.doctorDuty,
          isSigningDoctor: item.isSigningDoctor ?? false,
          isPrimarySupervisor: item.isPrimarySupervisor ?? false,
          notes: item.notes ?? null,
          assignedBy: actorId ?? null,
        },
      });
      results.push({ success: true, doctorId: item.doctorId });
    } catch (err: any) {
      results.push({ success: false, doctorId: item.doctorId, error: err.message });
    }
  }

  return { results, total: dto.assignments.length, succeeded: results.filter((r) => r.success).length };
}

export async function getAvailableDoctors(campaignId: string, query: AvailableDoctorsQuery = {}) {
  await getCampaign(campaignId);

  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit, 20);

  const assigned = await prisma.campaignDoctor.findMany({
    where: { campaignId },
    select: { doctorId: true }
  });
  const assignedIds = assigned.map((a) => a.doctorId);

  const where: any = {
    isActive: true,
  };

  if (!query.includeAssigned) {
    where.id = { notIn: assignedIds };
  }

  if (query.search) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { mobile: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { licenseNumber: { contains: s, mode: 'insensitive' } },
      { specialization: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' }
    }),
    prisma.doctor.count({ where })
  ]);

  return { items, meta: buildPaginationMeta(total, page, limit) };
}

export async function removeDoctorAssignment(campaignId: string, doctorId: string) {
  await getCampaign(campaignId);
  return repo.removeDoctorAssignment(campaignId, doctorId);
}

// ─── Volunteer Assignment ─────────────────────────────────────────

export async function assignVolunteer(campaignId: string, dto: AssignVolunteerDto) {
  await getCampaign(campaignId);
  return repo.assignVolunteer(campaignId, dto);
}

export async function listCampaignVolunteers(campaignId: string) {
  await getCampaign(campaignId);
  return repo.listCampaignVolunteers(campaignId);
}

export async function removeVolunteerAssignment(campaignId: string, userId: string) {
  await getCampaign(campaignId);
  return repo.removeVolunteerAssignment(campaignId, userId);
}
