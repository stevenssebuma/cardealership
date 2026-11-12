# Documentation index

Two kinds of document live here. Read the right one for the question you have.

- **Normative** — describes how the system behaves *today*. If it disagrees with the code, the
  document is a bug.
- **Historical** — a dated snapshot of what a sprint delivered and how it was validated. Numbers
  and route lists are the record of that sprint, not the current contract. Each carries the banner
  *"Snapshot of this sprint"*.

## Canonical booking contract

The single source of truth for the test-drive booking API is
[sprint6/sprint6-validation-report.md](sprint6/sprint6-validation-report.md), section
**"Task 3 - Booking security contract"**. It covers token-scoped identity, owner-or-admin history
and cancellation, the public availability lookup, and the account-pinned confirmation email.

Anything elsewhere that describes a `user_id` taken from a request body, an unauthenticated
booking write, or a per-customer history that hides cancelled bookings is out of date — cite
the sprint 6 contract instead.

## Normative documents

| Document | Covers |
| --- | --- |
| [sprint6/sprint6-validation-report.md](sprint6/sprint6-validation-report.md) | Email pipeline, booking security contract, integration suite |
| [sprint10/API_TESTING_GUIDE.md](sprint10/API_TESTING_GUIDE.md) | Manual API smoke path, legacy vs persisted booking endpoints |
| [sprint8/sprint8-contract-register.md](sprint8/sprint8-contract-register.md) | Confirmed contracts and prohibited assumptions |
| [sprint8/sprint8-dependency-register.md](sprint8/sprint8-dependency-register.md) | Open dependencies by area |
| [sprint7/chat-contract.md](sprint7/chat-contract.md) | Provisional admin chat frontend contract |
| [sprint9/bulk-image-upload-integration-handoff.md](sprint9/bulk-image-upload-integration-handoff.md) | Bulk image upload contract (supersedes `bulk-image-upload-api-contract.md`) |

## Historical documents (dated snapshots)

| Sprint | Documents |
| --- | --- |
| 6 | `sprint6/sprint6-validation-report.md` (also normative — see above) |
| 7 | `sprint7-validation-report.md`, `admin-chat-baseline.md`, `admin-chat-ui-validation.md`, `admin-chat-security` items in `chat-security-review.md`, `admin-chat-deployment-handoff.md`, `admin-chat-rollback-plan.md`, `live-inquiry-drill.md` |
| 8 | `sprint8-validation-report.md`, `sprint8-ui-validation.md`, `sprint8-security-review.md`, `sprint8-pr-summary.md`, `sprint8-rollback-plan.md`, `sprint8-deployment-handoff.md`, `listing-wizard-integration-walkthrough.md`, `dispatch-integration-walkthrough.md` |
| 9 | `sprint9-validation-report.md`, `sprint9-pr-summary.md`, `sprint9-security-review.md`, `sprint9-rollback-plan.md`, `sprint9-deployment-handoff.md`, `sprint9-development-timeline.md`, `exchange-rate-integration-handoff.md` |
| 10 | `BUILD_AND_TEST_REPORT.md`, `INTEGRATION_REVIEW_REPORT.md`, `FINAL_SPRINT10_REPORT.md`, `PULL_REQUEST_CHECKLIST.md`, `REPOSITORY_QUALITY_AUDIT.md`, `SETUP_RUNTIME_AUDIT.md`, `EDWIN_SPRINT10_DEVELOPMENT_TIMELINE.md` |

## Current verification commands

```text
cd backend && npm test                       # 6 suites / 62 tests (booking, admin customers, auth, transactions)
npm run typecheck                            # tsc -p tsconfig.check.json, exits 0 (no errors)
npm run build                                # production bundle
npm run test:booking-history                 # customer history + cancel service
npm run test:admin-customers                 # admin directory + per-customer history service
npm run test:test-drive-booking              # booking client contract
```
