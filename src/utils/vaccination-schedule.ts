// Vaccine name → standard interval in days (matches VaccineCatalog names)
const VACCINE_INTERVALS: Array<[pattern: string, days: number]> = [
  ['rabies',    365],
  ['fvrcp',     365],
  ['dhppil',    365],
  ['deworming', 90],
  ['bordetella', 365],
];

export function calculateNextDueDate(serviceName: string, administeredAt: Date): Date | null {
  const lower = serviceName.toLowerCase();
  for (const [pattern, days] of VACCINE_INTERVALS) {
    if (lower.includes(pattern)) {
      const next = new Date(administeredAt);
      next.setDate(next.getDate() + days);
      return next;
    }
  }
  return null;
}
