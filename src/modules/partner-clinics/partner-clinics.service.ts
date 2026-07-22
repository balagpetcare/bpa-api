import { AppError } from '../../utils/AppError';
import * as repo from './partner-clinics.repository';
import type { CreatePartnerClinicDto, UpdatePartnerClinicDto, PartnerClinicListQuery } from './partner-clinics.types';

function normalizeForPrisma<T extends Record<string, unknown>>(dto: T): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (k === 'divisionId' || k === 'districtId') {
      input[k] = v === null || v === '' ? null : v;
      continue;
    }
    input[k] = v === null ? undefined : v;
  }
  return input;
}

export async function createPartnerClinic(dto: CreatePartnerClinicDto, createdById: string) {
  return repo.createPartnerClinic(normalizeForPrisma(dto as unknown as Record<string, unknown>), createdById);
}

export async function listPartnerClinics(query: PartnerClinicListQuery) {
  return repo.listPartnerClinics(query);
}

export async function getPartnerClinic(id: string) {
  const clinic = await repo.getPartnerClinicById(id);
  if (!clinic) throw AppError.notFound('Partner clinic not found');
  return clinic;
}

export async function updatePartnerClinic(id: string, dto: UpdatePartnerClinicDto, updatedById: string) {
  await getPartnerClinic(id);
  return repo.updatePartnerClinic(id, normalizeForPrisma(dto as unknown as Record<string, unknown>), updatedById);
}

export async function deactivatePartnerClinic(id: string, updatedById: string) {
  await getPartnerClinic(id);
  return repo.softDeletePartnerClinic(id, updatedById);
}

export async function reorderPartnerClinics(items: Array<{ id: string; sortOrder: number }>) {
  return repo.reorderPartnerClinics(items);
}
