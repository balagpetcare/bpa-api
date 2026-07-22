import { VolunteerStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import * as repo from './volunteers.repository';
import type { CreateVolunteerDto, VolunteerListQuery } from './volunteers.types';

export async function submitVolunteer(dto: CreateVolunteerDto) {
  return repo.createVolunteer(dto);
}

export async function listVolunteers(query: VolunteerListQuery) {
  return repo.listVolunteers(query);
}

export async function getVolunteer(id: string) {
  const v = await repo.getVolunteerById(id);
  if (!v) throw AppError.notFound('Volunteer application not found');
  return v;
}

export async function updateVolunteerStatus(id: string, status: VolunteerStatus, actorId?: string) {
  const existing = await repo.getVolunteerById(id);
  if (!existing) throw AppError.notFound('Volunteer application not found');
  return repo.updateVolunteerStatus(id, status, actorId);
}
