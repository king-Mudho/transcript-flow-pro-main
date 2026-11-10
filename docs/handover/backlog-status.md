# Backlog status: MSU Transcript Connect

Status of all 53 backlog items after this release. **Built** means the code is in
the repository with automated tests where the item has server rules. **Needs you**
lists the part of an item that cannot be done in code: an account, a decision, a
measurement on real devices, or a review by someone qualified.

Stages 0 to 3 were built in the previous release (commit `ece4c4e`); they are
listed for completeness and still pass their tests.

| ID | Item | Status | Needs you |
| --- | --- | --- | --- |
| B0.1 | Fix the build and match the live site | Built | Republish and check the live site |
| B1.1 | Export phone numbers to Excel | Built (now 17 columns incl. documents, amount paid, channel) | — |
| B1.2 | Lock down request submission | Built | — |
| B1.3 | Close public admin sign-up | Built | — |
| B1.4 | Page the admin list past 1,000 | Built | — |
| B1.5 | Clear old rejection reasons | Built | — |
| B2.1 | Six-status flow | Built | — |
| B2.2 | Request history log | Built (now also hand-in lists, MSU actions, payments) | — |
| B2.3 | Tracking stepper | Built, redesigned to G08–G10 | — |
| B2.4 | Edit delivery until dispatch | Built (now also directions and suburb list) | — |
| B3.1 | Drivers list | Built (now with Available today) | — |
| B3.2 | Dispatch batches | Built (closing now needs the cash check, B4.2) | — |
| B3.3 | Waybill PDF on WhatsApp | Built, branded | Test the share sheet on one Android and one iPhone |
| B3.4 | Driver on the tracking page | Built (G09) | — |
| B3.5 | Zimpost dispatch details | Built (Dispatch › Zimpost branches tab) | — |
| B4.1 | Record payments properly | Built: payments table, receipts RCT-YYYY-NNNNNN, reversals, Unpaid/Part-paid/Paid filters | — |
| B4.2 | Driver cash reconciliation | Built: close panel, variance note, daily cash report | — |
| B4.3 | Prices the admin can change | Built: Settings › Prices, audit-logged | — |
| B5.1 | Confirmation slip and lost reference | Built: PDF, Save to WhatsApp, `/status?ref=`, Lost your reference | — |
| B5.2 | Status notifications | Phase 1 built (Send update on WhatsApp, editable templates). Phase 2 built: SMS and email on every stage change, logged in Reports › Messages | Choose an SMS provider and set `SMS_API_URL`/`SMS_API_KEY`; set `EMAIL_HOST` |
| B5.3 | Phone and reg number validation | Built; existing phones cleaned by migration | Confirm the MSU reg number format (currently warns, does not block) |
| B5.4 | Duplicate request warning | Built (reference shown only when the phone matches too) | — |
| B5.5 | Privacy, terms and consent | Built: `/privacy`, `/terms`, required consent, time and terms version stored | Have the wording checked against the Cyber and Data Protection Act by someone qualified |
| B5.6 | Clearance proof upload | Built: private storage, Verified switch, override note | Decide if proof becomes required (currently optional) |
| B5.7 | Several documents per request | Built: transcript and degree certificate with quantities, one fee | Confirm the document list |
| B6.1 | Team accounts and staff role | Built: Settings › Team and roles, invitations by email | — |
| B6.2 | Operations dashboard | Built: Overview (A02) | — |
| B6.3 | Searchable, fuller branch list | Built: 60+ branches seeded, CSV import, deactivate-only when in use | Check the list against Zimpost's official branch list |
| B6.4 | SEO and share preview | Built: share image, favicons, manifest, sitemap, robots, per-page titles | Register the domain in Google Search Console |
| B7.1 | Design tokens and components | Built (`styles.css`, `components/ds.tsx`) | — |
| B7.2 | Accessibility and speed | Built to the rules (labels, focus, 44px targets, announced errors, stepper semantics, keyboard) | Run Lighthouse and an axe scan on staging; test on a low-end Android over 3G |
| B7.3 | Analytics and error alerts | Built: cookie-free page views and form funnel, browser and server errors emailed to ADMINS | Set `ADMINS` and `EMAIL_HOST`; force an error on staging to confirm the alert |
| B8.1 | Home page (G01, G11) | Built | — |
| B8.2 | Four-step request flow (G02–G05) | Built | — |
| B8.3 | Confirmation page (G06) | Built | — |
| B8.4 | Tracking pages (G07–G10) | Built | — |
| B9.1 | Admin shell and global search | Built: sidebar counts, Ctrl K search, bell, sign-in with Keep me signed in | — |
| B9.2 | Staff-assisted requests | Built: New request, channel, staff name, consent given to staff | — |
| B9.3 | Requests list with stage tabs | Built: tabs with counts, days in stage colours, saved views, bulk bar | — |
| B9.4 | MSU hand-in lists | Built: HL-1010 onwards, A4 PDF | — |
| B9.5 | Request detail page and notes | Built: full page, Previous/Next, team notes | — |
| B9.6 | Dispatch and batch screens | Built: grouped by suburb, driver availability, close panel | — |
| B9.7 | Settings hub, suburbs, audit log | Built | — |
| B9.8 | Delivery labels with barcodes | Built: 4×6 in and A4, Code 128, scan opens the request | Print a test batch on the 203 dpi thermal printer |
| B10.1 | MSU portal switch and role | Built (off by default) | — |
| B10.2 | MSU release queue (M01) | Built at `/msu` | — |
| B10.3 | Collection runs | Built: MSU and collections page, pick-up list PDF, works with the portal off | — |
| B10.4 | Monthly report | Built: on screen, PDF and Excel | — |
| B11.1 | Security hardening | Built: two-step sign-in, idle sign-out, lookup rate limit, honeypot and optional Turnstile, OWASP review (see `security-review.md`) | Add Turnstile keys if you want the extra bot check |
| B11.2 | Data protection pack | Built: retention job, export/erase one graduate, DPA template | Legal review; agree the retention period (12 months assumed) |
| B11.3 | Backups, monitoring, staging | Built: nightly backup and restore scripts, `/api/health/`, runbook | Set up the staging server, an off-site backup target and an uptime monitor |
| B11.4 | Brand settings | Built: name, logo, colours, support number, operator line | — |
| B11.5 | Handover and sale pack | This folder | Sign the UAT workbook |

## Open questions and the assumption used

| Question | Assumption built |
| --- | --- |
| Waybill format | Ordinary A4 PDF |
| Reopen a rejected request? | No; the graduate sends a new request |
| "Ready at Zimpost branch" step? | No; six statuses kept |
| Can admins edit phone and email before dispatch? | Yes |
| Driver details shown to graduates | Name, phone, bike registration, photo if added |
| SMS provider | Any HTTP JSON provider, configured by environment; none set |
| Payment methods | Cash only (cash on delivery, cash deposit) |
| Reg number format | `R` + 6 digits + letter; warn, do not block |
| Clearance proof | Optional |
| Documents | Academic transcript and degree certificate, one fee per request |
| MSU staff see phone numbers? | No |
| Retention | 12 months, editable in Settings |
| Own name and colours for MSU | Brand settings built; defaults unchanged |
