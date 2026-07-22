import { PrismaClient } from '@prisma/client';

async function upsertCityCorp(prisma: PrismaClient, name: string, districtId: string) {
  const existing = await prisma.cityCorporation.findFirst({ where: { name, districtId } });
  if (existing) return existing;
  return prisma.cityCorporation.create({ data: { name, districtId } });
}

async function upsertZone(prisma: PrismaClient, name: string, cityCorporationId: string) {
  const existing = await prisma.zone.findFirst({ where: { name, cityCorporationId } });
  if (existing) return existing;
  return prisma.zone.create({ data: { name, cityCorporationId } });
}

async function upsertDivision(prisma: PrismaClient, name: string, countryId: string) {
  const existing = await prisma.division.findFirst({ where: { name, countryId } });
  if (existing) return existing;
  return prisma.division.create({ data: { name, countryId } });
}

async function upsertDistrict(prisma: PrismaClient, name: string, divisionId: string) {
  const existing = await prisma.district.findFirst({ where: { name, divisionId } });
  if (existing) return existing;
  return prisma.district.create({ data: { name, divisionId } });
}

export async function seedLocations(prisma: PrismaClient) {
  let created = 0;

  // ── Country ───────────────────────────────────────────────────────────────
  const bangladesh = await prisma.country.upsert({
    where: { code: 'BD' },
    update: { name: 'Bangladesh' },
    create: { name: 'Bangladesh', code: 'BD' },
  });
  created++;

  // ── Divisions (8 divisions of Bangladesh) ─────────────────────────────────
  const divisionNames = [
    'Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi',
    'Khulna', 'Barisal', 'Rangpur', 'Mymensingh',
  ];

  const divisionMap: Record<string, string> = {};
  for (const name of divisionNames) {
    const div = await upsertDivision(prisma, name, bangladesh.id);
    divisionMap[name] = div.id;
    created++;
  }

  const dhakaDiv = divisionMap['Dhaka'];
  const chattogramDiv = divisionMap['Chattogram'];
  const sylhetDiv = divisionMap['Sylhet'];

  // ── Key Districts ──────────────────────────────────────────────────────────
  const districtDefs: Array<[string, string]> = [
    // Dhaka Division
    ['Dhaka District', dhakaDiv],
    ['Gazipur', dhakaDiv],
    ['Narayanganj', dhakaDiv],
    ['Manikganj', dhakaDiv],
    ['Munshiganj', dhakaDiv],
    ['Narsingdi', dhakaDiv],
    ['Tangail', dhakaDiv],
    // Chattogram Division
    ['Chattogram', chattogramDiv],
    ['Cox\'s Bazar', chattogramDiv],
    ['Comilla', chattogramDiv],
    // Sylhet Division
    ['Sylhet', sylhetDiv],
  ];

  const districtMap: Record<string, string> = {};
  for (const [name, divId] of districtDefs) {
    const dist = await upsertDistrict(prisma, name, divId);
    districtMap[name] = dist.id;
    created++;
  }

  const dhakaDistrictId = districtMap['Dhaka District'];

  // ── Dhaka City Corporations ───────────────────────────────────────────────
  const dncc = await upsertCityCorp(prisma, 'DNCC', dhakaDistrictId);
  const dscc = await upsertCityCorp(prisma, 'DSCC', dhakaDistrictId);
  created += 2;

  // ── DNCC Zones ────────────────────────────────────────────────────────────
  const dnccZones = [
    'Zone-1 (Uttara)', 'Zone-2 (Mirpur)', 'Zone-3 (Mohammadpur)', 'Zone-4 (Kafrul)',
    'Zone-5 (Gulshan)', 'Zone-6 (Banani)', 'Zone-7 (Demra)', 'Zone-8 (Sabujbagh)',
    'Zone-9 (Khaijuri)', 'Zone-10 (Cantonment)',
  ];
  for (const name of dnccZones) {
    await upsertZone(prisma, name, dncc.id);
    created++;
  }

  // ── DSCC Zones ────────────────────────────────────────────────────────────
  const dsccZones = [
    'Zone-1 (Lalbagh)', 'Zone-2 (Chawkbazar)', 'Zone-3 (Sutrapur)', 'Zone-4 (Motijheel)',
    'Zone-5 (Hazaribagh)', 'Zone-6 (Dhanmondi)', 'Zone-7 (Khilgaon)', 'Zone-8 (Shyampur)',
    'Zone-9 (Kadamtali)', 'Zone-10 (Demra)',
  ];
  for (const name of dsccZones) {
    await upsertZone(prisma, name, dscc.id);
    created++;
  }

  return {
    created,
    country: 'Bangladesh',
    divisions: divisionNames.length,
    districts: districtDefs.length,
    cityCorporations: 2,
    zones: dnccZones.length + dsccZones.length,
  };
}
