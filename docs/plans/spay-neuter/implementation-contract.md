# BPA Spay & Neuter Booking System — Implementation Contract

**Status:** Binding architecture contract (Phase 0 — audit & design) + Phase 1 (backend domain & database foundation) **implemented**
**Date:** 2026-08-04 (Phase 0), 2026-08-04 (Phase 1 build)
**Owner repo:** `bpa_api` (schema, payments, QR, notifications — the dependency root for all other repos)
**Scope of this document:** Phase 0 is architecture and repository audit only (no code). Phase 1 (§11 below) implements the domain model, migration, RBAC seed, and pure/atomic domain logic described in §4–§5 of this contract, with focused tests. No router/controller/HTTP layer, no worker jobs, and no notification wiring were built in Phase 1 — see §11.5 for exactly what remains.

---

## 0. Executive summary

BPA already operates a production-grade booking pipeline (campaign → session → registration → EPS payment → QR check-in → certificate) and a rich clinic directory (`ClinicOrganization` → `ClinicBranch`, with opening hours, services, a `SURGERY` facility flag, and verification/claim status). `CampaignType.spay_neuter` is already present in the Prisma enum and already labelled *"Spay & Neuter Campaign"* in the public web app.

However, **no spay/neuter logic exists anywhere in any repository.** The existing engine is vaccination-shaped: it books against `Venue` (not `ClinicBranch`), has no operation duration, no per-clinic concurrent-operation capacity, no slot holds, no reschedule, no cancellation cutoff, no clinic-scoped RBAC, and no refund path. Its terminal statuses (`vaccinated`, `certificate_issued`) do not describe surgery.

**Decision: build a new clinic-scoped domain** (`Spay*` models) that reuses every cross-cutting primitive the platform already has — payments, QR, media, notifications, audit, RBAC, response conventions — but does not mutate the live campaign tables. This keeps blast radius at zero for the running vaccination flow, which today has **no test coverage**.

### Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **New clinic-scoped domain**, not an extension of `Campaign`/`CampaignSession` | The live campaign booking path is untested; surgery semantics (duration, concurrency, holds, cutoffs, outcomes) do not fit vaccination-shaped statuses |
| 2 | **Furtail pet reference + immutable clinical snapshot** | The spec forbids duplicate pet ownership data; `/me/pets` is the shared registry and enforces ownership upstream |
| 3 | **Clinic staff dashboard = `/clinic` route group inside `bpa_admin`** | Reuses NextAuth, the `/api/backend` proxy, `usePermission`, and the existing clinic directory UI; avoids duplicating auth/CI/deploy for a new repo |

### Binding specification rules

These are non-negotiable and each has a corresponding row in the acceptance-test matrix (§9).

| Rule | Encoding in this design |
|------|------------------------|
| BDT 500 advance is **part of** the total price | `advancePaidBdt + balanceDueBdt = totalPriceBdt`; the advance is never additive |
| Remaining balance is paid **at the clinic** | `balanceDueBdt` is settled by a clinic staff action; no gateway call at completion |
| Default **Neuter** duration = **20 minutes** | `SpayServiceType.durationMinutes` default for `procedure = neuter` |
| Default **Spay** duration = **40 minutes** | `SpayServiceType.durationMinutes` default for `procedure = spay` |
| Clinic-specific **concurrent operation capacity** required | `SpayClinicProfile.concurrentOperationCapacity` (required, no platform default) → `SpaySlot.capacity` |
| Slot holds last **10 minutes** | `SpayClinicProfile.slotHoldMinutes` default `10` → `SpaySlotHold.expiresAt` |
| Default cancellation cutoff = **24 hours** | `SpayClinicProfile.cancellationCutoffHours` default `24` → `SpayBooking.cancellationCutoffAt` |
| Recommended arrival = **20 minutes before** operation | `SpayClinicProfile.arriveBeforeMinutes` default `20` → `SpayBooking.arriveByAt` |
| Check-in may start up to **1 hour early** | `SpayClinicProfile.checkinEarlyMinutes` default `60` → `SpayBooking.checkinOpensAt` |
| Clinic staff **cannot** alter central payments or issue refunds | No `payments:*` permission for any clinic role; `spay_refunds:approve` is central-admin only; enforced twice (permission string + `spayClinicAccess` middleware) |
| Exceptional manual refunds require **BPA Central Admin** | `SpayRefundRequest` — clinic staff may *raise*, only central admin may *approve* |
| Pet data must **reuse the shared registry** | `SpayBookingPet.externalPetId` references Furtail `/me/pets`; the spay flow creates **zero** `Pet`/`PetOwner` rows |

---

## 1. Repository map

| # | Role | Path | Remote | Branch at audit | Working tree | Stack |
|---|------|------|--------|-----------------|--------------|-------|
| 1 | **Backend API** | `D:\bpa_main\bpa_api` | `balagpetcare/bpa-api` | `main` | clean | Express 4, TypeScript, Prisma + PostgreSQL, BullMQ worker, zod |
| 2 | **Admin web** | `D:\bpa_main\bpa_admin` | `balagpetcare/bpa_admin` | `fix/real-next-typegen-pipeline-20260722` | clean | Next.js 16.0.8 App Router, React 19, NextAuth v4, react-bootstrap (Larkon), react-hook-form + **yup** |
| 3 | **Flutter user app** | `D:\bpa_main\bpa_user_app` | `balagpetcare/bpa_user_app` | `main` | **33 modified + 8 untracked** (profile & pets WIP) | Flutter, Riverpod 2.6, go_router 14.6, Dio 5.7 |
| 4 | **Public web** | `D:\bpa_main\bpa_web` | `balagpetcare/bpa_web` | `main` | clean | Next.js 16.2.9 App Router, Tailwind v4, cookie session, react-hook-form + **zod** |
| — | **Clinic / staff dashboard** | *does not exist* | — | — | — | To be created at `bpa_admin/src/app/(admin)/clinic/**` |

### Agent rules in force

`bpa_web/AGENTS.md` (and `bpa_web/CLAUDE.md`, which is just `@AGENTS.md`) carries one binding rule, which applies in spirit to **both** Next.js repos since they run 16.2.9 and 16.0.8 respectively:

> **This is NOT the Next.js you know.** This version has breaking changes — APIs, conventions, and file structure may all differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

No other `AGENTS.md` exists in the tree. `bpa_admin` has `.claude/settings.json` but no agent instructions. `bpa_api` and `bpa_user_app` have neither.

### Working-tree preservation

`bpa_user_app` has substantial uncommitted work (shared profile feature, pet contract changes, ~10 test files). **Nothing in this phase touched it.** The Flutter implementation step (§6.3) must not begin until that work is committed or explicitly rebased with the user's agreement.

---

## 2. Reusable components and services

The instruction is **reuse, do not rebuild**. Everything below already exists and works.

### 2.1 bpa_api

**API conventions** — `src/utils/response.ts`

```ts
sendSuccess(res, data, status = 200, meta?)   // → { success: true, data, meta? }
sendCreated(res, data)                        // → 201
sendNoContent(res)                            // → 204
buildPaginationMeta(total, page, limit)       // → { page, limit, total, totalPages, hasNext, hasPrev }
parsePaginationQuery(rawPage, rawLimit, 20)   // page ≥ 1, limit clamped 1..100 → { page, limit, skip }
```

`serializeData` recursively converts `BigInt` and Prisma `Decimal` before serialisation — money fields therefore reach clients as numbers automatically.

**Error envelope** — `src/middlewares/errorHandler.ts`

```jsonc
{ "success": false, "requestId": "...", "error": { "code": "...", "message": "...", "details": {} } }
```

Zod failures additionally emit top-level `message: 'Validation failed'` and `errors: [{path, message}]` for legacy clients. Prisma mapping: `P2002 → 409`, `P2025 → 404`, `P2003 → 409`, `P2023 → 400`.

