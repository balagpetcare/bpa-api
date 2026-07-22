import { AppError } from '../../utils/AppError';
import * as repo from './vaccine-catalog.repository';
import type {
  CreateVaccineCatalogDto, UpdateVaccineCatalogDto, VaccineCatalogListQuery,
  CreateCertificateTemplateDto, UpdateCertificateTemplateDto,
} from './vaccine-catalog.types';

export async function createVaccine(dto: CreateVaccineCatalogDto) {
  return repo.createVaccine(dto);
}

export async function listVaccines(query: VaccineCatalogListQuery) {
  return repo.listVaccines(query);
}

export async function getVaccine(id: string) {
  const v = await repo.getVaccineById(id);
  if (!v) throw AppError.notFound('Vaccine not found in catalog');
  return v;
}

export async function updateVaccine(id: string, dto: UpdateVaccineCatalogDto) {
  await getVaccine(id);
  return repo.updateVaccine(id, dto);
}

export async function deleteVaccine(id: string) {
  await getVaccine(id);
  return repo.deleteVaccine(id);
}

export async function createTemplate(dto: CreateCertificateTemplateDto) {
  return repo.createTemplate(dto);
}

export async function listTemplates() {
  return repo.listTemplates();
}

export async function getTemplate(id: string) {
  const t = await repo.getTemplateById(id);
  if (!t) throw AppError.notFound('Certificate template not found');
  return t;
}

export async function updateTemplate(id: string, dto: UpdateCertificateTemplateDto) {
  await getTemplate(id);
  return repo.updateTemplate(id, dto);
}
