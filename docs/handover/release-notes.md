# Release notes

## 2026-11 — Stages 4 to 11: redesign, MSU portal, sale readiness

**Graduates**
* New home page, four-step request flow, confirmation page and tracking pages
  built to the redesign (G01–G11), phone first.
* Several documents in one request, one fee. Optional clearance proof upload.
* Confirmation PDF, Save to WhatsApp, tracking links with the reference filled
  in, and a lost-reference finder.
* Privacy notice and terms; consent recorded with each request.
* Phone numbers checked and stored as +263…; duplicate request warning.

**Operations team**
* New workspace: Overview, Requests with stage tabs and saved views, request
  detail pages with team notes, Ctrl K search, needs-attention bell.
* Payments with receipts and reversals; batch cash reconciliation; daily cash
  report.
* Hand-in lists for MSU, collection runs with pick-up lists.
* Dispatch grouped by suburb, driver availability, delivery labels with
  barcodes (thermal 4×6 and A4).
* Staff-assisted requests; staff role; team invitations; two-step sign-in.
* Settings hub: prices, branches (CSV import), suburbs, team, messages, stage
  warnings, MSU portal, brand, data protection, audit log.
* Automatic SMS/email at each stage (when a provider is configured).

**MSU**
* MSU staff portal (off by default): release queue, rejections with reasons,
  hand-in lists, monthly report.

**Under the hood**
* Prices, brand and messages come from Settings. Excel export moved fully to
  the server. Analytics without cookies; browser and server error alerts.
  Nightly backups, data retention job, health endpoint.

**Upgrade notes**
* Take a backup, then deploy. Migrations backfill existing requests (one "Not
  recorded" item each, legacy payment rows for requests already ticked Paid,
  phone format, suburb links) and seed suburbs and Zimpost branches.
* New `.env` settings: see `deploy/env-templates/backend.env.production`.
* Every admin sets up two-step sign-in at their next sign-in.
* Admin pages moved: the requests list is now `/admin/requests`; `/admin` is the
  Overview. Zimpost branches are under Settings.

## 2026-10-01 — Stages 0 to 3

Six-status flow, history, tracking stepper, delivery edits, drivers, dispatch
batches, waybill, server-side paging and Excel export, locked-down submission,
closed public sign-up.
