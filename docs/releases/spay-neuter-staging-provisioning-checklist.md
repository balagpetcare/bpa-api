# Spay & Neuter — Staging Environment Provisioning Checklist

Status: **BLOCKED — STAGING INFRASTRUCTURE UNAVAILABLE.** No host has been positively
identified as staging. This document lists exactly what must be provided before any staging
discovery, deployment, or verification work (runbook §2 onward, go-live checklist) can
begin. Nothing in this checklist has been invented — every field is a genuine unknown, not
a placeholder standing in for a value someone already gave verbally.

Two IPs are known and are explicitly **not** usable as-is:
- `163.227.239.5` — previously associated with a production-facing BPA/Vaccination
  deployment. Not staging. Do not connect.
- `144.79.249.80` — present only in a local `~/.ssh/known_hosts` file. No confirmed role,
  username, or environment classification. Do not connect until positively identified.

---

## Required before any connection is attempted

| # | Item | Why it's needed | Status |
|---|---|---|---|
| 1 | Staging hostname or IP address | Target for all SSH-based discovery/deployment (runbook §2) | **MISSING** |
| 2 | SSH username | `pm2 list`, builds, and deploys all run as this user | **MISSING** |
| 3 | SSH port (if non-default) | Connection parameter | **MISSING** |
| 4 | Authentication method and key path (or explicit statement that password auth is in use) | Needed to establish the connection; **the key/password value itself must never be provided in chat or committed to any file** — only the local path to an already-provisioned key, or confirmation that an agent/existing key is authorized | **MISSING** |
| 5 | Staging API domain (e.g. `api-staging.<domain>`) | Populates `BACKEND_URL`, health-check URLs, EPS callback origin, Nginx verification (runbook §4, §6) | **MISSING** |
| 6 | Staging admin domain (e.g. `admin-staging.<domain>`) | Populates `NEXTAUTH_URL`, `NEXT_PUBLIC_API_BASE_URL`, admin health checks | **MISSING** |
| 7 | Staging database name (and confirmation it is a dedicated staging DB, not a shared dev DB) | Required before any `prisma migrate deploy` or backup command runs — must not be the same database backing any other running service | **MISSING** |
| 8 | EPS sandbox callback domain (the public HTTPS URL EPS sandbox is configured to call back to) | Required for the Phase 7 EPS sandbox end-to-end test — without this, `BACKEND_URL` cannot be set correctly and EPS callbacks cannot reach the staging host at all | **MISSING** |
| 9 | Explicit owner confirmation that the host is staging | The one non-negotiable gate — no technical signal (hostname pattern, `NODE_ENV` value, directory naming) is being treated as sufficient proof on its own; a human with authority over the host must state it plainly | **MISSING** |

## Also needed once connection details exist (not blocking the checklist itself, but blocking later phases)

- Firebase staging service-account credential (or confirmation staging will run with push
  disabled) and a designated staging test device/token for the Phase 8 reminder test.
- EPS sandbox merchant credentials (`EPS_MERCHANT_ID`, `EPS_STORE_ID`/`EPS_APP_KEY`,
  `EPS_USERNAME`, `EPS_PASSWORD`, `EPS_HASH_KEY`/`EPS_SECRET_KEY`) provisioned for the
  staging callback domain specifically — sandbox credentials tied to a different callback
  domain will not deliver callbacks to the staging host.
- Confirmation of who owns the rollback decision during a staging deployment window (this
  is a process fact, not a technical one, but the runbook's GO/NO-GO checklist has a
  sign-off line for it).

---

## What happens once this is filled in

With items 1-4 provided, Phase 2 (read-only staging host discovery — `hostnamectl`,
`whoami`, `pm2 list`, `git status`, etc., no writes) can proceed exactly as specified in the
runbook, producing the pre-flight PASS/FAIL/BLOCKED table before any deployment step is
considered. Items 5-9 are consumed progressively through Phases 4-9 as they come up — they
don't all need to be in hand before discovery starts, but migrations (Phase 4) cannot run
without item 7 confirmed as a genuinely isolated staging database, and the EPS sandbox test
(Phase 7) cannot run without items 5 and 8.

## What will not happen without this

No SSH connection, `pm2` command, build, migration, or Nginx check will be run against
`163.227.239.5`, `144.79.249.80`, or any other host until the items above are supplied and
item 9's explicit confirmation is on record. This checklist itself performs no discovery —
it is the list of inputs discovery needs.
