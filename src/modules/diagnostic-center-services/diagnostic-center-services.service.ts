import { AppError } from '../../utils/AppError';
import * as repo from './diagnostic-center-services.repository';
import type { CreateDiagnosticCenterServiceDto, UpdateDiagnosticCenterServiceDto, DiagnosticCenterServiceListQuery } from './diagnostic-center-services.types';

export async function createDiagnosticService(dto: CreateDiagnosticCenterServiceDto) {
  return repo.createDiagnosticService(dto);
}

export async function listDiagnosticServices(query: DiagnosticCenterServiceListQuery) {
  return repo.listDiagnosticServices(query);
}

export async function listActiveDiagnosticServicesPublic() {
  return repo.listActiveDiagnosticServicesPublic();
}

export async function getDiagnosticService(id: string) {
  const service = await repo.getDiagnosticServiceById(id);
  if (!service) throw AppError.notFound('Diagnostic center service');
  return service;
}

export async function updateDiagnosticService(id: string, dto: UpdateDiagnosticCenterServiceDto) {
  await getDiagnosticService(id);
  return repo.updateDiagnosticService(id, dto);
}

export async function deleteDiagnosticService(id: string) {
  await getDiagnosticService(id);
  return repo.deleteDiagnosticService(id);
}
