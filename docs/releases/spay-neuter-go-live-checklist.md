# Spay & Neuter — Go-Live Checklist

Companion to `spay-neuter-production-runbook.md` (full detail/rationale there — this is the
condensed operational checklist for the release window). Do not deploy if any GO/NO-GO box
is unchecked.

## Pre-flight (do first, all read-only)

- [ ] `git status` clean / expected on all three repos; no unrelated in-flight work will be
      swept up by the deploy.
- [ ] `npx prisma migrate status` against **production** — only the 6 spay migrations
      pending, nothing failed.
- [ ] `pm2 list` on the VPS — confirm actual process names for the API/worker (may differ
      from this repo's proposed `bpa-api`/`bpa-worker` in `ecosystem.config.cjs`).
- [ ] Confirm Nginx already proxies `/api/v1/**` (`sudo nginx -t` + `grep location`).
- [ ] Confirm EPS production credentials + `EPS_CALLBACK_IPS` + callback-origin
      registration with EPS.
- [ ] Confirm Firebase service-account is set on the **worker** environment (or a
      deliberate decision to launch with push off).
- [ ] Confirm `QR_SECRET` / `AUTH_JWT_SECRET` / `MAIL_CREDENTIAL_SECRET` are non-default —
      the app refuses to boot otherwise.

## Backup

- [ ] `pg_dump --format=custom` to `/srv/bpa/bpa_api/backups/..._pre_spay_neuter.dump`
- [ ] `pg_restore --list` on the dump to confirm it's readable

## Deploy order

1. [ ] `npx prisma migrate deploy` (bpa_api)
2. [ ] `npm run build` (bpa_api) → `pm2 reload bpa-api --update-env`
3. [ ] `pm2 reload bpa-worker --update-env`
4. [ ] `npm run build` (bpa_admin) → `pm2 reload bpa-admin --update-env`
5. [ ] Health checks pass (`/api/v1/health`, worker `:4100/health`, admin loads)
6. [ ] Leave all `SpayOffer` rows unpublished until smoke tests pass (dark launch)

## Smoke tests (see runbook §11 for full detail)

- [ ] Offer visibility (published shows, draft/paused 404s)
- [ ] Slot capacity respected
- [ ] Temporary hold created and expires
- [ ] Successful advance payment confirms booking (server-verified callback only)
- [ ] Failed/cancelled payment releases the slot
- [ ] Duplicate callback does not double-confirm or double-charge
- [ ] Booking confirmation notification received
- [ ] `balanceDueBdt == totalPriceBdt - advancePaidBdt` exactly
- [ ] Admin/clinic status transitions work and audit-log
- [ ] Reminder scan picks up the test booking (worker logs)
- [ ] QR/booking-code verification returns output-minimized data
- [ ] Branch isolation — clinic staff see only their own branch's bookings

## Publish

- [ ] Admin publishes the first live `SpayOffer` (small clinic set first)
- [ ] Re-run offer-visibility + slot-capacity smoke checks against the real offer

## Post-release (a few hours after traffic starts)

- [ ] Reconciliation queries (runbook §16) — 0 rows on every check
- [ ] Advance-collection totals match EPS settlement reports for the window

## Emergency disable (if something goes wrong post-launch)

Fast path (no deploy, seconds): Admin → Spay & Neuter → Offers → **Pause** each published
offer.

Hard kill switch (blocks hold/booking endpoints directly, requires a reload):
```
SPAY_NEUTER_ENABLED=false   # on bpa-api's env
pm2 reload bpa-api --update-env
```
Existing bookings, admin history, and reports remain fully accessible either way.

## Rollback

- [ ] Application only — `git checkout <previous-tag>` + rebuild + `pm2 reload` for
      bpa-api/bpa-worker/bpa-admin as needed. Database migrations are additive and never
      need reversing (see runbook §15).
- [ ] Never restore the pre-migration backup over live production — see runbook §15 for
      the correct forward-fix path if the migration itself is later found defective.

## Sign-off

- [ ] Rollback owner identified for the release window: ______________
- [ ] Communication channel for the release window: ______________
