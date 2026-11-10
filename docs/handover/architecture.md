# Architecture and data model

## Components

```
Browser ──HTTPS──▶ nginx ──┬──▶ Node (TanStack Start, React 19)   graduate site, admin workspace, MSU portal
                           └──▶ gunicorn (Django 6 + DRF)  /api/  ──▶ PostgreSQL 16
                                                           └──▶ private_media/ (clearance files, never served by nginx)
systemd timers: msu-backup (01:15 nightly) · msu-retention (02:30 daily)
```

* **Frontend** (`Frontend/`): TanStack Start with file routes in `src/routes`.
  All API calls go through `src/lib/api-client.ts`. Design tokens are in
  `src/styles.css`; shared parts in `src/components/ds.tsx`. PDFs (confirmation,
  waybill, labels, hand-in list, pick-up list, monthly report) are built in the
  browser by `src/lib/pdf.ts`; Code 128 barcodes by `src/lib/code128.ts`.
* **Backend** (`Backend/`): Django apps
  * `accounts`: users, roles (admin, staff, msu_staff), two-step sign-in
    (`mfa.py`), team invitations, permission classes (`permissions.py`).
  * `core`: site settings (prices, brand, thresholds, messages, MSU switch,
    retention), Harare suburbs, audit log, analytics events, browser errors,
    health check.
  * `branches`: Zimpost branches with CSV import.
  * `requests_app`: requests and their whole life: items, clearance files,
    status rules, history, hand-in lists, payments, drivers, dispatch batches,
    team notes, saved views, notifications, MSU portal and reports.
* **Authorization** is enforced on every endpoint by a permission class
  (`IsAdmin`, `IsTeam`, `IsMsuStaff`, `IsTeamOrMsu`). The frontend hides what a
  role cannot use, but that is a convenience only.

## Request lifecycle

```
Received ──▶ Submitted to MSU ──┬──▶ Collected from MSU ──▶ Dispatched ──▶ Collected
                                └──▶ Rejected (reason required)
```

* One stage forward at a time; one step back with a note. Enforced in
  `Request.save()`, so the API, Django admin and scripts all obey.
* Received → Submitted to MSU needs clearance verified or an override note, and
  puts the request on a hand-in list (HL-1010, HL-1011, …).
* "Ready at MSU" is a flag inside Submitted to MSU, so graduates still see six
  stages.
* Harare requests reach Dispatched only through a dispatch batch.
* Delivery details lock at Dispatched.
* Every change writes a `RequestEvent` row (append-only). Each stage change
  also sends an SMS and email where configured, logged in `Notification`.

## Data model (main tables)

| Table | Purpose | Key fields |
| --- | --- | --- |
| `accounts_user` | Team and MSU accounts | email, full_name, totp_secret, mfa_enabled, is_active |
| `accounts_userrole` | Role per user | role: admin / staff / msu_staff |
| `core_sitesettings` | One row of settings | fee_harare, fee_outside, brand fields, hub_address, msu_portal_enabled, retention_months, terms_version, stage_thresholds, message_templates |
| `core_suburb` | Harare suburb list | name, area, active |
| `core_auditlog` | Admin changes (append-only) | actor, action, entity, entity_id, old_value, new_value |
| `core_analyticsevent` | Cookie-free counts | name, path, step, visit (random per tab) |
| `core_clienterror` | Browser errors | message, stack, url |
| `branches_zimpostbranch` | Zimpost branches | branch_name, branch_area, active |
| `requests_app_request` | A graduate's request | reference_number, graduate details, clearance ticks, clearance_verified, zone, address/suburb/directions or branch, fee_amount, payment_method, amount_paid, paid, status, status_reason, status_changed_at, batch, handin_list, ready_at_msu_at, channel, created_by, consent_at, terms_version, anonymised_at |
| `requests_app_requestitem` | Documents in a request | document_type, quantity |
| `requests_app_clearancefile` | Uploaded proof | file (private), original_name, size, content_type |
| `requests_app_requestevent` | History (append-only) | event_type, field, from_value, to_value, note, actor |
| `requests_app_handinlist` | Requests handed to MSU together | number |
| `requests_app_payment` | Cash received (append-only; reversals) | amount, method, received_by_user / received_by_driver, receipt_number, reversal_of, batch |
| `requests_app_driver` | Drivers | name, phones, bike, photo_url, active, off_on |
| `requests_app_dispatchbatch` | Harare delivery runs | batch_number, driver, status, cash_expected, cash_handed_in, variance_note |
| `requests_app_teamnote` | Internal notes | text, author |
| `requests_app_savedview` | Per-user list filters | name, params |
| `requests_app_notification` | Messages sent to graduates | channel, recipient, message, status, error |

## Public endpoints (no sign-in)

`POST /api/requests/` (submit), `POST /api/requests/clearance-upload/`,
`GET /api/requests/status/` and `POST /api/requests/find-reference/` (10 per 10
minutes per address), `GET /api/branches/?active=true`,
`GET /api/settings/public/`, `POST /api/analytics/`, `POST /api/client-errors/`,
`GET /api/health/`. Nothing else answers without a token.

## Running tests

```
cd Backend
python manage.py test          # 125 tests, needs PostgreSQL
cd ../Frontend
npx tsc --noEmit && npx eslint src && npm run build
```
