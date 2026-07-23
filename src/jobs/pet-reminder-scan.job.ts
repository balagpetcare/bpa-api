import { prisma } from '../database/prisma';
import { publishOutboxEvent } from '../modules/push-notifications/outbox';

const REMINDER_OFFSETS_DAYS = [30, 7, 1, 0] as const; // 0 = due today
const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours is enough for day-granularity reminders

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * Scans VaccinationRecord.nextDueDate for pets whose next dose is due in
 * {30, 7, 1, 0} days, and separately for anything already overdue. Each
 * (pet, vaccination record, milestone) combination gets a deterministic
 * dedupeKey so re-running the scan never re-notifies for the same milestone
 * — this is what makes the schedule idempotent, not a "last run" cursor.
 *
 * NOTE: deworming, grooming and medical-followup reminders (also listed in
 * the domain event catalogue as PET_DEWORMING_DUE / PET_GROOMING_DUE /
 * PET_MEDICAL_FOLLOWUP) are NOT implemented yet — there is no deworming,
 * grooming, or medical-followup schedule data anywhere in the current
 * Prisma schema for this repo (only VaccinationRecord.nextDueDate exists).
 * Wiring those requires new schema fields/tables to track each pet's real
 * due dates first; adding those tables silently to hit the event count
 * would mean generating notifications from data that isn't real, which
 * contradicts "never send from mock data". Flagged as a blocker in the
 * final report — this job only emits PET_VACCINATION_DUE/OVERDUE.
 */
export async function runPetReminderScan(): Promise<{ due: number; overdue: number }> {
  const today = startOfDay(new Date());
  let dueCount = 0;
  let overdueCount = 0;

  for (const offsetDays of REMINDER_OFFSETS_DAYS) {
    const targetDate = addDays(today, offsetDays);
    const nextDay = addDays(targetDate, 1);

    const records = await prisma.vaccinationRecord.findMany({
      where: { nextDueDate: { gte: targetDate, lt: nextDay } },
      select: {
        id: true,
        petId: true,
        vaccineName: true,
        nextDueDate: true,
        pet: { select: { id: true, name: true, ownerId: true, isActive: true } },
      },
    });

    for (const record of records) {
      if (!record.pet?.isActive) continue;

      const milestone = offsetDays === 0 ? 'due_today' : `due_${offsetDays}d`;
      const dedupeKey = `pet_vaccination_due:${record.id}:${milestone}`;
      const isDueToday = offsetDays === 0;

      const title = isDueToday
        ? `${record.pet.name}'s vaccination is due today`
        : `${record.pet.name}'s vaccination is due in ${offsetDays} day${offsetDays === 1 ? '' : 's'}`;
      const titleBn = isDueToday
        ? `${record.pet.name} এর টিকা আজ নির্ধারিত`
        : `${record.pet.name} এর টিকা ${offsetDays} দিনের মধ্যে নির্ধারিত`;

      await publishOutboxEvent({
        eventType: 'PET_VACCINATION_DUE',
        entityType: 'pet',
        entityId: record.petId,
        dedupeKey,
        payload: {
          category: 'pet_health',
          priority: isDueToday ? 'high' : 'normal',
          title,
          titleBn,
          body: `${record.vaccineName} — scheduled for ${record.nextDueDate?.toISOString().slice(0, 10)}.`,
          bodyBn: `${record.vaccineName} — ${record.nextDueDate?.toISOString().slice(0, 10)} তারিখে নির্ধারিত।`,
          deepLink: `bpa://pets/${record.petId}/vaccinations`,
          targetUserIds: [record.pet.ownerId],
        },
      });
      dueCount += 1;
    }
  }

  // Overdue: nextDueDate strictly before today, re-notified once per day
  // (dedupeKey includes the day) rather than once ever, since an overdue
  // vaccination stays actionable every day until resolved.
  const overdueRecords = await prisma.vaccinationRecord.findMany({
    where: { nextDueDate: { lt: today } },
    select: {
      id: true,
      petId: true,
      vaccineName: true,
      nextDueDate: true,
      pet: { select: { id: true, name: true, ownerId: true, isActive: true } },
    },
  });

  const todayKey = today.toISOString().slice(0, 10);
  for (const record of overdueRecords) {
    if (!record.pet?.isActive) continue;
    const dedupeKey = `pet_vaccination_overdue:${record.id}:${todayKey}`;

    await publishOutboxEvent({
      eventType: 'PET_VACCINATION_OVERDUE',
      entityType: 'pet',
      entityId: record.petId,
      dedupeKey,
      payload: {
        category: 'pet_health',
        priority: 'high',
        title: `${record.pet.name}'s vaccination is overdue`,
        titleBn: `${record.pet.name} এর টিকা দেওয়ার সময় পার হয়ে গেছে`,
        body: `${record.vaccineName} was due on ${record.nextDueDate?.toISOString().slice(0, 10)}. Please schedule a visit.`,
        bodyBn: `${record.vaccineName} ${record.nextDueDate?.toISOString().slice(0, 10)} তারিখে নির্ধারিত ছিল। অনুগ্রহ করে একটি ভিজিট নির্ধারণ করুন।`,
        deepLink: `bpa://pets/${record.petId}/vaccinations`,
        targetUserIds: [record.pet.ownerId],
      },
    });
    overdueCount += 1;
  }

  return { due: dueCount, overdue: overdueCount };
}

export function startPetReminderScanJob(): NodeJS.Timeout {
  runPetReminderScan()
    .then(({ due, overdue }) => console.log(`[PetReminderScan] initial scan: ${due} due, ${overdue} overdue events`))
    .catch((err) => console.error('[PetReminderScan] initial scan failed:', err));

  return setInterval(() => {
    runPetReminderScan()
      .then(({ due, overdue }) => console.log(`[PetReminderScan] scan: ${due} due, ${overdue} overdue events`))
      .catch((err) => console.error('[PetReminderScan] scan failed:', err));
  }, SCAN_INTERVAL_MS);
}
