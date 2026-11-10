# Data protection pack

Prepared for review against Zimbabwe's Cyber and Data Protection Act
[Chapter 12:07]. **This is not legal advice.** Have the privacy notice, terms
and the agreement below checked by someone qualified before relying on them.

## Personal data held

| Data | Why | Who sees it | Kept |
| --- | --- | --- | --- |
| Name, reg number, programme, year | Find the record at MSU | Team; MSU staff (portal) | Indefinitely, for records and reports |
| Mobile number, email | Updates; driver contact | Team; the assigned driver (waybill, label) | Until the retention period after closing, then removed |
| Street address, directions | Harare delivery | Team; the assigned driver | Until the retention period after closing, then removed |
| Zimpost branch | Delivery | Team | Indefinitely |
| Clearance ticks and uploaded proof | Avoid wasted trips to MSU | Team; MSU staff | Files removed with the contact details |
| Payments | Accounting, cash reconciliation | Team | Indefinitely |
| Request history | Accountability | Team | Contact details inside it are removed with the request's |
| Consent time and terms version | Proof of consent | Team | Indefinitely |
| Anonymous usage counts | Improve the form | Team (totals only) | Indefinitely; contain no personal data |

## Retention

Settings › Data protection holds the period (12 months assumed). The daily job
`apply_retention` anonymises requests that are Collected or Rejected and whose
last change is older than that: street address, directions, phone and email
are removed from the request and its history, and clearance files are
deleted. Each run is written to the audit log with the number changed.

## Graduates' rights

* **Access / portability**: Settings › Data protection › *Export their data*
  produces a JSON file of every request, its history and payments for one
  registration number.
* **Erasure**: *Erase their contact details* anonymises every request for that
  registration number at once. Both actions are audit-logged.
* **Correction**: edit delivery or contact details on the request (before
  dispatch), or ask a developer for other fields.
* Respond within 14 days; record the request and the action taken.

## Security measures

See `security-review.md`. In short: HTTPS, role-based access, two-step
sign-in, idle sign-out, private file storage, rate-limited public lookups,
append-only history, audit log, nightly backups with an off-site copy.

## Data processing agreement (template for MSU)

> **Data Processing Agreement** between Midlands State University ("MSU") and
> Sofala Digital ("the Operator"), for the MSU Transcript Collection Solution.
>
> 1. **Roles.** For graduates' requests made through the service, the Operator
>    determines the purposes and means and is the data controller. Where MSU
>    staff use the MSU portal, MSU accesses data for its own purpose of
>    releasing academic documents and is a controller for that use.
> 2. **Purpose.** Data is used only to submit graduates' requests to MSU,
>    collect released documents, deliver them, take payment and report on the
>    service to MSU.
> 3. **Data shared with MSU.** Name, registration number, programme, year,
>    documents requested, clearance confirmation and proof. Not phone numbers,
>    emails or addresses.
> 4. **Security.** The Operator keeps the measures in the Security Review in
>    place and tells MSU of any breach affecting MSU's graduates within 72
>    hours of becoming aware of it.
> 5. **Staff.** Access is limited to named accounts with two-step sign-in. MSU
>    staff accounts are created only on MSU's written request and removed when
>    a person leaves.
> 6. **Retention.** As set out in this pack; changes are agreed in writing.
> 7. **Sub-processors.** Hosting provider, SMS provider and email provider, as
>    listed in writing to MSU. The Operator tells MSU before adding another.
> 8. **Rights requests.** Each party passes the other any request it receives
>    that concerns the other's processing, within 5 working days.
> 9. **Audit.** MSU may review this pack, the audit log extract and the
>    security review once a year on reasonable notice.
> 10. **End.** On termination the Operator returns MSU-related reports and
>     deletes MSU staff accounts within 30 days.
>
> Signed for MSU: ____________________ Date: __________
>
> Signed for Sofala Digital: ____________________ Date: __________