| Concern | Reuse |
|---------|-------|
| Errors | `AppError` — `src/utils/AppError.ts` (`badRequest/unauthorized/forbidden/notFound/conflict/internal`) |
| Vocabulary | `RESOURCES`, `ACTIONS`, `ROLES`, `ERROR_CODES`, `HTTP_STATUS` — `src/config/constants.ts` |
| Validation | `validate(schema, 'body'\|'query'\|'params')` — `src/middlewares/validate.ts`; `validateUuid` |
| Rate limiting | `src/middlewares/rateLimiter.ts` — use `publicReadLimiter`, `publicFormLimiter`, `callbackLimiter` |
| Request ID | `src/middlewares/requestId.ts` |
| Auth (staff/admin) | `src/middlewares/authenticate.ts` — Bearer or httpOnly cookie; local JWT then Central Auth fallback |
| Auth (mobile / `/me`) | `src/middlewares/requireCentralAuthUser.ts` |
| RBAC | `src/middlewares/authorize.ts` — DB-backed `resource:action`, honours `:manage`, super-admin bypass |
| Row-level scope precedent | `src/middlewares/campaignAccess.ts` — the model for the new `spayClinicAccess` |

**Atomic capacity reservation** — `src/modules/campaign-registrations/campaign-registrations.repository.ts:51-68`

