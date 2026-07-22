import { AppError } from '../../utils/AppError';
import * as repo from './social-impact-programs.repository';
import type { CreateSocialImpactProgramDto, UpdateSocialImpactProgramDto, SocialImpactProgramListQuery } from './social-impact-programs.types';

export async function createProgram(dto: CreateSocialImpactProgramDto) {
  return repo.createProgram(dto);
}

export async function listPrograms(query: SocialImpactProgramListQuery) {
  return repo.listPrograms(query);
}

export async function listActiveProgramsPublic() {
  return repo.listActiveProgramsPublic();
}

export async function getProgram(id: string) {
  const program = await repo.getProgramById(id);
  if (!program) throw AppError.notFound('Social impact program');
  return program;
}

export async function updateProgram(id: string, dto: UpdateSocialImpactProgramDto) {
  await getProgram(id);
  return repo.updateProgram(id, dto);
}

export async function deleteProgram(id: string) {
  await getProgram(id);
  return repo.deleteProgram(id);
}
