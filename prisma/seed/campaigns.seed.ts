import { PrismaClient } from '@prisma/client';

const VACCINES = [
  {
    name: 'Rabies Vaccine',
    species: 'all',
    standardIntervalDays: 365,
    manufacturer: 'Merial',
    description: 'Annual rabies vaccination for dogs and cats',
  },
  {
    name: 'FVRCP Combo',
    species: 'cat',
    standardIntervalDays: 365,
    manufacturer: 'Zoetis',
    description: 'Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia',
  },
  {
    name: 'DHPPiL Combo',
    species: 'dog',
    standardIntervalDays: 365,
    manufacturer: 'Merck',
    description: 'Distemper, Hepatitis, Parvovirus, Parainfluenza, Leptospira',
  },
  {
    name: 'Deworming',
    species: 'all',
    standardIntervalDays: 90,
    manufacturer: null,
    description: 'Broad-spectrum deworming treatment',
  },
  {
    name: 'Bordetella',
    species: 'dog',
    standardIntervalDays: 365,
    manufacturer: null,
    description: 'Kennel cough prevention (Bordetella bronchiseptica)',
  },
];

export async function seedCampaigns(prisma: PrismaClient) {
  let vaccineCreated = 0, vaccineSkipped = 0;
  const adminEmail = (
    process.env['SEED_ADMIN_EMAIL'] ??
    process.env['ROOT_ADMIN_EMAIL'] ??
    'admin@bpa.org'
  ).toLowerCase().trim();
  const adminPassword = (
    process.env['SEED_ADMIN_PASSWORD'] ??
    process.env['ROOT_ADMIN_PASSWORD'] ??
    ''
  );

  // ── 1. Vaccine Catalog ────────────────────────────────────────────────────
  const vaccineMap: Record<string, string> = {};
  for (const v of VACCINES) {
    const existing = await prisma.vaccineCatalog.findFirst({ where: { name: v.name } });
    if (existing) {
      vaccineMap[v.name] = existing.id;
      vaccineSkipped++;
    } else {
      const created = await prisma.vaccineCatalog.create({ data: v });
      vaccineMap[v.name] = created.id;
      vaccineCreated++;
    }
  }

  // ── 2. Default Certificate Template ──────────────────────────────────────
  const tmplExisting = await prisma.certificateTemplate.findFirst({
    where: { name: 'BPA Standard Vaccination Certificate' },
  });

  let certTemplateId: string;
  if (tmplExisting) {
    certTemplateId = tmplExisting.id;
  } else {
    const tmpl = await prisma.certificateTemplate.create({
      data: {
        name: 'BPA Standard Vaccination Certificate',
        htmlTemplate: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BPA Vaccination Certificate</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 2px solid #2d6a4f; padding-bottom: 16px; }
    .header h1 { color: #2d6a4f; margin: 0; }
    .section { margin: 24px 0; }
    .label { font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 16px; margin-top: 4px; }
    .qr-section { text-align: center; margin-top: 32px; }
    .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #777; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Bangladesh Pet Association</h1>
    <p>Official Vaccination Certificate</p>
  </div>
  <div class="section">
    <div class="label">Certificate Number</div>
    <div class="value">{{certificateNumber}}</div>
  </div>
  <div class="section">
    <div class="label">Pet Name</div>
    <div class="value">{{petName}}</div>
    <div class="label">Pet Type / Breed</div>
    <div class="value">{{petType}} / {{breed}}</div>
  </div>
  <div class="section">
    <div class="label">Owner Name</div>
    <div class="value">{{ownerName}}</div>
  </div>
  <div class="section">
    <div class="label">Vaccine(s) Administered</div>
    <div class="value">{{services}}</div>
    <div class="label">Date of Vaccination</div>
    <div class="value">{{vaccinatedAt}}</div>
  </div>
  <div class="qr-section">
    <img src="{{qrCodeUrl}}" alt="Verification QR" width="120" />
    <p style="font-size:11px">Scan to verify at bpa.org/verify</p>
  </div>
  <div class="footer">
    <p>Bangladesh Pet Association | info@bangladeshpetassociation.com</p>
    <p>This certificate is digitally issued and can be verified online.</p>
  </div>
</body>
</html>`,
        isDefault: true,
        isActive: true,
      },
    });
    certTemplateId = tmpl.id;
  }

  // ── 3. Cat Vaccination Campaign 2026 ─────────────────────────────────────
  const campaignSlug = 'cat-vaccination-dhaka-2026';
  let campaignCreated = 0;

  const existingCampaign = await prisma.campaign.findUnique({ where: { slug: campaignSlug } });

  let campaignId: string;
  if (existingCampaign) {
    campaignId = existingCampaign.id;
    // Ensure status is at least registration_open so it appears in public listings
    if (existingCampaign.status === 'draft') {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'registration_open' } });
    }
  } else {
    if (!adminPassword) {
      console.warn('  [campaigns] WARNING: SEED_ADMIN_PASSWORD/ROOT_ADMIN_PASSWORD is missing - campaign seed skipped until the admin user can be created.');
      return {
        vaccines: { created: vaccineCreated, skipped: vaccineSkipped },
        certTemplate: certTemplateId ? 'upserted' : 'failed',
        campaign: 'skipped_no_admin_password',
        services: 0,
        sessions: 0,
      };
    }

    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    const createdById = adminUser?.id;
    if (!createdById) {
      console.warn(`  [campaigns] Admin user "${adminEmail}" not found - Cat Vaccination Campaign creation skipped. Re-run db:seed after admin user exists.`);
      return { vaccines: { created: vaccineCreated, skipped: vaccineSkipped }, certTemplate: certTemplateId ? 'upserted' : 'failed', campaign: 'skipped_no_admin_user', services: 0, sessions: 0 };
    }
    const campaign = await prisma.campaign.create({
      data: {
        slug: campaignSlug,
        createdById,
        title: 'Cat Vaccination Campaign — Dhaka 2026',
        description:
          'BPA\'s first dedicated cat vaccination campaign across Dhaka city. Free and subsidised rabies, FVRCP, and deworming services for registered cats.',
        campaignType: 'vaccination',
        status: 'registration_open',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
        registrationOpenAt: new Date('2026-06-15'),
        registrationCloseAt: new Date('2026-12-25'),
        basePriceBdt: 500,
        maxPetsPerBooking: 3,
        allowedPetTypes: ['cat'],
        termsAndConditions:
          'By registering, you confirm that your cat is in general good health and is not currently showing signs of illness. BPA reserves the right to decline vaccination if the attending veterinarian determines the animal is unfit for vaccination on the day.',
        faq: [
          {
            q: 'Which vaccines are included?',
            a: 'FVRCP Combo (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia) and Rabies Vaccine. Deworming is also available.',
          },
          {
            q: 'Is there a charge?',
            a: 'There is a nominal registration fee of ৳500 per session covering up to 3 cats.',
          },
          {
            q: 'What documents do I need to bring?',
            a: 'Bring your booking confirmation QR code and your cat in a secure carrier.',
          },
        ],
        isFeatured: false,
        certificateTemplateId: certTemplateId,
      },
    });
    campaignId = campaign.id;
    campaignCreated++;
  }

  // ── 4. Campaign Services linked to vaccine catalog ────────────────────────
  let serviceCreated = 0;
  const servicesDef = [
    { vaccineKey: 'Rabies Vaccine', name: 'Rabies Vaccine', isRequired: false, priceBdt: 200, sortOrder: 1 },
    { vaccineKey: 'FVRCP Combo', name: 'FVRCP Combo', isRequired: true, priceBdt: 0, sortOrder: 2 },
    { vaccineKey: 'Deworming', name: 'Deworming', isRequired: false, priceBdt: 150, sortOrder: 3 },
  ];

  for (const svc of servicesDef) {
    const vaccineCatalogId = vaccineMap[svc.vaccineKey];
    if (!vaccineCatalogId) continue;

    const existing = await prisma.campaignService.findFirst({
      where: { campaignId, name: svc.name },
    });
    if (!existing) {
      await prisma.campaignService.create({
        data: {
          campaignId,
          vaccineCatalogId,
          name: svc.name,
          isRequired: svc.isRequired,
          priceBdt: svc.priceBdt,
          sortOrder: svc.sortOrder,
        },
      });
      serviceCreated++;
    }
  }

  // ── 5. Venue + CampaignSession (minimum required for registration) ─────────
  let sessionCreated = 0;

  // Find DSCC or any existing zone for the venue
  const zone = await prisma.zone.findFirst({ orderBy: { name: 'asc' } });

  if (zone) {
    const venueName = 'BPA Dhaka Pilot Vaccination Centre';
    let venue = await prisma.venue.findFirst({ where: { name: venueName } });
    if (!venue) {
      venue = await prisma.venue.create({
        data: {
          name: venueName,
          address: 'To be confirmed — Dhaka, Bangladesh',
          zoneId: zone.id,
          isActive: false,
        },
      });
    }

    const sessionDate = new Date('2026-07-05');
    const existingSession = await prisma.campaignSession.findFirst({
      where: { campaignId, venueId: venue.id, sessionDate },
    });
    if (!existingSession) {
      await prisma.campaignSession.create({
        data: {
          campaignId,
          venueId: venue.id,
          sessionDate,
          startTime: '09:00',
          endTime: '17:00',
          capacity: 50,
          bookedCount: 0,
          isActive: false,
          notes: 'Pilot session — activate after venue confirmation',
        },
      });
      sessionCreated++;
    }
  }

  return {
    vaccines: { created: vaccineCreated, skipped: vaccineSkipped },
    certTemplate: certTemplateId ? 'upserted' : 'failed',
    campaign: campaignCreated > 0 ? 'created' : 'already_exists',
    services: serviceCreated,
    sessions: sessionCreated,
  };
}
