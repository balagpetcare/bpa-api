import { AppError } from '../../utils/AppError';
import * as repo from './care-partner-benefits.repository';
import type { CreateCarePartnerBenefitDto, UpdateCarePartnerBenefitDto, CarePartnerBenefitListQuery } from './care-partner-benefits.types';

export async function createBenefit(dto: CreateCarePartnerBenefitDto) {
  return repo.createBenefit(dto);
}

export async function listBenefits(query: CarePartnerBenefitListQuery) {
  return repo.listBenefits(query);
}

export async function listActiveBenefitsPublic() {
  return repo.listActiveBenefitsPublic();
}

export async function getBenefit(id: string) {
  const benefit = await repo.getBenefitById(id);
  if (!benefit) throw AppError.notFound('Care partner benefit');
  return benefit;
}

export async function updateBenefit(id: string, dto: UpdateCarePartnerBenefitDto) {
  await getBenefit(id);
  return repo.updateBenefit(id, dto);
}

export async function deleteBenefit(id: string) {
  await getBenefit(id);
  return repo.deleteBenefit(id);
}
