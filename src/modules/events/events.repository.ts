import { EventStatus, RegistrationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export const eventSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  location: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  isPaid: true,
  fee: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  coverImage: { select: { url: true } },
  _count: { select: { registrations: true } },
} as const;

export const registrationSelect = {
  id: true,
  eventId: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  paymentId: true,
  createdAt: true,
  event: { select: { title: true } },
} as const;

export interface EventFilter {
  search?: string;
  status?: EventStatus;
  upcoming?: boolean;
}

function buildEventWhere(f: EventFilter): Prisma.EventWhereInput {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.upcoming ? { startsAt: { gte: new Date() } } : {}),
    ...(f.search
      ? {
          OR: [
            { title: { contains: f.search, mode: 'insensitive' } },
            { location: { contains: f.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function countEvents(f: EventFilter) {
  return prisma.event.count({ where: buildEventWhere(f) });
}

export async function findManyEvents(f: EventFilter, skip: number, take: number) {
  return prisma.event.findMany({
    where: buildEventWhere(f),
    select: eventSelect,
    skip,
    take,
    orderBy: { startsAt: 'asc' },
  });
}

export async function findEventById(id: string) {
  return prisma.event.findUnique({ where: { id }, select: eventSelect });
}

export async function findEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, select: eventSelect });
}

export async function createEvent(data: Prisma.EventCreateInput) {
  return prisma.event.create({ data, select: eventSelect });
}

export async function updateEvent(id: string, data: Prisma.EventUpdateInput) {
  return prisma.event.update({ where: { id }, data, select: eventSelect });
}

export async function deleteEvent(id: string) {
  return prisma.event.delete({ where: { id } });
}

// ─── Registrations ────────────────────────────────────────────────

export async function countRegistrations(eventId: string, status?: RegistrationStatus) {
  return prisma.eventRegistration.count({
    where: { eventId, ...(status ? { status } : {}) },
  });
}

export async function findManyRegistrations(
  eventId: string,
  status: RegistrationStatus | undefined,
  skip: number,
  take: number,
) {
  return prisma.eventRegistration.findMany({
    where: { eventId, ...(status ? { status } : {}) },
    select: registrationSelect,
    skip,
    take,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findRegistrationById(id: string) {
  return prisma.eventRegistration.findUnique({ where: { id }, select: registrationSelect });
}

export async function createRegistration(data: Prisma.EventRegistrationCreateInput) {
  return prisma.eventRegistration.create({ data, select: registrationSelect });
}

export async function updateRegistrationStatus(id: string, status: RegistrationStatus) {
  return prisma.eventRegistration.update({
    where: { id },
    data: { status },
    select: registrationSelect,
  });
}

export async function updateRegistrationPayment(id: string, paymentId: string) {
  return prisma.eventRegistration.update({
    where: { id },
    data: { payment: { connect: { id: paymentId } } },
    select: registrationSelect,
  });
}
