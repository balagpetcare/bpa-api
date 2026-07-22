import { PrismaClient } from '@prisma/client';

const PSS_SETTINGS = [
  { settingKey: 'PSS_API_BASE_URL', description: 'Future Pet Smart Solution API base URL', isSecret: false },
  { settingKey: 'PSS_API_KEY', description: 'Pet Smart Solution API key (keep secret)', isSecret: true },
  { settingKey: 'PSS_SYNC_ENABLED', description: 'Master toggle — set to true to enable sync', isSecret: false },
  { settingKey: 'PSS_SYNC_ENTITIES', description: 'Comma-separated entity types to sync (e.g. care_partner_card)', isSecret: false },
  { settingKey: 'PSS_WEBHOOK_SECRET', description: 'Incoming webhook signature secret from Pet Smart Solution', isSecret: true },
];

export async function seedPayments(prisma: PrismaClient) {
  let created = 0, skipped = 0;

  for (const s of PSS_SETTINGS) {
    const result = await prisma.petSmartSyncSetting.upsert({
      where: { settingKey: s.settingKey },
      update: { description: s.description },
      create: {
        settingKey: s.settingKey,
        description: s.description,
        isSecret: s.isSecret,
        isActive: false,
        status: 'not_configured',
      },
    });
    if (result) skipped++;
    else created++;
  }

  return { pssSettings: { upserted: PSS_SETTINGS.length } };
}
