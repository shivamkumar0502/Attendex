# Production release status

**Current status: hardened pilot. NOT accepted for unsupervised institutional biometric attendance.**

This document is a release record, not a claim that configuring environment variables makes biometric recognition safe. The application intentionally refuses `DEPLOYMENT_MODE=production` while required voice anti-spoofing and operational acceptance checks remain unimplemented/unvalidated.

## What this release adds

| Area                          | Implemented                                                                                                                                                               | Live dependency / remaining acceptance                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Accounts                      | Hashed one-use verification/recovery tokens, encrypted durable email queue, password reset, all-session revocation                                                        | Configure a transactional SMTP account and test delivery/recovery                                                        |
| Teacher approval              | Exact administrator email allowlist; administrator email must be verified; target teacher must be verified                                                                | Operator must configure its actual account email and enable `REQUIRE_TEACHER_APPROVAL=1`                                 |
| Access isolation              | Class ownership/membership checks; face collections scoped to individual class IDs                                                                                        | This is a single-institution deployment model; delegated multi-institution administration is not implemented             |
| Rate limiting                 | Atomic MongoDB-backed windows across API instances; paid inference endpoints have a stricter per-user limit                                                               | Validate indexes, database behavior and proxy configuration in staging                                                   |
| Activity                      | Redacted activity log, self/admin views, 365-day TTL; group confirmation audit in the same Mongo transaction                                                              | General request activity is best-effort; alert on `AUDIT_WRITE_FAILED`; use external immutable audit storage if required |
| Managed face enrollment       | AWS Rekognition liveness → server reads results → pending class enrollment → teacher approves in person                                                                   | AWS account, IAM role, permitted region, data-processing approvals, costs and real-device tests                          |
| Group photos                  | Server checks permission before reading uploads; JPEG/PNG normalization; detects/crops faces; searches only approved class enrollments; rejects unknown/ambiguous matches | Provider is disabled until AWS is configured; threshold calibration is not complete                                      |
| Attendance review             | Only an explicitly selected proposal subset is saved; transaction + one-use proposal; no inferred absence                                                                 | Validate on a MongoDB replica set (Atlas supports transactions)                                                          |
| Provider deletion             | Revocation immediately excludes templates from matching; deletion is queued and retried                                                                                   | Monitor pending cleanup; reconcile provider orphans after outages                                                        |
| Experimental browser matching | Still available in pilot, explicitly labeled untrusted                                                                                                                    | Disabled by strict production mode; it is not a server identity proof                                                    |
| Voice anti-spoofing           | **Not implemented**                                                                                                                                                       | Select and validate a server-side speaker/liveness provider; browser audio/descriptor checks are insufficient            |
| Backup/restore                | Encrypted logical export and empty-target restore scripts + recovery runbook                                                                                              | Managed snapshot policy and an actual restore drill remain operator tasks                                                |
| Scale                         | Local/staging health-load checker, bounded history, lazy provider UI                                                                                                      | No full-workload capacity claim; real database, enrollment/inference and target-device testing remain outstanding        |

## Configuration

Never put service credentials into frontend variables, Git, issue comments or chat. Configure them in the host's secret/environment settings.