```ts
export async function reserveSlots(sessionId: string, petCount: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE campaign_sessions
    SET booked_count = booked_count + ${petCount}
    WHERE id = ${sessionId}::uuid
      AND booked_count + ${petCount} <= capacity
      AND is_active = true
  `;
  return result === 1;
}
```

This conditional-`UPDATE` + `rowCount === 1` assertion is the platform's proven concurrency primitive. **Copy this pattern exactly** — it is the only correct way to allocate spay slots.

| Concern | Reuse |
|---------|-------|
| EPS gateway | `src/services/eps.service.ts` — `initializeEpsPayment`, `isEPSConfigured`, `generateMerchantTxnId` |
| Payment lifecycle | `src/modules/payments/payments.service.ts` — `settlePayment`, `syncPayment`, `getPublicPaymentStatus`, `manualMarkPaid` |
| Callbacks / IPN | `src/modules/payments/payment-callbacks.router.ts` (`/api/v1/payment`), `public-payments.router.ts` (`/eps/callback`, `/eps/ipn`) — both tolerate ~20 txn-id alias params and resolve by `merchantTxnId \| gatewayRef \| epsTxnId \| id` |
| Receipts / slips | `src/modules/payments/validation-slip.pdf.ts`, `campaign-registrations/booking-slip.pdf.ts` (pdfkit) |
| QR | `src/utils/qr.ts` — `generateQrToken` (HMAC-SHA256 over `id:scopeId` with `QR_SECRET`), `buildQrUrl`; `generateStaffQrToken()` = 32 random bytes; scan audit via `QRScanLog` |
| Media | `src/storage/storage.service.ts` (s3/local driver, `buildObjectKey` → `media/YYYY/MM/<uuid><ext>`, `getPublicUrl`), `src/middlewares/upload.ts` (multer memory), `src/utils/imagePipeline.ts` (sharp), central `MediaFile` table |
| Push / inbox | `src/modules/push-notifications/*` (`/api/v1/notifications`), transactional outbox `NotificationOutboxEvent` + `outbox.ts`, FCM `src/providers/firebase.provider.ts` |
| Queue | `src/queue/queues.ts` (`notification-outbox`, `notification-delivery`; 5 attempts, exponential backoff, `jobId` dedup), workers in `src/queue/workers/` |
| Scheduled work | `setInterval` jobs registered in `src/worker.ts` (e.g. `src/jobs/campaign-starting-soon-scan.job.ts`) |
| Email / SMS | `src/modules/emails/email-template.registry.ts`, `src/services/campaign-email.service.ts`, `src/services/sms.service.ts` (logged to `EmailLog`/`SmsLog`) |
| Audit | `src/utils/audit.ts` — `auditContextFromRequest(req)` + `writeAuditLog(entry, ctx)` → `AuditLog` (never throws) |
| CSV/XLSX export | `src/modules/campaign-participants/participants.export.ts` (`xlsx` package) |
| Tests | Jest + ts-jest + supertest; `testMatch: **/__tests__/**/*.test.ts`, colocated per module |

**Clinic directory (already rich, reuse as-is):** `ClinicOrganization` → `ClinicBranch` (slug, lat/lon, `timezone` default `Asia/Dhaka`, `appointmentRequired`, `verificationStatus`, `claimedStatus`, `importKey`) → `ClinicBranchPhone / SocialLink / OpeningHours / Closure / Service / AnimalType / Facility / Image / Source`. Module at `src/modules/clinics/`.

### 2.2 bpa_admin

| Concern | Reuse |
|---------|-------|
| API client | `src/lib/api.ts` — `api.get/post/patch/delete/getPaginated`, `ApiError`; base from `src/lib/utils/api-url.ts` |
| Server proxy | `src/app/api/backend/[...path]/route.ts` — CSRF origin check, traversal guard, injects `Authorization: Bearer` from the NextAuth JWT |
| Session | NextAuth v4 — `src/app/api/auth/[...nextauth]/options.ts` (credentials relay + `central-auth` OAuth with PKCE) |
| Permissions | `src/hooks/usePermission.ts` — `can('resource:action')`, `canAny`, `canAll`, `hasRole`, `isSuperAdmin` |
| Data hooks | `src/hooks/useApi.ts` (`useApi`, `useApiMutation`), `useQueryParams`, `useModal`, `useUnsavedChangesWarning` |
| UI primitives | `src/components/ui/` — `PageHeader`, `Pagination`, `ApiErrorAlert`, `LoadingOverlay`, `EmptyState`, `StatusBadge`, `ConfirmDialog`, `CopyButton`, `QrCodeImage`, `MediaPickerInput`, `MediaCropModal` |
| Forms | react-hook-form + **yup** via `@hookform/resolvers`; inputs in `src/components/form/` |
| Location cascade | `src/components/location/LocationSelector.tsx` |
| Clinic UI | `src/app/(admin)/clinics/**` + `src/lib/api/clinics.api.ts` (orgs, branches, import, publish/archive/restore) |
| Calendar | `@fullcalendar/*` is **already a dependency** — use it for the clinic day-sheet |

**Screen templates to clone:**
- `src/app/(admin)/campaigns/[id]/sessions/components/SessionsManager.tsx` — the closest existing analogue to slot management (PageHeader + useApi + useApiMutation + usePermission + Bootstrap modal form)
- `src/app/(admin)/campaigns/[id]/registrations/components/RegistrationsList.tsx` — filtered, paginated list
- `src/app/(admin)/campaigns/[id]/checkin/components/CheckInDashboard.tsx` — QR check-in
- `src/app/(admin)/community-care/membership/components/wizard/` + `useCampaignWizard.ts` — multi-step form pattern

### 2.3 bpa_user_app

| Concern | Reuse |
|---------|-------|
| **Pet registry** | `myPetsProvider` (`lib/features/pets/pet_providers.dart`), `MyPetModel` (`lib/models/my_pet_model.dart` — has `isNeuteredOrSpayed`, `latestWeightKg`, `dateOfBirth`, `furtailPetId`, `uniquePetId`), `MyPetsRepository`, `petRefreshActionsProvider` for scoped invalidation |
| Pet selection UI precedent | `lib/features/campaigns/booking/pets_step.dart:37-130` — `ref.watch(myPetsProvider)`, filter by allowed types, selectable `AppCard`s, "Add Pet" via `openCanonicalAddPetFlow` |
| Booking wizard idiom | `lib/features/campaigns/campaign_booking_controller.dart` (`StateNotifier<CampaignBookingDraft>` + `enum BookingStep`) + `booking/*_step.dart` |
| Persisted wizard idiom | `lib/features/pets/add_pet_wizard_controller.dart` — draft `toJson/fromJson`, `dirtySteps`, field-error-driven step jumps |
| Payment | `lib/features/campaigns/payment_status_screen.dart` — Chrome Custom Tab (`flutter_custom_tabs`), 3s poll of `GET /public/payments/status`, 2-min timeout, re-check on `AppLifecycleState.resumed`, `bpa://payment` deep link as a hint only |
| QR | `lib/features/campaigns/confirmation_screen.dart` — `QrImageView` (`qr_flutter ^4.1.0`) |
| HTTP | `lib/services/api/bpa_api_service.dart` (`_get/_post/...` unwrap `data`, handle `{items, meta}`), `dio_factory.dart` (handles both envelopes), `auth_interceptor.dart` (single-flight refresh), `api_exception.dart` + `friendlyErrorMessage` |
| Parsing | `lib/shared/utils/api_parser_utils.dart` — `ApiParserUtils.safeString/parseInt/parseDouble/parseDate/safeMap` |
| Media | `resolveMediaUrl(...)` exported from `lib/shared/widgets/app_network_image.dart` — **always** apply to API image URLs |
| Design system | `lib/theme/bpa_design_tokens.dart` (`BpaSpacing`, `BpaRadius`), `lib/shared/widgets/{app_button,app_card,state_views}.dart` |
| Notifications | `lib/services/notifications/push_notification_service.dart` — channel **`booking_and_payments`** already exists |
| Routing | `lib/routes/app_routes.dart`, `app_router.dart`, `cta_router.dart` (backend CTA key → route) |
| Tests | Hand-written fakes subclassing real classes + `ProviderContainer(overrides:)`; no mockito |

### 2.4 bpa_web

| Concern | Reuse |
|---------|-------|
| API client | `lib/api.ts` — `apiFetch/apiPost/...`, `credentials: 'include'`, base `getApiOrigin() + '/api/v1'` |
| Session | `context/AuthContext.tsx` (cookie session, no NextAuth) |
| Public booking flow precedent | `app/campaigns/[slug]/{register,booking/[bookingNumber],waitlist}`, `app/booking-lookup`, `app/find-a-camp` |
| Payment return | `app/payment/{status,success,failed}`, `lib/utils/payment-redirect.ts`, `lib/utils/eps-params.ts` |
| Clinic directory (public) | `app/clinics/{page,[slug]}`, `lib/clinics/query.ts`, `components/clinics/*` incl. `ClinicMap` |
| QR display | `components/campaigns/QRDisplay.tsx` |
| UI / forms | `components/ui/*` (Tailwind), react-hook-form + **zod** v4 |

---

## 3. Confirmed gaps

| # | Gap | Impact |
|---|-----|--------|
| 1 | **No clinic/org-scoped RBAC.** `authorize()` is global; the only row-level scope is `campaignAccess.ts`. No clinic staff identity exists. | Must build `SpayClinicStaff` + `spayClinicAccess` middleware |
| 2 | **No operation duration, concurrent capacity, slot generation, slot hold, reschedule, or cancellation cutoff** anywhere. `CampaignSession` has only `capacity`/`bookedCount`. | Core of the new domain |
| 3 | **Bookings attach to `Venue`, clinics live in `ClinicBranch`** — no link between them. | New domain binds to `ClinicBranch` |
| 4 | **Two disjoint pet registries.** `/api/v1/me/pets` is a BFF proxy to external Furtail (`src/modules/me/*`, ownership enforced upstream by forwarding the bearer). Local `Pet`/`PetOwner` is separate and is what the campaign booking engine uses. | Decision 2 resolves this: spay uses Furtail refs only |
| 5 | **`Payment` has no advance-vs-balance concept, no refund code path** (`PaymentStatus.refunded` is an unused enum value), and **no idempotency-key store**. | Need `SpayRefundRequest` + explicit balance tracking on the booking |
| 6 | **`generateBookingNumber` uses `count() + 1`** (`campaign-registrations.repository.ts:39-47`) — race-prone under concurrency. | New booking numbers must use a Postgres sequence |
| 7 | **No `GET /me/campaign-bookings`.** The Flutter app tracks booking numbers in `shared_preferences`. | Spay must ship a real `GET /me/spay-neuter/bookings` |
| 8 | **bpa_admin menu is not permission-gated** (`src/assets/data/menu-items.ts` is a flat static list), and `middleware.ts` `authRequiredPaths` is a hardcoded array that already omits `/clinics`. | New paths must be added to both, and the clinic menu must be gated |
| 9 | **Zero test coverage** on `campaign-registrations` and payment settlement. | Reinforces decision 1 (don't touch it); new module ships with tests |
| 10 | **No cron library** — scheduled work is `setInterval` in `src/worker.ts`. | Hold-expiry sweep follows the same pattern, plus lazy expiry on read |
| 11 | No surgery-specific clinical state (consent, fasting, weight/age eligibility, outcome, post-op follow-up) exists in any model. | New fields on `SpayBooking` / `SpayBookingPet` |

---

## 4. Recommended database / domain design

All new models live in `prisma/schema.prisma` and **must** follow house style: `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`, `@map` snake_case columns, `@@map` snake_case tables, `Decimal(10,2)` money, `@db.Timestamptz` timestamps, `@db.Date` for calendar dates, `VarChar(5)` for `HH:mm`.

### 4.1 Entity overview

```
ClinicBranch (existing)
 └─ SpayClinicProfile        1:1  — capacity, policy defaults, timezone
     ├─ SpayServiceType      1:N  — neuter/spay × species, duration, price
     ├─ SpayClinicHours      1:N  — weekday operating windows
     ├─ SpayClinicClosure    1:N  — date exceptions
     └─ SpaySlot             1:N  — generated; capacity / bookedCount / heldCount
          ├─ SpaySlotHold    1:N  — 10-minute TTL
          └─ SpayBooking     1:N
               ├─ SpayBookingPet     1:N  — externalPetId → /me/pets + snapshot
               └─ SpayRefundRequest  1:N  — central-admin approval only

ClinicBranch ─ SpayClinicStaff ─ User        (row-level authorization scope)
SpayBooking  ─ Payment (existing)            (advance only, BDT 500)
```

### 4.2 Models

**`SpayClinicProfile`** — one per `ClinicBranch`; the policy record.

| Field | Type | Notes |
|-------|------|-------|
| `clinicBranchId` | uuid, unique | FK → `ClinicBranch` |
| `concurrentOperationCapacity` | Int | **Required, no platform default** — clinic-specific per spec |
| `isAcceptingBookings` | Boolean @default(true) | Kill switch per clinic |
| `advanceAmountBdt` | Decimal(10,2) @default(500) | Part of total, never additive |
| `cancellationCutoffHours` | Int @default(24) | |
| `arriveBeforeMinutes` | Int @default(20) | |
| `checkinEarlyMinutes` | Int @default(60) | |
| `slotHoldMinutes` | Int @default(10) | |
| `bookingHorizonDays` | Int @default(30) | How far ahead slots are generated |
| `timezone` | String @default("Asia/Dhaka") | Mirrors `ClinicBranch.timezone` |
| `preOpInstructions`, `postOpInstructions` | Text? | Shown in app/receipt |

**`SpayServiceType`** — the priced, timed unit of work.

| Field | Type | Notes |
|-------|------|-------|
| `clinicProfileId` | uuid | |
| `procedure` | `SpayProcedure { neuter, spay }` | |
| `species` | `PetType` | Reuses the existing enum |
| `durationMinutes` | Int | **Seeded 20 for neuter, 40 for spay**; clinic-overridable |
| `totalPriceBdt` | Decimal(10,2) | The full price |
| `advanceBdt` | Decimal(10,2) @default(500) | **Invariant: `advanceBdt <= totalPriceBdt`** |
| `minAgeMonths`, `maxWeightKg` | Int? / Decimal? | Eligibility gates |
| `isActive` | Boolean @default(true) | |

`@@unique([clinicProfileId, procedure, species])`

**`SpayClinicHours`** — `clinicProfileId`, `dayOfWeek Int` (0–6), `opensAt`/`closesAt VarChar(5)`, `isClosed Boolean`. Mirrors `ClinicBranchOpeningHours` deliberately so the two can be reconciled later.

**`SpayClinicClosure`** — `clinicProfileId`, `closureDate @db.Date`, `reason`. Blocks generation and disables existing slots.

**`SpaySlot`** — the bookable unit.

| Field | Type | Notes |
|-------|------|-------|
| `clinicProfileId` | uuid | |
| `slotDate` | Date | |
| `startTime`, `endTime` | VarChar(5) | Derived from hours + service duration granularity |
| `capacity` | Int | Snapshot of `concurrentOperationCapacity` at generation time |
| `bookedCount` | Int @default(0) | |
| `heldCount` | Int @default(0) | |
| `isActive` | Boolean @default(true) | |

`@@unique([clinicProfileId, slotDate, startTime])`, `@@index([clinicProfileId, slotDate])`

> **Capacity semantics.** `capacity` is *concurrent operations*, not bookings per day. A slot is available iff `bookedCount + heldCount + n <= capacity AND isActive`.

**`SpaySlotHold`** — `slotId`, `centralAuthUserId`, `petCount Int`, `expiresAt Timestamptz` (= `now + slotHoldMinutes`), `status SpayHoldStatus { active, converted, expired, released }`, `idempotencyKey String @unique`. `@@index([expiresAt, status])`.

**`SpayBooking`** — the aggregate root.

| Field | Type | Notes |
|-------|------|-------|
| `bookingNumber` | String @unique | `BPA-SN-YYYYMMDD-#####` — **from a Postgres sequence**, not `count()` |
| `clinicBranchId`, `clinicProfileId`, `slotId` | uuid | |
| `centralAuthUserId` | String | Owner identity; **no local `PetOwner` row** |
| `contactName`, `contactPhone`, `contactEmail` | String | Denormalised at booking time |
| `totalPriceBdt` | Decimal(10,2) | Sum of service-type totals |
| `advancePaidBdt` | Decimal(10,2) | The BDT 500 (× pets, per clinic policy) |
| `balanceDueBdt` | Decimal(10,2) | **Server-computed**: `totalPriceBdt − advancePaidBdt` |
| `balanceCollectedBdt` | Decimal(10,2) @default(0) | Recorded by clinic staff at completion |
| `paymentId` | uuid? @unique | FK → existing `Payment` (advance only) |
| `status` | `SpayBookingStatus` | See below |
| `qrToken` | String @unique | HMAC via new `generateSpayQrToken` |
| `holdId` | uuid? | The hold this booking converted from |
| `scheduledStartAt` | Timestamptz | Slot date + startTime in clinic timezone |
| `arriveByAt` | Timestamptz | `scheduledStartAt − arriveBeforeMinutes` |
| `checkinOpensAt` | Timestamptz | `scheduledStartAt − checkinEarlyMinutes` |
| `cancellationCutoffAt` | Timestamptz | `scheduledStartAt − cancellationCutoffHours` |
| `checkedInAt`, `operationStartedAt`, `operationCompletedAt` | Timestamptz? | |
| `cancelledAt`, `cancelledById`, `cancellationReason` | | |
| `rescheduledFromSlotId`, `rescheduleCount` | | |
| `consentAcceptedAt` | Timestamptz? | |
| `notes`, `clinicNotes` | Text? | Owner-visible vs clinic-internal |

```prisma
enum SpayBookingStatus {
  pending_payment
  confirmed
  checked_in
  in_operation
  completed
  no_show
  cancelled_by_owner
  cancelled_by_clinic
  refund_pending
  refunded
}
```

**`SpayBookingPet`** — the pet line, **reference + snapshot only**.

| Field | Type | Notes |
|-------|------|-------|
| `bookingId` | uuid | |
| `externalPetId` | String | **Furtail pet id from `/me/pets`** — the shared registry |
| `serviceTypeId` | uuid | Determines duration and price |
| `petNameSnapshot`, `speciesSnapshot`, `sexSnapshot`, `breedSnapshot` | String? | Immutable, captured at booking |
| `weightKgSnapshot` | Decimal? | For eligibility + anaesthesia dosing |
| `ageMonthsSnapshot` | Int? | |
| `wasAlreadyNeuteredSnapshot` | Boolean? | From `isNeuteredOrSpayed` — blocks obviously invalid bookings |
| `unitTotalPriceBdt`, `unitAdvanceBdt`, `durationMinutes` | | Frozen at booking |
| `outcome` | `SpayOutcome { pending, completed, aborted, deferred }` | Recorded by the vet |
| `outcomeNotes` | Text? | |

`@@unique([bookingId, externalPetId])`

> **No `Pet` or `PetOwner` row is ever created by this flow.** Ownership is verified at booking time by calling the existing `/me/pets` BFF with the caller's Central Auth bearer and asserting `externalPetId` is present in the response. The snapshot exists solely so the clinic day-sheet and the audit trail remain correct if the pet record later changes upstream.

**`SpayClinicStaff`** — the authorization scope.

`clinicBranchId`, `userId`, `staffRole SpayStaffRole { clinic_admin, vet, front_desk }`, `isActive`, `assignedById`, `assignedAt`. `@@unique([clinicBranchId, userId])`.

**`SpayRefundRequest`** — the *only* refund mechanism.

`bookingId`, `requestedById`, `requestedAt`, `amountBdt Decimal`, `reason Text`, `status SpayRefundStatus { pending, approved, rejected, processed }`, `reviewedById`, `reviewedAt`, `reviewNotes`, `processedAt`, `externalRefundRef`. Clinic staff may **create**; only BPA Central Admin may transition to `approved`/`rejected`/`processed`. Every transition writes an `AuditLog` row.

### 4.3 Invariants enforced in the service layer

1. **Concurrency.** Every capacity mutation is a conditional raw `UPDATE` asserting `rowCount === 1`, mirroring `reserveSlots`:
   ```sql
   UPDATE spay_slots
   SET held_count = held_count + $n
   WHERE id = $slotId::uuid
     AND booked_count + held_count + $n <= capacity
     AND is_active = true
   ```
   Hold → booking conversion moves the count from `heldCount` to `bookedCount` **within one transaction** so the total never dips and never double-counts.

2. **Hold expiry is belt-and-braces.** A new `setInterval` job (`src/jobs/spay-hold-expiry.job.ts`, registered in `src/worker.ts`) sweeps `status = active AND expiresAt < now()`, decrementing `heldCount`. Availability reads **also** discount expired holds inline, so an unswept hold can never block a booking even if the worker is down.

3. **Pricing is server-side only.** `totalPriceBdt` and `advancePaidBdt` are derived from `SpayServiceType` rows; any client-supplied price is discarded. `balanceDueBdt = totalPriceBdt − advancePaidBdt` is computed, never accepted.

4. **Time fields are derived, never client-supplied.** `arriveByAt`, `checkinOpensAt`, `cancellationCutoffAt` are computed from `scheduledStartAt` and the clinic profile at booking time, then frozen — so a later policy change cannot retroactively invalidate an existing booking.

5. **Only the advance reaches the gateway.** `Payment.amount = advancePaidBdt`, `purpose = 'spay_neuter_advance'`, `entityType = 'spay_booking'`, `entityId = booking.id`. The balance never touches EPS.

---

## 5. API and permission matrix

New module `src/modules/spay-neuter/`, following the house five-file pattern (`.router.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.types.ts`), split into sub-routers per audience and **mounted manually in `src/app.ts`** alongside the existing families.

### 5.1 Endpoints

**Public** — `${v1}/public/spay-neuter/*`, `publicReadLimiter`, unauthenticated

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/clinics` | Paginated clinics accepting spay/neuter bookings (filters: location, species, procedure) |
| GET | `/clinics/:branchSlug` | Clinic detail + policy (advance, cutoff, arrival, instructions) |
| GET | `/clinics/:branchSlug/service-types` | Procedures, species, durations, prices |
| GET | `/clinics/:branchSlug/availability` | Slots for a date range, with live remaining capacity |

**Owner (mobile/web)** — `${v1}/me/spay-neuter/*`, `requireCentralAuthUser`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/holds` | Create a 10-minute hold (requires `Idempotency-Key`) |
| DELETE | `/holds/:id` | Release own hold |
| POST | `/bookings` | Convert hold → booking, verify pets against `/me/pets`, create `Payment`, return EPS `paymentUrl` |
| GET | `/bookings` | Paginated own bookings (**closes gap #7**) |
| GET | `/bookings/:id` | Detail incl. QR token, balance due, arrival time |
| POST | `/bookings/:id/cancel` | Enforces `cancellationCutoffAt` |
| POST | `/bookings/:id/reschedule` | Atomic release-old / reserve-new; subject to the same cutoff |
| GET | `/bookings/:id/slip.pdf` | Booking slip (pdfkit, mirrors `booking-slip.pdf.ts`) |

**Clinic staff** — `${v1}/clinic/spay-neuter/*`, `authenticate` + `authorize(...)` + **`spayClinicAccess`**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/branches` | Branches the caller is staff of |
| GET | `/day-sheet` | Today's schedule for a branch |
| POST | `/bookings/:id/check-in` | Rejected before `checkinOpensAt`; writes `QRScanLog` |
| POST | `/scan/:qrToken` | QR-driven check-in lookup |
| POST | `/bookings/:id/start` | → `in_operation` |
| POST | `/bookings/:id/complete` | Records outcome per pet **and `balanceCollectedBdt`** |
| POST | `/bookings/:id/no-show` | |
| POST | `/bookings/:id/cancel` | → `cancelled_by_clinic` |
| POST | `/bookings/:id/refund-requests` | **Create only** — never approve |
| GET/POST/PATCH | `/slots`, `/hours`, `/closures`, `/service-types` | Clinic self-service scheduling |

**BPA Central Admin** — `${v1}/admin/spay-neuter/*`, `authenticate` + `authorize(...)`

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH | `/clinic-profiles` | Provision and configure clinics |
| GET/POST/DELETE | `/clinic-staff` | Assign/revoke clinic staff |
| GET | `/bookings` | All bookings, all filters |
| GET | `/bookings/export` | CSV/XLSX (reuses the `participants.export.ts` pattern) |
| GET | `/refund-requests` | Queue |
| POST | `/refund-requests/:id/approve` \| `/reject` \| `/mark-processed` | **Central admin only** |
| GET | `/reports/*` | Volume, capacity utilisation, no-show rate, revenue split (advance vs balance) |

### 5.2 New RBAC vocabulary

Added to `src/config/constants.ts` and seeded via `prisma/seed/roles-permissions.seed.ts` (additive only — the seed must never revoke existing permissions):

**Resources:** `spay_clinics`, `spay_service_types`, `spay_slots`, `spay_bookings`, `spay_checkin`, `spay_refunds`, `spay_reports`
**Actions:** existing set, plus reuse of `checkin`, `manage`, `approve`
**Roles:** `clinic_admin`, `clinic_vet`, `clinic_front_desk` (new), alongside existing `super_admin`, `admin`

### 5.3 Permission matrix

| Resource : Action | Central `super_admin` / `admin` | `clinic_admin` | `clinic_vet` | `clinic_front_desk` | Owner (`/me`) |
|---|---|---|---|---|---|
| `spay_clinics:read` | ✅ | ✅ (own branch) | ✅ (own) | ✅ (own) | public read |
| `spay_clinics:manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `spay_service_types:read` | ✅ | ✅ (own) | ✅ (own) | ✅ (own) | public read |
| `spay_service_types:update` | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| `spay_slots:read` | ✅ | ✅ (own) | ✅ (own) | ✅ (own) | public availability |
| `spay_slots:manage` | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| `spay_bookings:read` | ✅ (all) | ✅ (own branch) | ✅ (own) | ✅ (own) | ✅ (own bookings) |
| `spay_bookings:create` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `spay_bookings:update` (outcome/notes) | ✅ | ✅ (own) | ✅ (own) | ❌ | ❌ |
| `spay_bookings:cancel` | ✅ | ✅ (own) | ❌ | ✅ (own) | ✅ (before cutoff) |
| `spay_checkin:checkin` | ✅ | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| `spay_refunds:create` | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| **`spay_refunds:approve`** | ✅ **only** | ❌ | ❌ | ❌ | ❌ |
| **`payments:*`** | ✅ | ❌ | ❌ | ❌ | ❌ |
| `spay_reports:read` | ✅ (all) | ✅ (own branch) | ❌ | ❌ | ❌ |

> **Spec rule — clinic staff cannot alter central payments or issue refunds.** Enforced in two independent layers:
> 1. **No clinic role is granted any `payments:*` permission**, so every route under `/api/v1/admin/payments` returns 403 for clinic staff.
> 2. **`spayClinicAccess` middleware** (new, `src/middlewares/spayClinicAccess.ts`, modelled on `campaignAccess.ts`) resolves the target booking's `clinicBranchId` and asserts an active `SpayClinicStaff` row for the caller — so a clinic-scoped permission cannot be used against another clinic's data.
>
> `spay_refunds:approve` is granted to central roles only. The clinic path stops at *raising* a `SpayRefundRequest`.

### 5.4 Conventions all new endpoints must follow

- Success via `sendSuccess`/`sendCreated`; errors thrown as `AppError` and rendered by the global handler.
- Lists take `?page&limit` through `parsePaginationQuery` and return `buildPaginationMeta` as the 4th `sendSuccess` argument.
- All input validated with zod through `validate(schema, target)`.
- Mutating owner endpoints require an `Idempotency-Key` header (already CORS-allowed); the key is persisted on `SpaySlotHold.idempotencyKey`.
- Every state transition calls `writeAuditLog` with `auditContextFromRequest(req)`.

---

## 6. Per-repository implementation sequence

The order is strict — each step depends on the one before.

### 6.1 bpa_api (must land first)

1. Prisma schema additions + a single additive migration; extend `prisma/seed/roles-permissions.seed.ts`.
2. Clinic profile / service type / hours / closure CRUD + `spayClinicAccess` middleware + `SpayClinicStaff`.
3. Slot generation service (hours − closures × duration granularity, bounded by `bookingHorizonDays`), idempotent and re-runnable.
4. Hold service — create/release/convert with the conditional-`UPDATE` primitive; `src/jobs/spay-hold-expiry.job.ts` registered in `src/worker.ts`; lazy expiry on read.
5. Booking service — pet ownership verification against `/me/pets`, snapshot capture, price computation, `Payment` creation for the advance, EPS init; wire settlement into the existing `settlePayment` so the EPS callback confirms the booking.
6. QR — `generateSpayQrToken` in `src/utils/qr.ts`, verification endpoint, `QRScanLog` writes.
7. Clinic operations — check-in window enforcement, start/complete/no-show, per-pet outcome, balance collection.
8. Cancel + reschedule with cutoff enforcement.
9. `SpayRefundRequest` create (clinic) and approve/reject/process (central admin only).
10. Notifications via the outbox — booking confirmed, hold expiring, arrival reminder at T−`arriveBeforeMinutes`, cancellation-cutoff reminder, post-op follow-up.
11. Reports + CSV/XLSX export; audit coverage review.
12. Jest tests covering the full §9 matrix.

### 6.2 bpa_admin

1. `src/lib/api/spay-neuter.api.ts` (typed client mirroring `campaigns.api.ts`).
2. Central console — `src/app/(admin)/spay-neuter/**`: clinic provisioning, service types & durations, capacity, staff assignment, bookings list, refund queue, reports.
3. Clinic route group — `src/app/(admin)/clinic/**`: day-sheet (`@fullcalendar`), QR check-in, outcome recording, slot/hours management.
4. Menu entries in `src/assets/data/menu-items.ts` **with permission gating added** (closes gap #8), and new paths appended to `middleware.ts` `authRequiredPaths`.
5. Per the AGENTS.md rule, consult `node_modules/next/dist/docs/` before writing App Router code.

### 6.3 bpa_user_app — *only after the existing uncommitted work is committed or rebased with the user's agreement*

1. `lib/features/spay_neuter/` — wizard: clinic → procedure/service → pet (from `myPetsProvider`) → slot (creates a hold) → review/consent.
2. `lib/repositories/spay_booking_repository.dart` + methods on `bpa_api_service.dart`; models under `lib/models/`.
3. Payment via the existing custom-tab + poll flow; confirmation screen with `QrImageView`, arrival time, and balance due.
4. "My spay bookings" backed by the **real** `GET /me/spay-neuter/bookings`.
5. Routes in `app_routes.dart`/`app_router.dart`; CTA alias in `cta_router.dart`; reuse the `booking_and_payments` notification channel.
6. Tests using the hand-written-fake + `ProviderContainer(overrides:)` convention.

### 6.4 bpa_web

1. `lib/api/spay-neuter.ts`; public clinic discovery and availability under `app/spay-neuter/**`.
2. Booking entry point for signed-in owners; EPS return handling via the existing `app/payment/*` pages.
3. Booking lookup by `bookingNumber`, and QR display reusing `components/campaigns/QRDisplay.tsx`.

---

## 7. Expected files and modules to change

**bpa_api**
`prisma/schema.prisma` · `prisma/migrations/<ts>_spay_neuter/` (new) · `prisma/seed/roles-permissions.seed.ts` · `src/modules/spay-neuter/**` (new) · `src/app.ts` (router mounts) · `src/config/constants.ts` (`RESOURCES`, `ROLES`, `ERROR_CODES`) · `src/middlewares/spayClinicAccess.ts` (new) · `src/utils/qr.ts` (`generateSpayQrToken`) · `src/jobs/spay-hold-expiry.job.ts` (new) · `src/worker.ts` · `src/modules/payments/payments.service.ts` (settle hook for `entityType = 'spay_booking'`) · `src/modules/spay-neuter/__tests__/**` (new)

**bpa_admin**
`src/lib/api/spay-neuter.api.ts` (new) · `src/app/(admin)/spay-neuter/**` (new) · `src/app/(admin)/clinic/**` (new) · `src/assets/data/menu-items.ts` · `middleware.ts` · `src/types/bpa.types.ts`

**bpa_user_app**
`lib/features/spay_neuter/**` (new) · `lib/repositories/spay_booking_repository.dart` (new) · `lib/models/spay_*.dart` (new) · `lib/services/api/bpa_api_service.dart` · `lib/routes/{app_routes,app_router,cta_router}.dart` · `test/spay_*_test.dart` (new)

**bpa_web**
`app/spay-neuter/**` (new) · `lib/api/spay-neuter.ts` (new) · `components/spay-neuter/**` (new)

---

## 8. Migration and rollback risks

**Migration shape:** purely additive — new tables, new enums, one optional back-relation on `ClinicBranch`. No column drops, no type changes, no backfill of existing tables. Rollback is `DROP TABLE` on the new tables plus `DROP TYPE` on the new enums.

| Risk | Mitigation |
|------|------------|
| Postgres enum values cannot be removed without a type rewrite | Name `SpayBookingStatus`, `SpayProcedure`, `SpayHoldStatus`, `SpayStaffRole`, `SpayRefundStatus`, `SpayOutcome` correctly the first time; review before the migration is generated |
| Permission seed could revoke existing grants | Seed must be strictly additive and idempotent; verify with `npm run seed:verify` (`prisma/__tests__`) |
| New `/clinic` route group could shadow an existing admin path | `bpa_admin` has no existing `/clinic` (only `/clinics` — the directory); confirm no collision and that `/clinics` behaviour is unchanged |
| `middleware.ts` `authRequiredPaths` is a manual list | Add both `/spay-neuter` and `/clinic`; add a test asserting protected paths redirect when unauthenticated |
| Slot generation could produce a huge table | Bound by `bookingHorizonDays`; generation must be idempotent (upsert on `@@unique([clinicProfileId, slotDate, startTime])`) and re-runnable |
| Capacity drift from a crashed worker | Lazy expiry on read + a reconciliation script that recomputes `bookedCount`/`heldCount` from child rows |
| Booking-number collisions | Postgres sequence, not `count()` — explicitly avoiding gap #6 |
| Money precision | `Decimal(10,2)` throughout; `serializeData` already converts Decimal on the way out; never use floats in the service layer |
| Timezone errors around cutoffs and check-in windows | All derived timestamps computed once at booking time in the clinic's timezone and frozen; never recomputed from a mutable policy |
| `bpa_user_app` has ~40 uncommitted files | Flutter work must not start until that is committed or rebased with the user's agreement |
| Regression into the live campaign flow (which has no tests) | No campaign table, service, or route is modified by this design |

**Dark launch:** gate the entire module behind `SPAY_NEUTER_ENABLED` in `src/config` so routers can be mounted but disabled, and admin/app entry points hidden, until acceptance passes.

---

## 9. Acceptance-test matrix

| # | Spec rule | Assertion | Layer |
|---|-----------|-----------|-------|
| 1 | BDT 500 advance is part of total | `advancePaidBdt + balanceDueBdt === totalPriceBdt`; the created `Payment.amount` equals the advance, **not** the total | API unit |
| 2 | Balance paid at clinic | Completing a booking makes **no** gateway call; `balanceCollectedBdt` is set only by a clinic staff action | API unit |
| 3 | Neuter default 20 min | Seeded `SpayServiceType(neuter).durationMinutes === 20`; a 4-hour window generates the expected slot count | API unit |
| 4 | Spay default 40 min | Seeded `SpayServiceType(spay).durationMinutes === 40`; likewise | API unit |
| 5 | Clinic-specific concurrent capacity | `concurrentOperationCapacity` is required (no default); generated `SpaySlot.capacity` matches it | API unit |
| 6 | Concurrency safety | N+1 simultaneous bookings against a slot of capacity N: exactly N succeed, the surplus gets 409 | API integration |
| 7 | Slot hold = 10 minutes | `expiresAt − createdAt === 10 min`; an expired hold does not block a new booking even with the worker stopped; a converted hold is not double-counted | API unit + integration |
| 8 | Cancellation cutoff = 24h | Cancel at cutoff + 1 min succeeds; at cutoff − 1 min returns 409 with a specific error code | API unit |
| 9 | Arrival 20 min before | `arriveByAt === scheduledStartAt − 20 min`, and the value is surfaced in the booking response and the app confirmation screen | API + app |
| 10 | Check-in up to 1h early | Check-in accepted from `scheduledStartAt − 60 min`; rejected earlier with a specific error code | API unit |
| 11 | Clinic staff cannot alter payments | Every `/api/v1/admin/payments/*` route returns 403 for `clinic_admin`, `clinic_vet`, `clinic_front_desk` | API integration |
| 12 | Clinic staff cannot refund | `POST /admin/spay-neuter/refund-requests/:id/approve` returns 403 for all clinic roles; clinic can only create a `pending` request | API integration |
| 13 | Refunds require Central Admin | Only central roles can approve; approval writes an `AuditLog` row with actor and reason | API integration |
| 14 | Cross-clinic isolation | `clinic_admin` of branch A gets 403 on a booking belonging to branch B (`spayClinicAccess`) | API integration |
| 15 | Shared pet registry | A booking for a pet not returned by `/me/pets` for the caller is rejected; **`prisma.pet.count()` and `prisma.petOwner.count()` are unchanged** by the whole spay flow | API integration |
| 16 | Pet snapshot immutability | Changing the pet upstream after booking does not change `SpayBookingPet` snapshot fields | API unit |
| 17 | Envelope conformance | Every new endpoint returns `{success, data, meta?}`; every error returns `{success:false, requestId, error:{code,message}}` | API integration |
| 18 | Pagination conformance | List endpoints honour `?page&limit`, clamp limit to 100, and return complete `meta` | API integration |
| 19 | QR | Token is unguessable, resolves to exactly one booking, scanning writes `QRScanLog`, and re-scan after check-in is idempotent | API integration |
| 20 | Audit coverage | Every status transition and every refund action writes an `AuditLog` row | API integration |
| 21 | Reschedule integrity | Old slot is released and the new one reserved atomically; total capacity across both slots is conserved | API integration |
| 22 | Idempotency | Replaying `POST /holds` and `POST /bookings` with the same `Idempotency-Key` creates exactly one record | API integration |
| 23 | Owner booking history | `GET /me/spay-neuter/bookings` returns the caller's bookings; the app does **not** fall back to `shared_preferences` | API + app |
| 24 | Admin gating | Unauthenticated access to `/spay-neuter` and `/clinic` redirects to sign-in; menu items hidden without permission | Admin test |
| 25 | Notifications | Confirmation, hold-expiry, arrival reminder, and cutoff reminder are enqueued once each (outbox `jobId` dedup verified) | API integration |

---

## 10. Open items for the implementation phase

These are non-blocking but must be settled before the corresponding step:

1. **Advance per booking vs per pet** — the spec fixes BDT 500 but not its multiplicity for multi-pet bookings. `SpayServiceType.advanceBdt` supports either; confirm with the business owner before §6.1 step 5.
2. **Guest bookings** — the campaign flow supports guests (`isGuest`, `POST /public/pets/guest`). This design is authenticated-only, because the shared pet registry requires a Central Auth bearer. Confirm that spay/neuter is signed-in only.
3. **Refund execution** — EPS has no refund API wired up. `SpayRefundRequest` tracks the decision and an `externalRefundRef`; actual disbursement is assumed manual until an EPS refund integration exists.
4. **Slot granularity** — whether a clinic's slot grid uses a fixed granularity (e.g. 20 min) with spay consuming two adjacent units, or per-service-type slot streams. Recommendation: fixed 20-minute granularity with a `unitsConsumed` derived from `durationMinutes`, decided at §6.1 step 3.
5. **Certificate / discharge document** — `PetDocumentCategory` in the Flutter contract already has `SURGERY_DOCUMENT` and `DISCHARGE_SUMMARY`; whether post-op documents push back into the Furtail registry is out of scope for phase 1.

---

## 11. Phase 1 build record — backend domain & database foundation

This section documents what was actually implemented against §4–§5 above, in `bpa_api` only, on the local dev database. It supersedes §4/§5 wherever they disagree (see §11.2).

### 11.1 Migrations

Two additive migrations, applied to the local dev database (`postgresql://bpa_user:***@127.0.0.1:5433/bpa_db`) and recorded in `_prisma_migrations` via `prisma migrate resolve --applied` (not run through `prisma migrate dev` — see rationale below):

| Migration | Purpose |
|---|---|
| `20260803214227_add_spay_neuter_booking_system` | 8 enums, 18 tables, all FKs/indexes/uniques, plus 11 hand-appended `CHECK` constraints |
| `20260803214500_add_spay_booking_number_seq` | `CREATE SEQUENCE spay_booking_number_seq` backing `SpayBooking.bookingNumber` |

**Why not a plain `prisma migrate dev`:** the shadow-database replay of this repo's *existing* migration history fails independently of this change — `20260723111920_add_push_notification_system` errors with `P1014: the underlying table for model 'partner_clinics' does not exist` when replayed from scratch (pre-existing drift in migration history, unrelated to spay/neuter). Worked around with `prisma migrate diff --from-url <live-db> --to-schema-datamodel prisma/schema.prisma --script`, which diffs the already-up-to-date live database against the target schema instead of rebuilding history in a shadow DB. The resulting SQL was applied with `prisma db execute` and registered with `prisma migrate resolve --applied`, so `prisma migrate status` reports clean and any teammate's future `prisma migrate dev` will not attempt to redo this step. **This pre-existing shadow-DB drift is a latent risk for any future migration in this repo and is worth a dedicated fix outside this task's scope.**

**Not run against production** — `DATABASE_URL` in `.env` points at `127.0.0.1:5433`, confirmed local before any write.

### 11.2 Deviations from §4 (Phase 0 design), driven by the Phase 1 task brief

The Phase 1 task brief specified requirements not fully anticipated in §4, most importantly an **admin-controlled Offer entity with an explicit lifecycle**. The schema was adjusted accordingly; §4 above is now superseded by this table where they conflict:

| §4 (Phase 0) | Implemented (Phase 1) | Why |
|---|---|---|
| No `status` lifecycle on `SpayOffer`; not explicitly a draft/publish workflow | `SpayOfferStatus {draft, published, paused, completed}` | Explicitly required: "Offers with DRAFT, PUBLISHED, PAUSED, and COMPLETED lifecycle" |
| Price lived on `SpayServiceType` (clinic-scoped), one row per clinic × procedure | Price lives on `SpayOffer` (`neuterTotalPriceBdt`, `spayTotalPriceBdt`), admin-controlled and clinic-independent; `SpayClinicService` now holds **only** `durationMinutes`/`isActive` | Explicitly required: "Separate Spay and Neuter total prices controlled only by BPA Admin" — prices must not vary by clinic or be settable by clinic staff |
| `SpayOfferClinic` not specified | Added: join table between `SpayOffer` and `ClinicBranch`, reusing the existing clinic directory rather than duplicating clinic data | Required: "Existing/new participating clinic association" |
| No payment-attempt table | Added `SpayPaymentAttempt` (one row per EPS initiation attempt, `merchantTxnId` unique) distinct from the single `Payment` row a booking ultimately settles to | Required: "Payment attempts and provider references" — a booking may retry EPS initiation before success |
| No pre-op questionnaire | Added `SpayMedicalQuestionnaire`, 1:1 with `SpayBookingPet` | Required: "Medical questionnaire and pre-operative assessment" |
| Booking status changes only asserted via generic `AuditLog` | Added `SpayBookingStatusHistory` (structured, booking-scoped, `fromStatus`/`toStatus`) *in addition to* generic audit logging | Required: "Booking status history **and** append-only audit events" as two distinct concerns — the structured table is for UI timelines, `writeAuditLog()` remains the cross-cutting audit trail |
| No reschedule table | Added `SpayBookingRescheduleEvent` (append-only, preserves from/to slot and time per reschedule) | Required: "...and reschedule history" |
| `@@check` used directly in `schema.prisma` | Removed — Prisma 5.14 in this repo has no `previewFeatures` enabling check constraints (confirmed: no other model in the 5,000+ line schema uses `@@check`). All 11 invariants are instead hand-appended as raw `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` SQL at the end of `20260803214227_add_spay_neuter_booking_system/migration.sql` | Prisma schema validation error on `@@check`; house convention has zero precedent for the preview feature |
| Booking owner was going to be a plain string | Confirmed via `src/middlewares/requireCentralAuthUser.ts` that `req.user.sub` is the **Central Auth subject**, not a local `User.id` — `SpayBooking.centralAuthUserId` is a plain indexed `VARCHAR`, deliberately not a `User` FK | Matches the locked decision (§0 decision 2): no local ownership row is created; owner identity is exactly what `/me/pets` already trusts |

### 11.3 Schema additions (final)

8 enums (`SpayOfferStatus`, `SpayProcedure`, `SpayBookingStatus`, `SpayHoldStatus`, `SpayPaymentAttemptStatus`, `SpayRefundStatus`, `SpayOutcome`, `SpayStaffRole`) and 18 models: `SpayOffer`, `SpayOfferClinic`, `SpayClinicProfile`, `SpayClinicService`, `SpayClinicSchedule`, `SpayClinicBreak`, `SpayClinicBlockedPeriod`, `SpayClinicDateException`, `SpaySlot`, `SpaySlotHold`, `SpayBooking`, `SpayBookingPet`, `SpayMedicalQuestionnaire`, `SpayBookingStatusHistory`, `SpayBookingRescheduleEvent`, `SpayPaymentAttempt`, `SpayRefundRequest`, `SpayClinicStaff`. Back-relations were added to `ClinicBranch`, `MediaFile`, `Payment`, `Doctor`, and `User` (13 new named relations on `User` alone — one per FK, since Prisma requires an explicit inverse array field for every relation).

**Money:** `Decimal(10,2)`, matching house convention. `SpayOffer` requires each total price ≥ its advance (`spay_offers_neuter_price_ge_advance`, `spay_offers_spay_price_ge_advance` CHECK constraints) — enforced at the DB layer, not just in `computeBookingPrice()`.

**Timestamps:** every instant is `@db.Timestamptz` (UTC on disk, per instruction). No wall-clock/Asia-Dhaka logic exists anywhere in the schema or migration; `SpayClinicProfile.timezone` (default `Asia/Dhaka`, mirroring `ClinicBranch.timezone`) is the only place a zone identifier is stored, and it is consumed exclusively by application code (`spay-neuter.domain.ts`) at the point derived fields like `arriveByAt` are computed — never by the database.

**Soft deletion:** `SpayOffer.deletedAt` follows the existing `User`/`CampaignService` soft-delete convention. Child tables (`SpayClinicProfile`, `SpaySlot`, bookings, etc.) do **not** get a `deletedAt` — they are either cascade-deleted with their clinic/offer or, for `SpayBooking` and everything under it, intentionally immutable/append-only per the task brief ("Booking status history and append-only audit events") — a booking is cancelled via `status`, never deleted.

**Indexes/constraints beyond FKs:** unique constraints on `bookingNumber`, `qrToken`, `paymentId`, `holdId` (all on `SpayBooking`), `merchantTxnId` (`SpayPaymentAttempt`), `idempotencyKey` (`SpaySlotHold`), `(clinicBranchId, userId)` (`SpayClinicStaff`), `(offerId, clinicBranchId)` (`SpayOfferClinic`), `(bookingId, externalPetId)` (`SpayBookingPet`), `(clinicProfileId, slotDate, startTime)` (`SpaySlot`); plus query-shape indexes on every status/date/foreign-key column used by the list endpoints described in §5.1 (not yet built — see §11.5).

### 11.4 RBAC seed

`RESOURCES`/`ACTIONS`/`ROLES` in `src/config/constants.ts` gained `spay_offers`, `spay_clinics`, `spay_slots`, `spay_bookings`, `spay_checkin`, `spay_refunds`, `spay_reports`, action `approve`, and roles `clinic_admin`/`clinic_vet`/`clinic_front_desk` — matching §5.2.

`prisma/seed/roles-permissions.seed.ts` was extended **additively**: the new resources were added to `RESOURCES` (used by `super_admin`/`viewer`, which enumerate everything) and to `admin`'s resource list (so central admin gets the same spay/neuter access as super_admin, including `spay_refunds:approve`, matching §5.3's "central roles"). Three new role definitions were added for the clinic roles, each **deliberately excluding `spay_refunds:manage` and `spay_refunds:approve`** — `authorize.hasPermission()` treats `<resource>:manage` as a wildcard for every action on that resource, so granting `spay_refunds:manage` to a clinic role would have silently included approval rights, defeating the "clinic staff cannot alter payments or issue refunds" rule. `clinic_admin` gets `spay_refunds:create` only, via an explicit `exactPermissions` entry, never the blanket `manage` action on that resource.

Ran (targeted, not the full `npm run db:seed` pipeline) against the local dev DB: **12 roles total (9 pre-existing + 3 new)**, **1,185 permissions** upserted, **2,874** role↔permission mappings synced. Verified directly against the DB afterward:
- `clinic_admin`/`clinic_vet`/`clinic_front_desk` — **zero** `payments:*` permissions, **zero** `spay_refunds:approve`/`spay_refunds:manage`.
- `admin`/`super_admin` retain full `spay_refunds:approve` and `payments:*` as expected of central roles.
- `campaign_manager` (a pre-existing, untouched role) still has its original 141 permissions — confirming the sync is scoped per-role and did not disturb unrelated roles.

### 11.5 Application code added

`src/modules/spay-neuter/`:
- `spay-neuter.types.ts` — zod request schemas (`createSpayOfferSchema`, `createSlotHoldSchema`, `createSpayBookingSchema`) and pure TypeScript types for the domain layer. No price or balance field is ever accepted from a client schema — these are always server-computed (§4.3 rule 3).
- `spay-neuter.domain.ts` — pure, DB-free functions implementing the §4.3 invariants: `computeBookingPrice` (integer-cent arithmetic so `advancePaidBdt + balanceDueBdt === totalPriceBdt` holds exactly, never float-drifted), `computeBookingSchedule` (derives `scheduledEndAt`/`arriveByAt`/`checkinOpensAt`/`cancellationCutoffAt` from one instant + clinic policy), `isCancellationAllowed`, `isCheckinAllowed`, `isHoldUsable` (lazy-expiry check), `formatBookingNumber`.
- `spay-neuter.repository.ts` — the atomic capacity primitives (`reserveHold`, `releaseHold`, `convertHoldToBooking`, `releaseBookingSlot`), copying the exact conditional-`UPDATE` + rowcount pattern from `campaign-registrations.repository.ts:reserveSlots`; `expireStaleHolds` (the belt-and-braces sweep described in §4.3 rule 2); `generateSpayBookingNumber` (via `nextval('spay_booking_number_seq')`, not `count()+1`).
- `src/utils/qr.ts` gained `generateSpayQrToken`/`buildSpayQrUrl`, mirroring the existing `generateQrToken`/`buildQrUrl`.

**Not built in Phase 1** (explicitly out of scope — this phase was domain + database only):
- No router/controller/HTTP layer (§5.1's endpoint list is still a spec, not code) — no `spay-neuter.router.ts`, no `spay-neuter.controller.ts`, no `spayClinicAccess` middleware.
- No booking/hold *service* orchestration (the piece that would call the repository + domain functions together inside a transaction, call `/me/pets`, create the `Payment`, etc.) — only the atomic building blocks it will be built from.
- No `src/jobs/spay-hold-expiry.job.ts` worker registration (the sweep function `expireStaleHolds` exists and is tested, but nothing calls it on a schedule yet).
- No notification outbox wiring, no PDF/receipt generation, no CSV export.
- No `bpa_admin`, `bpa_user_app`, or `bpa_web` changes — this task was scoped to `bpa_api` only, per the brief.

### 11.6 Tests

`src/modules/spay-neuter/__tests__/spay-neuter.domain.test.ts` (24 tests, pure, no DB) and `spay-neuter.repository.test.ts` (5 tests, integration, against the local dev DB with full fixture create/teardown) — **29 tests, all passing**. Run scope: `npx jest src/modules/spay-neuter` (targeted, not the full suite, per instruction to run only fast targeted validation this phase). Full-repo `npm run typecheck` (`tsc --noEmit`) also passes with zero errors.

Two real bugs were caught and fixed by writing these tests before considering the code done:
1. **Float-drift in money math** — the first `computeBookingPrice` implementation rounded `totalPriceBdt` and `balanceDueBdt` independently via `Math.round(x*100)/100`, which does not guarantee `advance + balance === total` for inputs like `1000.005`. Rewrote to do all arithmetic in integer cents (`toCents`/`fromCents`), which makes the identity hold exactly by construction — caught by `computeBookingPrice`'s reconciliation test, not by inspection.
2. **A test fixture, not production code** — `spay_slot_holds_pet_count_positive` (one of the hand-added CHECK constraints) correctly rejected a hold row created with `petCount: 0` in the `expireStaleHolds` test; the fixture was corrected to `petCount: 1`. Left in the record because it is a working example of the CHECK constraints actually being enforced, not merely present.

Post-run DB verification confirmed the repository-level test suite leaves zero residue: `clinicOrganization`/`clinicBranch`/`spaySlot`/`spaySlotHold` counts matching the test's own fixtures were all `0` after `afterAll`/`afterEach` teardown.

### 11.7 Remaining work

In priority order, per §6.1 of the Phase 0 plan (steps 2 and onward — step 1, "schema + migration + seed", is what Phase 1 completed):
1. `spay-neuter.service.ts` — orchestrates hold creation/conversion, `/me/pets` ownership verification, `SpayBookingPet` snapshotting, and the `Payment`/EPS advance-payment call, inside transactions built on top of the Phase 1 repository functions.
2. `spay-neuter.controller.ts` + `spay-neuter.router.ts`, split into the four audiences from §5.1 (`public`, `me`, `clinic`, `admin`), mounted in `src/app.ts`.
3. `src/middlewares/spayClinicAccess.ts`, modelled on `campaignAccess.ts`.
4. `src/jobs/spay-hold-expiry.job.ts`, registered in `src/worker.ts`, calling `expireStaleHolds()` on an interval.
5. Slot generation service (hours − closures × duration, idempotent, bounded by `bookingHorizonDays`).
6. Notification outbox events, receipts/slips, CSV export, reports.
7. `bpa_admin`, `bpa_user_app`, `bpa_web` work per §6.2–§6.4 (unstarted).
