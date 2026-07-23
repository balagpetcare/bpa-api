import { PrismaClient } from '@prisma/client';

/**
 * `partner_clinics` is a curated homepage/app-control dataset, distinct from the
 * full clinic directory (`ClinicOrganization`/`ClinicBranch`). It intentionally
 * ships empty: administrators pick real clinic organizations/branches to feature
 * via the BPA Admin app-control interface. This seeder exists only so the table's
 * seed step is idempotent and explicit — it never inserts sample/fake records.
 */
export async function seedPartnerClinics(prisma: PrismaClient): Promise<{ partnerClinics: number }> {
  const partnerClinics = await prisma.partnerClinic.count();
  return { partnerClinics };
}