- Existing app: `MONGODB_URI`, `MONGODB_DB`, `APP_ORIGIN`, secure cookies and trusted proxy setting.
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` and a 64-hex `ACCOUNT_MAIL_KEY` (or a key derived from the existing `BIOMETRIC_KEY`). Queue payloads are encrypted; no raw reset/verification token is returned by the API.
- Administrator: `ADMIN_EMAILS` (comma-separated exact app-account emails). The mailbox owner must complete email verification before administrative APIs become available.
- Teacher gate: `REQUIRE_TEACHER_APPROVAL=1`. Existing teachers are not silently grandfathered as approved. Configure and verify an administrator first; approve existing legitimate teachers before enforcing the gate.
- AWS: `AWS_FACE_ENABLED=1`, `AWS_REGION`, `LIVENESS_ROLE_ARN` and server-side AWS credentials/role. Keep `AWS_FACE_ENABLED=0` until the IAM/data-handling setup is reviewed.
- `FACE_COLLECTION_PREFIX` must differ between staging and production. Never point staging at production collections.
- Leave `DEPLOYMENT_MODE=pilot` while release gates are unmet. Setting it to production currently **fails startup intentionally**; do not bypass that guard or hard-code readiness to true.

Recovery requests queue the same encrypted job regardless of account existence; SMTP/account lookups happen in a leased worker after the HTTP response, avoiding account-dependent SMTP response timing. Jobs are deduplicated per address/action/minute, retried with backoff, and expire. Monitor `EMAIL_JOB_FAILED` and the mail queue; a queued request is not proof of delivery.

The runtime environment `NODE_ENV=production` controls framework behavior; it does not mean this product has passed institutional production acceptance.

## Managed face flow

Students need verified emails and class membership. After explicitly consenting to streaming live video to Amazon, the server creates a short-lived provider session and issues temporary credentials restricted to `rekognition:StartFaceLivenessSession`. No long-lived AWS credential reaches the browser. The server consumes the session once and reads liveness results directly from AWS. The returned provider reference image, not a browser descriptor or arbitrary uploaded portrait, is indexed. Enrollment remains pending until an approved, verified teacher confirms the student in person.

Teachers need verified/approved accounts and must own the class. They confirm authorization for the pictured students, upload 1–4 single-frame JPEG/PNG images (up to 5 MB each), and use an active attendance session. The server normalizes/re-encodes photos, limits pixel count and detected faces (20 per image), crops each detected face, and searches the class collection. A candidate must be an approved class enrollment, exceed the provisional similarity threshold and have sufficient separation from the next match. Unknown, low-quality, duplicate and ambiguous faces are not automatically assigned to a student. Nothing is marked absent. The teacher selects candidates and explicitly confirms attendance.

Liveness confidence 95, face similarity 99 and a three-point separation margin are **provisional, uncalibrated** values. Neither a similarity score nor successful liveness proves a particular legal/educational identity. Group photographs can themselves be replayed: the group-photo flow is supervised review, not proof every pictured person is physically present at capture time.

## IAM and data handling

Use separate staging and production AWS identities and collection prefixes. The backend needs only:

- `rekognition:CreateFaceLivenessSession`, `rekognition:GetFaceLivenessSessionResults`, `rekognition:DetectFaces` (these operations may require `Resource: "*"`).
- `rekognition:CreateCollection`, `rekognition:IndexFaces`, `rekognition:SearchFacesByImage`, `rekognition:DeleteFaces` restricted to the intended account/region and collection prefix.
- `sts:AssumeRole` restricted to the dedicated streaming role ARN.

The streaming role trust policy must permit only the backend identity; its permissions must be restricted to `rekognition:StartFaceLivenessSession`. The application further applies that action-only STS session policy for 15-minute credentials. Verify current AWS IAM/region support before deployment; do not grant broad account administrator access.

No application endpoint stores classroom photos or provider reference images. AWS processes the media and stores face templates; assess AWS retention/service-improvement settings, data residency and contracts before real students participate. Do not treat a teacher's checkbox as a complete institutional consent/privacy program, especially for minors. Review applicable requirements with the institution.

## Calibration and spoof testing required

Use consenting participants and an isolated staging environment. Record model/provider version, capture devices, lighting/noise, threshold, sample count and enrollment protocol. Evaluate same/different-person and same/different-speaker trials, false accepts/rejects, low-quality and unknown inputs, look-alikes, duplicate students, printed/displayed photos, prerecorded video, replayed voice and synthesized/cloned voice. Record failure handling and manual appeals. Do not replace failed tests with a configuration flag or invented accuracy number.

A separate server-side voice anti-spoofing implementation and its credential/configuration requirements are still needed. This release does not pretend the existing ECAPA embedding similarity can detect replay or voice cloning.

## Verification completed vs not completed

Automated unit/component tests validate access controls, token replay protections, consent handling, encrypted descriptor storage, candidate/proposal constraints and disabled-provider behavior. Managed-provider tests use mocked responses; they do not validate AWS liveness or face matching. The MongoDB integration suite needs an environment that can run mongod; the local sandbox currently blocks it. Cloud provider/device testing, restore drill, institutional privacy/security review and representative load acceptance have not been completed.

## Activation order

1. Keep current pilot operational; configure SMTP and a verified operator account.
2. Approve legitimate teachers, then enable teacher approval. Check manual attendance still works.
3. Approve provider costs and data handling; configure a separate AWS staging integration and test IAM/liveness/enrollment/deletion end to end.
4. Validate group proposals and transactional confirmation on an isolated Atlas database.
5. Implement and validate trusted voice anti-spoofing; complete biometric calibration and documented manual fallbacks.
6. Complete restore and representative load/device tests, monitoring, alerting and retention procedures.
7. Review release evidence in code review. Only then change the release guard implementation to reflect the actually accepted controls and activate production mode.
