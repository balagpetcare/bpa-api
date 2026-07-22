# BPA `/api/v1/me/pets` BFF Contract

Updated: July 16, 2026

## Source of truth

- Canonical pet data remains in Furtail API and Furtail database.
- BPA backend is a BFF/proxy layer only.
- Ownership is enforced by forwarding the authenticated Central Auth bearer token to Furtail.

## Endpoints

### Pet CRUD

- `GET /api/v1/me/pets`
- `POST /api/v1/me/pets`
- `GET /api/v1/me/pets/:petId`
- `PATCH /api/v1/me/pets/:petId`
- `DELETE /api/v1/me/pets/:petId`

### Vaccinations

- `GET /api/v1/me/pets/:petId/vaccinations`
- `GET /api/v1/me/pets/:petId/vaccinations/:vaccinationId`
- `POST /api/v1/me/pets/:petId/vaccinations`
- `PATCH /api/v1/me/pets/:petId/vaccinations/:vaccinationId`
- `DELETE /api/v1/me/pets/:petId/vaccinations/:vaccinationId`

### Medical history

- `GET /api/v1/me/pets/:petId/medical-history`
- `GET /api/v1/me/pets/:petId/medical-history/records`
- `GET /api/v1/me/pets/:petId/medical-history/records/:recordId`
- `POST /api/v1/me/pets/:petId/medical-history/records`
- `PATCH /api/v1/me/pets/:petId/medical-history/records/:recordId`
- `DELETE /api/v1/me/pets/:petId/medical-history/records/:recordId`

### Deworming

- `GET /api/v1/me/pets/:petId/deworming`
- `GET /api/v1/me/pets/:petId/deworming/:recordId`
- `POST /api/v1/me/pets/:petId/deworming`
- `PATCH /api/v1/me/pets/:petId/deworming/:recordId`
- `DELETE /api/v1/me/pets/:petId/deworming/:recordId`

### Weight history

- `GET /api/v1/me/pets/:petId/weights`
- `GET /api/v1/me/pets/:petId/weights/:recordId`
- `POST /api/v1/me/pets/:petId/weights`
- `PATCH /api/v1/me/pets/:petId/weights/:recordId`
- `DELETE /api/v1/me/pets/:petId/weights/:recordId`

### Documents

- `GET /api/v1/me/pets/:petId/documents`
- `GET /api/v1/me/pets/:petId/documents/:documentId`
- `POST /api/v1/me/pets/:petId/documents`
  - `multipart/form-data`
  - file field: `file`
  - metadata fields: `category`, `title?`, `documentDate?`, `notes?`
- `PATCH /api/v1/me/pets/:petId/documents/:documentId`
- `DELETE /api/v1/me/pets/:petId/documents/:documentId`

### Profile image

- `POST /api/v1/me/pets/:petId/profile-image`
  - `multipart/form-data`
  - file field: `file`
- `DELETE /api/v1/me/pets/:petId/profile-image`

## Upload behavior

- BPA accepts a real multipart file upload from Flutter.
- BPA forwards the file to Furtail `/media/upload`.
- BPA then creates or updates the canonical Furtail pet/document record using the returned `mediaId`.
- BPA never asks the client to paste a hosted public URL manually.

## Retry and timeout policy

- Upstream timeout is controlled by `FURTAIL_API_TIMEOUT_MS`.
- Limited retry applies only to safe `GET` requests.
- `POST`, `PATCH`, `PUT`, and `DELETE` are never retried automatically.
- Pet create and vaccination create still forward `Idempotency-Key` when supplied.

## Error behavior

- BPA preserves upstream `401`, `403`, `404`, `409`, `413`, `415`, and `422` where available.
- BPA maps upstream timeout to `504` with code `FURTAIL_TIMEOUT`.
- BPA maps transport/network failure to `502` with code `FURTAIL_REQUEST_FAILED`.
- BPA maps local multipart failures before upstream forwarding:
  - file too large -> `413 PAYLOAD_TOO_LARGE`
  - unsupported media type -> `415 UNSUPPORTED_MEDIA_TYPE`
  - invalid file bytes/content -> `422 INVALID_FILE_CONTENT`

## Logging

- Structured logs are emitted for upstream retries, timeouts, and upload calls.
- Logs include request id, operation, pet id, and basic file metadata when relevant.
- Logs do not include bearer tokens or medical document contents.
