import { AppError } from '../../utils/AppError';
import * as repo from './doctors.repository';
import type { CreateDoctorDto, UpdateDoctorDto, DoctorListQuery } from './doctors.types';

/** Normalize body: accept both licenseNo and licenseNumber, save as licenseNumber.
 *  Also strip null values → undefined for Prisma compatibility. */
function normalizeForPrisma<T extends Record<string, unknown>>(dto: T): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (k === 'licenseNo') {
      // licenseNo is an alias — if licenseNumber is absent, map it over
      if (dto.licenseNumber === undefined && v !== undefined) {
        input.licenseNumber = v;
      }
      continue; // drop licenseNo key
    }
    // Prisma rejects `null` for nullable optional fields; convert to undefined
    input[k] = v === null ? undefined : v;
  }
  return input;
}

export async function createDoctor(dto: CreateDoctorDto) {
  const normalized = normalizeForPrisma(dto as unknown as Record<string, unknown>);
  const licenseNumber = normalized.licenseNumber as string | undefined;
  if (licenseNumber) {
    const existing = await repo.getDoctorByLicenseNumber(licenseNumber);
    if (existing) {
      const status = existing.isActive ? 'active' : 'inactive';
      throw AppError.conflict(`A record with this license_number already exists (Status: ${status}).`);
    }
  }
  return repo.createDoctor(normalized);
}

export async function listDoctors(query: DoctorListQuery) {
  return repo.listDoctors(query);
}

export async function getDoctor(id: string) {
  const d = await repo.getDoctorById(id);
  if (!d) throw AppError.notFound('Doctor not found');
  return d;
}

export async function updateDoctor(id: string, dto: UpdateDoctorDto) {
  await getDoctor(id);
  const normalized = normalizeForPrisma(dto as unknown as Record<string, unknown>);
  const licenseNumber = normalized.licenseNumber as string | undefined;
  if (licenseNumber) {
    const existing = await repo.getDoctorByLicenseNumber(licenseNumber);
    if (existing && existing.id !== id) {
      const status = existing.isActive ? 'active' : 'inactive';
      throw AppError.conflict(`A record with this license_number already exists (Status: ${status}).`);
    }
  }
  return repo.updateDoctor(id, normalized);
}


export async function deactivateDoctor(id: string) {
  await getDoctor(id);
  return repo.softDeleteDoctor(id);
}
