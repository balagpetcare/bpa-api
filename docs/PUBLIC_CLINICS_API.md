# BPA `/api/v1/public/clinics` — Public Clinic Directory API

Updated: July 22, 2026

## Overview

Read-only, public (no authentication) API serving the clinic/branch
directory built in Command 2 (`ClinicOrganization` / `ClinicBranch` and
related tables). This is the single source both the Flutter user app and
the `bpa_web` public website must call — neither client talks to the
database schema directly; both consume the stable DTO documented below.

Only **published** branches belonging to **published** organizations are
ever returned. Nothing here requires authentication, and nothing here
accepts a write — the router defines `GET` routes only.

## Rate limiting & caching

- `publicReadLimiter`: 60 requests/minute per IP (same limiter used by every
  other public read endpoint in this API).
- `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`
  on every response (same convention as `/api/v1/app/*`).

## Endpoints

### `GET /api/v1/public/clinics`

Query parameters (all optional, all validated — invalid combinations return
`400 VALIDATION_ERROR`):

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches clinic/organization name, branch name, area, address (case-insensitive) |
| `cityCorporation` | string | Partial match |
| `area` | string | Partial match |
| `district` | string | Partial match |
| `organizationSlug` | string | Exact match — other branches of one organization (e.g. a clinic detail page's "Other Branches" section) |
| `service` | string | Partial match against a branch's listed services |
| `animalType` | enum | `DOG`\|`CAT`\|`BIRD`\|`RABBIT`\|`REPTILE`\|`SMALL_MAMMAL`\|`EXOTIC`\|`OTHER` |
| `facilityType` | enum | `LABORATORY`\|`SURGERY`\|`IMAGING`\|`PHARMACY`\|`HOSPITALIZATION`\|`HOME_SERVICE` — only matches a branch with that facility CONFIRMED (`available: YES`); an `UNKNOWN`/`NO` row never matches |
| `openNow` | `"true"` | Only branches currently open, computed in the branch's own timezone |
| `open24Hours` | `"true"` | Only branches with `open24Hours: YES` (never matches `UNKNOWN`) |
| `emergencyAvailability` | `"true"` | Only branches with `emergencyAvailability: YES` |
| `appointmentRequired` | `"true"` | Only branches with `appointmentRequired: YES` |
| `verifiedOnly` | `"true"` | Only branches with `verificationStatus: VERIFIED` |
| `featured` | `"true"` | Only branches whose organization is featured |
| `latitude`, `longitude` | number | Must be provided together |
| `radiusKm` | number, max 200 | Requires `latitude`/`longitude`; branches with unknown coordinates are never excluded by radius |
| `sortBy` | `distance`\|`name`\|`featured`\|`recentlyVerified` | `distance` requires `latitude`/`longitude`; default is `distance` when coordinates are given, else `name`. `recentlyVerified` orders by `lastVerifiedAt` descending, with never-verified branches always last |
| `page`, `limit` | number | `limit` capped at 50 |

Every sort mode has a deterministic tiebreaker (`branchName`, then `id`), so
pagination is stable across requests.

### `GET /api/v1/public/clinics/:slug`

Single branch by its public slug. `404 NOT_FOUND` if the slug doesn't exist
or isn't currently published — the response never distinguishes "doesn't
exist" from "unpublished" (nothing about an unpublished branch is exposed).
`distanceKm` is always `null` on this endpoint (no geo origin to measure
from).

### `GET /api/v1/public/clinics/filters`

Returns the distinct filter values actually present among published
branches, so clients can build filter UIs without guessing or hardcoding
lists:

```json
{
  "cityCorporations": ["DSCC (inferred)"],
  "areas": ["Banasree / Rampura", "Old Dhaka / Kazi Alauddin Road"],
  "districts": [],
  "services": ["Surgery", "Vaccination"],
  "animalTypes": ["CAT", "DOG"],
  "facilityTypes": ["LABORATORY", "SURGERY"]
}
```

## Response DTO

Every branch is returned in this stable shape (this is the contract clients
code against — the underlying Prisma schema can change without breaking
either client as long as this shape is preserved):

```jsonc
{
  "id": "3080427e-a3f1-467a-af79-8fe7ed1cb59a",
  "slug": "central-veterinary-hospital-old-dhaka-kazi-alauddin-road",
  "organizationName": "Central Veterinary Hospital",
  "organizationSlug": "central-veterinary-hospital",
  "organizationLogoUrl": "https://cdn.example.com/media/logo.jpg", // resolved server-side — Media Library asset URL if selected, else the legacy URL field, else null. Never a media ID or storage path.
  "organizationCoverUrl": null,
  "branchName": "Central Veterinary Hospital",
  "address": "48 Kazi Alauddin Road, Dhaka 1000",
  "area": "Old Dhaka / Kazi Alauddin Road",
  "cityCorporation": "DSCC (inferred)",
  "district": null,
  "postalCode": null,
  "location": { "latitude": 23.718, "longitude": 90.398 }, // null if unknown — never guessed
  "distanceKm": null, // null unless a lat/lng origin was given AND this branch has known coordinates
  "emergencyAvailability": "YES", // "UNKNOWN" | "YES" | "NO" — UNKNOWN is never coerced to false
  "open24Hours": "YES",
  "appointmentRequired": "NO",
  "accessibilityNotes": null,
  "verificationStatus": "VERIFIED", // "UNKNOWN" | "UNVERIFIED" | "VERIFIED" | "REJECTED"
  "lastVerifiedAt": "2026-07-20T12:00:00.000Z", // null if never verified
  "featured": true,
  "phones": [
    { "phoneNumber": "01745137090", "label": null, "isPrimary": true, "whatsappAvailable": "UNKNOWN" }
  ],
  "services": ["Vaccination", "Surgery"],
  "animalTypes": ["DOG", "CAT"],
  "facilities": [
    { "facilityType": "LABORATORY", "available": "UNKNOWN", "notes": null }
  ],
  "openingHoursStatus": {
    "status": "OPEN", // "OPEN" | "CLOSED" | "UNKNOWN" — computed in the branch's own timezone
    "timezone": "Asia/Dhaka",
    "todayHours": { "opensAt": "00:00", "closesAt": "23:59", "isClosed": false } // null if no hours configured for today at all
  },
  "weeklyHours": [
    { "dayOfWeek": 0, "opensAt": "00:00", "closesAt": "23:59", "isClosed": false }
  ],
  "closures": [
    { "startDate": "2026-08-01", "endDate": "2026-08-03", "reason": "Eid holiday" }
  ],
  "images": [
    // `url` is the Media Library asset's resolved URL when this image came
    // from the picker, else the legacy plain-URL value — same fallback
    // rule as organizationLogoUrl/organizationCoverUrl above.
    { "url": "https://cdn.example.com/clinic.jpg", "isCover": true, "altText": null }
  ],
  "socialLinks": [
    { "platform": "FACEBOOK", "url": "https://facebook.com/...", "label": null }
  ],
  "actions": {
    "call": "tel:01745137090", // null if the branch has no phone on file
    "whatsapp": null, // only set when a phone is explicitly marked whatsappAvailable: YES
    "directions": "https://www.google.com/maps/search/?api=1&query=...", // branch's own Google Maps URL, or derived from lat/lng if present
    "website": null, // organization website, if any
    "share": "https://bangladeshpetassociation.com/clinics/central-veterinary-hospital-old-dhaka-kazi-alauddin-road"
  }
}
```

### Fields deliberately never exposed

`importNotes`, `importKey`, `createdById`/`updatedById`, `createdAt`/`updatedAt`,
and the `ClinicBranchSource` provenance rows (raw scraped source URLs) are
admin-only bookkeeping from Command 2's Excel import and are excluded at the
repository query level (not just filtered in the response) — they are never
fetched from the database for this API in the first place.

## Distance calculation

No PostGIS or other new database infrastructure — the directory's expected
size (tens to low hundreds of branches for the foreseeable future) makes a
plain Haversine calculation in application code both correct and simple to
test deterministically. If the directory grows large enough for full
in-memory filtering to become a real cost, that is the point to introduce
PostGIS and push distance/radius filtering into the query itself; the
service-layer boundary (`clinics-public.service.ts`) is where that change
would land without touching the controller, router, or response DTO.

## Verifying the original Command 1 bug stays fixed

`GET /api/v1/app/pages/partner_clinics` (the old, incorrect fallback route)
still — correctly — returns `400 VALIDATION_ERROR`, because `partner_clinics`
was never meant to be a member of `APP_CONTROL_PAGE_KEYS`. What changed in
Command 1 is that the Flutter app no longer sends that request: the CTA
router now resolves the `partner_clinics` quick action to the dedicated
Find Clinics screen instead. Confirmed live against a running server in this
session: `GET /api/v1/app/home/partner-clinics` (what the Flutter app
actually calls today) returns `200 {"success":true,"data":[]}`.
