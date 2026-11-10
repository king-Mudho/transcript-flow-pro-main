# Security review (OWASP Top 10, 2021)

Reviewed against the code in this release. "Residual" lists what remains for
the operator.

| Risk | How the service handles it | Residual |
| --- | --- | --- |
| A01 Broken access control | Every endpoint has a permission class; public endpoints are an explicit short list (see architecture.md). Roles: admin, staff, msu_staff. MSU staff get an MSU-only serializer without phones or addresses, and nothing while the portal is off. Clearance files are streamed only to the team or to MSU staff for requests at MSU; there is no public URL. Tests: `SecurityTests.test_public_key_cannot_read_private_data`, `MsuPortalTests`. | Review roles each quarter (Settings › Team). |
| A02 Cryptographic failures | HTTPS only (nginx, HSTS 6 months). Passwords hashed with Django's PBKDF2. Two-step codes are RFC 6238 TOTP. No secrets in the frontend bundle. | Keep certificates renewing (certbot timer). |
| A03 Injection | Django ORM parameterises every query; no raw SQL. React escapes output. Uploaded files are checked by their first bytes (JPG, PNG, PDF only) and stored under a random name outside the web root. | — |
| A04 Insecure design | Status rules enforced in the model, not the screen. Fee, status, paid and exported_at are never read from the public form. Payments and history are append-only. Duplicate warning reveals a reference only when reg and phone both match. | — |
| A05 Security misconfiguration | Production refuses to start without `SECRET_KEY`; `DEBUG=False`; secure cookies; `X-Frame-Options: DENY`; `nosniff`. Django admin is a separate path. `manage.py check --deploy` passes. | Run `check --deploy` after changing settings. |
| A06 Vulnerable components | Pinned Python requirements. The old SheetJS (xlsx 0.18.5) advisory is gone: Excel is now produced server-side with openpyxl. | Run `pip-audit` and `npm audit` monthly; `npm audit` lists advisories in build-time tooling. |
| A07 Identification and authentication failures | No public sign-up. Two-step sign-in required for admins and staff (`REQUIRE_MFA`). Sign-in is rate-limited (30/hour per address). Sessions end after 12 hours, or 7 days with *Keep me signed in*; the workspace signs out after 30 minutes idle. Logout blacklists the refresh token. Password reset never reveals whether an email exists. | — |
| A08 Software and data integrity failures | Deploys come from the git repository; `deploy.sh` builds on the server. No third-party scripts on public pages apart from Google Fonts. | — |
| A09 Logging and monitoring failures | Request history for every change; audit log for settings, roles, branches, suburbs, drivers, data export/erasure and retention; server and browser errors emailed to ADMINS; `/api/health/` for uptime monitoring. | Set `ADMINS`, `EMAIL_HOST` and the uptime monitor. |
| A10 Server-side request forgery | The server only calls fixed, configured URLs (SMS provider, Cloudflare Turnstile). No user-supplied URL is fetched. | — |

## Public endpoint abuse

* Request submission: 120 per hour per address, honeypot field, optional
  Cloudflare Turnstile (`TURNSTILE_SECRET`).
* Status lookup and lost-reference finder: 10 per 10 minutes per address; the
  11th is refused (`LookupThrottle`).
* Clearance upload: 60 per hour per address, 5 MB, type checked; unclaimed
  uploads are deleted after a day.
* Analytics and error reports: 600 per hour per address; stored without IP.

## Check with the public key

```
for u in requests/ drivers/ team/ audit-log/ notifications/ settings/ handin-lists/ reports/overview/; do
  curl -s -o /dev/null -w "%{http_code} $u\n" https://collectmytranscriptmsu.com/api/$u
done
```

Every line must be 401 or 403.
