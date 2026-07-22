import { EventStatus } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta, parsePaginationQuery } from '../../utils/response';
import { uniqueEventSlug } from '../../utils/slug';
import { AuditContext, auditCreate, auditUpdate, auditDelete, auditPublish, auditUnpublish } from '../../utils/audit';
import { PaginationMeta } from '../../types';
import * as repo from './events.repository';
import { initializeEpsPayment, generateMerchantTxnId, isEPSConfigured } from '../../services/eps.service';
import { createPayment, updatePaymentEpsTxnId } from '../payments/payments.repository';
import {
  CreateEventDto, UpdateEventDto, PublishEventDto, EventListQuery,
  CreateRegistrationDto, RegistrationListQuery, UpdateRegistrationStatusDto,
  EventResponse, RegistrationResponse,
} from './events.types';

type RawEvent = Awaited<ReturnType<typeof repo.findEventById>>;
type RawReg = Awaited<ReturnType<typeof repo.findRegistrationById>>;

function formatEvent(e: NonNullable<RawEvent>): EventResponse {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    coverImageUrl: e.coverImage?.url ?? null,
    location: e.location,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    capacity: e.capacity,
    isPaid: e.isPaid,
    fee: e.fee?.toString() ?? null,
    status: e.status,
    registrationCount: e._count.registrations,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function formatRegistration(r: NonNullable<RawReg>): RegistrationResponse {
  return {
    id: r.id,
    eventId: r.eventId,
    eventTitle: r.event.title,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    paymentId: r.paymentId,
    createdAt: r.createdAt,
  };
}

// ─── Events ───────────────────────────────────────────────────────

export async function listEvents(
  query: EventListQuery,
): Promise<{ data: EventResponse[]; meta: PaginationMeta }> {
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const filter = {
    search: query.search,
    status: query.status,
    upcoming: query.upcoming === 'true',
  };
  const [rows, total] = await Promise.all([
    repo.findManyEvents(filter, skip, limit),
    repo.countEvents(filter),
  ]);
  return { data: rows.map(formatEvent), meta: buildPaginationMeta(total, page, limit) };
}

export async function getEventById(id: string): Promise<EventResponse> {
  const ev = await repo.findEventById(id);
  if (!ev) throw AppError.notFound('Event');
  return formatEvent(ev);
}

export async function getEventBySlug(slug: string): Promise<EventResponse> {
  const ev = await repo.findEventBySlug(slug);
  if (!ev) throw AppError.notFound('Event');
  return formatEvent(ev);
}

export async function createEvent(dto: CreateEventDto, ctx: AuditContext): Promise<EventResponse> {
  const slug = dto.slug ?? (await uniqueEventSlug(dto.title));
  const ev = await repo.createEvent({
    title: dto.title,
    slug,
    description: dto.description,
    location: dto.location,
    startsAt: new Date(dto.startsAt),
    endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    capacity: dto.capacity,
    isPaid: dto.isPaid ?? false,
    fee: dto.fee ?? undefined,
    ...(dto.coverImageId ? { coverImage: { connect: { id: dto.coverImageId } } } : {}),
  });
  await auditCreate('event', ev.id, { title: ev.title, slug: ev.slug }, ctx);
  return formatEvent(ev);
}

export async function updateEvent(id: string, dto: UpdateEventDto, ctx: AuditContext): Promise<EventResponse> {
  const existing = await repo.findEventById(id);
  if (!existing) throw AppError.notFound('Event');

  const slug =
    dto.slug ??
    (dto.title && dto.title !== existing.title ? await uniqueEventSlug(dto.title, id) : undefined);

  const ev = await repo.updateEvent(id, {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(slug !== undefined && { slug }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.location !== undefined && { location: dto.location }),
    ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
    ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
    ...(dto.capacity !== undefined && { capacity: dto.capacity }),
    ...(dto.isPaid !== undefined && { isPaid: dto.isPaid }),
    ...(dto.fee !== undefined && { fee: dto.fee }),
    ...(dto.coverImageId !== undefined && {
      coverImage: dto.coverImageId ? { connect: { id: dto.coverImageId } } : { disconnect: true },
    }),
  });

  await auditUpdate('event', id, { title: existing.title }, { title: ev.title }, ctx);
  return formatEvent(ev);
}

export async function publishEvent(id: string, dto: PublishEventDto, ctx: AuditContext): Promise<EventResponse> {
  const existing = await repo.findEventById(id);
  if (!existing) throw AppError.notFound('Event');
  const ev = await repo.updateEvent(id, { status: dto.status });
  if (dto.status === EventStatus.published) {
    await auditPublish('event', id, ctx);
  } else {
    await auditUnpublish('event', id, ctx);
  }
  return formatEvent(ev);
}

export async function deleteEvent(id: string, ctx: AuditContext): Promise<void> {
  const existing = await repo.findEventById(id);
  if (!existing) throw AppError.notFound('Event');
  await repo.deleteEvent(id);
  await auditDelete('event', id, { title: existing.title }, ctx);
}

// ─── Registrations ────────────────────────────────────────────────

export async function listRegistrations(
  eventId: string,
  query: RegistrationListQuery,
): Promise<{ data: RegistrationResponse[]; meta: PaginationMeta }> {
  const event = await repo.findEventById(eventId);
  if (!event) throw AppError.notFound('Event');
  const { page, limit, skip } = parsePaginationQuery(query.page, query.limit);
  const [rows, total] = await Promise.all([
    repo.findManyRegistrations(eventId, query.status, skip, limit),
    repo.countRegistrations(eventId, query.status),
  ]);
  return { data: rows.map(formatRegistration), meta: buildPaginationMeta(total, page, limit) };
}

export async function createRegistration(
  eventId: string,
  dto: CreateRegistrationDto,
  userId: string | undefined,
  ctx: AuditContext,
): Promise<RegistrationResponse> {
  const event = await repo.findEventById(eventId);
  if (!event) throw AppError.notFound('Event');
  if (event.status !== EventStatus.published) {
    throw AppError.badRequest('Event is not open for registration');
  }
  if (event.capacity !== null && event._count.registrations >= event.capacity) {
    throw AppError.badRequest('Event is at full capacity');
  }

  // ─── Paid event — initiate EPS payment ────────────────────────
  if (event.isPaid && event.fee) {
    if (!isEPSConfigured()) {
      throw AppError.badRequest('Online payment is not available at this time.');
    }

    const amount = Number(event.fee);
    const merchantTxnId = generateMerchantTxnId();

    // Create pending registration
    const reg = await repo.createRegistration({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      status: 'pending',
      event: { connect: { id: eventId } },
      ...(userId ? { userId } : {}),
    });

    // Create pending payment linked to registration
    const payment = await createPayment({
      gateway: 'eps',
      merchantTxnId,
      amount,
      currency: 'BDT',
      purpose: 'event',
      payload: {
        type: 'event',
        registrationId: reg.id,
        eventId,
        eventTitle: event.title,
        attendeeName: dto.name,
        attendeeEmail: dto.email,
      },
    });

    // Link payment to registration
    await repo.updateRegistrationPayment(reg.id, payment.id);

    // Initiate EPS
    const epsResult = await initializeEpsPayment({
      customerOrderId: reg.id,
      merchantTransactionId: merchantTxnId,
      totalAmount: amount,
      customerName:     dto.name,
      customerEmail:    dto.email,
      customerPhone:    dto.phone ?? '',
      customerAddress:  'Bangladesh',
      customerCity:     'Dhaka',
      customerState:    'Dhaka Division',
      customerPostcode: '1000',
      productName:      event.title,
      valueA: payment.id,
      valueB: 'event',
      valueC: reg.id,
    });

    await updatePaymentEpsTxnId(payment.id, epsResult.TransactionId);
    await auditCreate('event_registration', reg.id, { eventId, email: dto.email, paid: true }, ctx);

    return {
      ...formatRegistration(reg),
      requiresPayment: true,
      redirectUrl: epsResult.RedirectURL,
      amount,
      currency: 'BDT',
    };
  }

  // ─── Free event — register directly ───────────────────────────
  const reg = await repo.createRegistration({
    name: dto.name,
    email: dto.email,
    phone: dto.phone,
    event: { connect: { id: eventId } },
    ...(userId ? { userId } : {}),
  });

  await auditCreate('event_registration', reg.id, { eventId, email: dto.email }, ctx);
  return { ...formatRegistration(reg), requiresPayment: false };
}

export async function updateRegistrationStatus(
  id: string,
  dto: UpdateRegistrationStatusDto,
  ctx: AuditContext,
): Promise<RegistrationResponse> {
  const existing = await repo.findRegistrationById(id);
  if (!existing) throw AppError.notFound('Registration');
  const updated = await repo.updateRegistrationStatus(id, dto.status);
  await auditUpdate('event_registration', id, { status: existing.status }, { status: dto.status }, ctx);
  return formatRegistration(updated);
}
