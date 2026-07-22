# Controlled Merge Report

- Repository: `https://github.com/balagpetcare/bpa_web_api`
- Pull request: `https://github.com/balagpetcare/bpa_web_api/pull/1`
- Merge date: July 21, 2026
- Base branch: `main`
- Head branch: `recovery/genuine-bpa-api-20260721`

## Remote references before merge verification

- `origin/main` before merge safety reference: `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- `origin/recovery/genuine-bpa-api-20260721`: `5b6a94e61ade33d2644c78d507aea01c7f7ebca0`
- `origin/backup/main-before-recovery-merge-20260721`: `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- `bpa-main-before-recovery-merge-20260721` tag object: `7df49babacb252faf17d462bed5a85b7b9e90bf8`
- `bpa-main-before-recovery-merge-20260721` peeled commit: `c73c267a9ca492b152baa07dc0cd7922903ce5ab`

## Safety verification

- Remote origin URL matched the genuine BPA repository: `https://github.com/balagpetcare/bpa_web_api.git`
- `origin/main` before merge matched and therefore descended from the expected BPA commit `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- Backup branch preserved the pre-merge `main` commit
- Backup tag preserved the same pre-merge `main` commit
- PR base/head matched expectations:
  - base: `main`
  - head: `recovery/genuine-bpa-api-20260721`
- PR commit set was the BPA recovery chain only:
  - `4b56e0e` — `docs: record genuine BPA API recovery base`
  - `5dd6356` — `feat(api): add BPA request correlation and me-pets throttling`
  - `4cbca74` — `docs: record latest BPA recovery validation`
  - `5b6a94e` — `fix(test): restore BPA fresh-db validation flow`
- No `.env` files or secret files were included in the PR diff
- No Bala G / Balaji clinic runtime modules or clinic branding were present in the PR code diff

## Prisma and database review

- Prisma changes were present in the recovery branch and were explicitly documented and tested before merge
- Scope of Prisma-related recovery changes:
  - repair of a broken historical migration for fresh local BPA database validation
  - alignment of genuine BPA migration history with the recovered Prisma datamodel for disposable local testing
- No production migrations were run
- No production or shared database credentials were used

## Isolated database test gate

Validated on July 21, 2026 against an isolated disposable localhost-only PostgreSQL 16 Docker database.

- `npx prisma generate` — passed
- `npm run typecheck` — passed
- `npm run build` — passed
- `npm test -- --runInBand` — passed
- full result: 18 / 18 suites passed, 214 / 214 tests passed

## PR update and state change

- Updated the PR description to reflect:
  - the recovery incident summary
  - authoritative base commit `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
  - the exact recovery commits being merged
  - isolated database test results
  - Prisma assessment
  - rollback references
  - rollback procedure
- Changed the PR from draft to ready for review

## Merge action

- Merge method: normal merge commit
- Squash merge: not used
- Rebase merge: not used
- Recovery branch deletion after merge: not performed

## Post-merge verification

- PR state: `MERGED`
- PR merged at: `2026-07-21T15:34:01Z`
- PR merge commit: `90cd960355eaa01c45acdaca44873a9ac097b124`
- `origin/main` after merge: `90cd960355eaa01c45acdaca44873a9ac097b124`
- Verified `origin/main` contains recovery branch tip `5b6a94e61ade33d2644c78d507aea01c7f7ebca0`
- `origin/backup/main-before-recovery-merge-20260721` remained unchanged at `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- `bpa-main-before-recovery-merge-20260721` remained unchanged and still peeled to `c73c267a9ca492b152baa07dc0cd7922903ce5ab`
- `origin/recovery/genuine-bpa-api-20260721` remained unchanged at `5b6a94e61ade33d2644c78d507aea01c7f7ebca0`
- No other branch or tag changes were made by this step

## Controlled production deployment plan (prepared only, not executed)

1. Back up current production server source and configuration
   - capture the current deployed source tree into a dated backup directory
   - back up PM2 ecosystem or process config
   - back up environment files and runtime configuration separately with restricted permissions

2. Verify production database compatibility
   - compare production database schema state against the merged BPA Prisma/migration expectations
   - confirm whether any migration repair already exists in production
   - do not run production migrations until compatibility is reviewed and approved

3. Build in a release directory
   - create a new dated release directory on the server
   - deploy source into that directory without overwriting the active release
   - install dependencies and build there

4. Health-check before traffic switch
   - verify app boot in the release directory with production-safe config
   - confirm expected API health endpoints
   - confirm no secret leakage in logs

5. PM2 reload with rollback ready
   - point PM2 to the new release only after health checks pass
   - use a controlled reload strategy so the previous release remains available for rollback

6. API smoke tests
   - run post-reload smoke checks against key BPA endpoints
   - confirm authentication, campaign, membership, and health routes behave as expected

7. Rollback path
   - if any deployment verification fails, revert PM2 to the prior release immediately
   - preserve the remote rollback refs:
     - `backup/main-before-recovery-merge-20260721`
     - `bpa-main-before-recovery-merge-20260721`
   - if source rollback is required beyond the server release swap, restore from the backup tag or backup branch through a separate controlled Git/server operation

## Local workspace note

- This step did not commit or push `CONTROLLED_MERGE_REPORT.md`
- Existing untracked local files remained untouched:
  - `MAIN_BACKUP_REPORT.md`
  - `RECOVERY_BRANCH_PUSH_REPORT.md`
