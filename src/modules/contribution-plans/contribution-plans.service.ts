import { AppError } from '../../utils/AppError';
import * as repo from './contribution-plans.repository';
import type { CreateContributionPlanDto, UpdateContributionPlanDto } from './contribution-plans.types';

export async function createPlan(dto: CreateContributionPlanDto) {
  return repo.createPlan(dto);
}

export async function listPlans() {
  return repo.listPlans();
}

export async function listActivePlansPublic() {
  return repo.listActivePlansPublic();
}

export async function getPlan(id: string) {
  const plan = await repo.getPlanById(id);
  if (!plan) throw AppError.notFound('Contribution plan');
  return plan;
}

export async function updatePlan(id: string, dto: UpdateContributionPlanDto) {
  await getPlan(id);
  return repo.updatePlan(id, dto);
}

export async function deletePlan(id: string) {
  await getPlan(id);
  await repo.deletePlan(id);
}
