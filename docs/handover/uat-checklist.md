# UAT checklist (Stages 0 to 10)

Run on staging. Tick each line as it passes; record failures with the
reference used. Sign at the end.

## Graduate site (phone, 360 px wide)

- [ ] Home page: no sideways scroll; prices match Settings; every question opens and closes by tap and by keyboard (B8.1)
- [ ] Change the Harare price in Settings: the home page and a new request show it; an older request keeps its fee (B4.3)
- [ ] Request flow: finish on a phone without zooming; refresh on step 3 keeps every answer; Change opens the right step and returns to the check step; Submit stays blocked until consent is ticked (B8.2, B5.5)
- [ ] "0771 234 567" is saved as +263771234567; "12345" is refused (B5.3)
- [ ] Upload a PNG on step 2; a .txt is refused; the file cannot be opened without signing in (B5.6)
- [ ] 2 transcripts + 1 certificate: fee is still one price (B5.7)
- [ ] Second request with the same reg number shows the warning and the existing reference (B5.4)
- [ ] Confirmation: copy, download PDF and Save to WhatsApp work on Android and iPhone; Track this request opens tracking with the reference filled in (B8.3, B5.1)
- [ ] Lost reference: reg + matching phone returns the reference; wrong phone returns nothing (B5.1)
- [ ] Tracking shows the right chip, card and "Now" text at all six stages; driver card only for Harare while Dispatched; rejected shows the reason and stops (B8.4, B3.4)
- [ ] 11th lookup within 10 minutes from one address is refused (B11.1)
- [ ] Privacy and Terms are linked from every public page (B5.5)
- [ ] A WhatsApp share of the home page shows the branded image and title (B6.4)
- [ ] Lighthouse mobile performance and accessibility ≥ 90 on home, request and status; axe shows no serious issues (B7.2)

## Operations workspace

- [ ] /auth has no sign-up; a non-team account sees No access (B1.3)
- [ ] Two-step sign-in is required and works; Reset works from Team (B11.1)
- [ ] Idle for 30 minutes signs you out (B11.1)
- [ ] Ctrl K opens search anywhere; last 4 digits of a phone finds the request; scanning a label opens it (B9.1, B9.8)
- [ ] Sidebar counts match the lists they open (B9.1)
- [ ] Tab counts match the filtered list; days-in-stage colours follow Settings; a saved view reopens with the same filters (B9.3)
- [ ] Bulk move offers only allowed moves and reports skipped ones (B2.1)
- [ ] Moving 12 requests to Submitted to MSU creates one hand-in list of 12; its PDF prints on A4 (B9.4)
- [ ] Unverified clearance cannot move to Submitted to MSU without a note (B5.6)
- [ ] Detail page: every card shows the opened request; notes never appear on tracking; Previous/Next follow the list (B9.5)
- [ ] Record US$15 on a US$15 request: Paid, with receiver and receipt; reverse it with a reason (B4.1)
- [ ] Batch of 5 collected Harare requests with a Free driver; a driver marked Off today cannot be picked (B3.2, B9.6)
- [ ] Waybill and labels: 6 labels numbered 1/6–6/6 in waybill order; cash box correct; barcode reads on a phone; prints legibly on the thermal printer (B3.3, B9.8)
- [ ] Close batch disabled until every request has a result; 5 delivered US$15 → US$75 expected; a short hand-in needs a note and shows in the cash report; each delivered request ends Paid by the driver (B4.2)
- [ ] Zimpost: dispatch several with one date and a tracking number; tracking shows branch, date and number (B3.5)
- [ ] Staff can dispatch and record payments but cannot open Settings or delete (B6.1)
- [ ] New request for a walk-in graduate records the channel and the staff member (B9.2)
- [ ] A suburb added in Settings appears in the request form; Other suburbs can be mapped (B9.7)
- [ ] Changing a price writes one audit entry with old and new values (B9.7)
- [ ] Send update opens WhatsApp with the right message; with SMS configured, a stage change sends one SMS and failures show in Reports › Messages (B5.2)
- [ ] Overview counts match the list; stuck list links to each request (B6.2)

## MSU portal

- [ ] With the switch off, an MSU account cannot sign in (B10.1)
- [ ] With it on, MSU sees only the portal and no phones or addresses (B10.1)
- [ ] Ready for collection shows "Ready at MSU" to the team; the graduate's stage is unchanged (B10.2)
- [ ] Reject needs a reason; the graduate sees it; history names the MSU user (B10.2)
- [ ] Marking 9 ready requests collected moves all 9, one history entry each; pick-up list prints on A4 (B10.3)
- [ ] Monthly report totals match the list for that month; Excel and PDF open cleanly (B10.4)

## Operations

- [ ] Restore last night's backup into staging end to end (B11.3)
- [ ] Taking staging offline triggers an alert (B11.3)
- [ ] A forced browser error on staging emails the team within 5 minutes (B7.3)
- [ ] Retention dry run lists the expected requests (B11.2)

Signed off by: ____________________ Role: __________ Date: __________
