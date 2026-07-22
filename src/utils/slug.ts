import { prisma } from '../database/prisma';

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function uniqueNewsSlug(title: string, excludeId?: string): Promise<string> {
  return uniqueSlug(title, async (candidate) => {
    const existing = await prisma.news.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return !!existing;
  });
}

export async function uniqueEventSlug(title: string, excludeId?: string): Promise<string> {
  return uniqueSlug(title, async (candidate) => {
    const existing = await prisma.event.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return !!existing;
  });
}

export async function uniqueCategorySlug(name: string, excludeId?: string): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const existing = await prisma.newsCategory.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return !!existing;
  });
}

export async function uniqueTagSlug(name: string, excludeId?: string): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const existing = await prisma.newsTag.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return !!existing;
  });
}

async function uniqueSlug(
  text: string,
  checkExists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = generateSlug(text);
  let candidate = base;
  let counter = 2;

  while (await checkExists(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }

  return candidate;
}
