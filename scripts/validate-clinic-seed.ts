import 'dotenv/config';
import { prisma } from '../src/database/prisma';
import { clinicDirectorySeedData } from '../prisma/seed/data/clinic-directory.seed-data';

function countSnapshot() {
  return {
    organizations: clinicDirectorySeedData.organizations.length,
    branches: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.length, 0),
    phones: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.phones.length, 0), 0),
    openingHours: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.openingHours.length, 0), 0),
    services: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.services.length, 0), 0),
    animalTypes: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.animalTypes.length, 0), 0),
    facilities: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.facilities.length, 0), 0),
    sources: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.sources.length, 0), 0),
    images: clinicDirectorySeedData.organizations.reduce((sum, org) => sum + org.branches.reduce((branchSum, branch) => branchSum + branch.images.length, 0), 0),
  };
}

async function main() {
  const dbCounts = {
    organizations: await prisma.clinicOrganization.count(),
    branches: await prisma.clinicBranch.count(),
    phones: await prisma.clinicBranchPhone.count(),
    openingHours: await prisma.clinicBranchOpeningHours.count(),
    services: await prisma.clinicBranchService.count(),
    animalTypes: await prisma.clinicBranchAnimalType.count(),
    facilities: await prisma.clinicBranchFacility.count(),
    sources: await prisma.clinicBranchSource.count(),
    images: await prisma.clinicBranchImage.count(),
  };

  const snapshotCounts = countSnapshot();
  const match =
    dbCounts.organizations === snapshotCounts.organizations &&
    dbCounts.branches === snapshotCounts.branches &&
    dbCounts.phones === snapshotCounts.phones &&
    dbCounts.openingHours === snapshotCounts.openingHours &&
    dbCounts.services === snapshotCounts.services &&
    dbCounts.animalTypes === snapshotCounts.animalTypes &&
    dbCounts.facilities === snapshotCounts.facilities &&
    dbCounts.sources === snapshotCounts.sources &&
    dbCounts.images === snapshotCounts.images;

  console.log(JSON.stringify({ dbCounts, snapshotCounts, match }, null, 2));

  if (!match) {
    throw new Error('Clinic snapshot counts do not match the live database');
  }
}

main()
  .catch((error) => {
    console.error('Clinic snapshot validation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
