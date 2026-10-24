# Operator acceptance record

Status: NOT RUN. Configuration and automated tests do not substitute for acceptance evidence.

Record the deployed commit, staging origin, tester, UTC timestamp, outcome and a restricted evidence reference for each check. Never include passwords, tokens, raw camera/audio recordings or student identifiers in a public report.

## Email activation

The running server checks SMTP TLS/authentication at startup and every five minutes without sending a message. Account & Security displays the latest result; Refresh status retrieves it. `SMTP_CONNECTION_OK` means a handshake passed, not inbox delivery or sender-domain approval. Failures log only `SMTP_CONNECTION_FAILED`, without credentials or provider error payloads. Outgoing messages rejected by SMTP are retried by the existing mail worker.

1. Verify the sender domain with the chosen SMTP provider, including its required SPF/DKIM and DMARC configuration.
2. Set SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASSWORD, MAIL_FROM and APP_ORIGIN in the hosting secret settings. Preserve the existing encryption key. Do not commit a populated environment file.
3. Run `node --env-file=.env.private scripts/check-mail.mjs`. This verifies TLS/authentication, not inbox delivery.
4. To send one test to an operator-owned inbox, set MAIL_TEST_TO and MAIL_TEST_CONFIRM=SEND_TEST_EMAIL in that private environment. Re-run and confirm inbox/spam delivery.
5. With operator test accounts, complete verification and recovery, reject reused/expired tokens, and confirm old sessions stop working after reset. Test retries after a temporary provider outage.

## Browser/device acceptance

| Platform | Required checks | Result |
| --- | --- | --- |
| iPhone Safari | Login, class join, permission refusal/retry, manual attendance, CSV, narrow layout | NOT RUN |
| Android Chrome | Same checks, front/rear camera device test, weak network recovery | NOT RUN |
| iPad Safari | Portrait/landscape, keyboard, permission refusal, teacher roster/review | NOT RUN |
| Desktop Chrome/Firefox | Teacher approval, class isolation, session expiry, accessible keyboard navigation | NOT RUN |

Use synthetic accounts and supervised consenting adult testers. Device/media tests do not establish biometric accuracy or identity. Keep manual attendance available.

## Restore and load acceptance

Follow RECOVERY.md using an isolated empty database and synthetic data first. Record export time, restore duration, source/target collection counts, index recreation, login, class membership and attendance-history checks. Compare restored records, not just counts. Reject modified archives and wrong keys. Never restore into the live database.

For workload testing, agree an expected concurrent-user count and latency/error budget before running. Record staging instance size, Mongo tier, dataset size, duration, p50/p95/p99, errors and rate-limit behavior. Cover login, class joins, manual check-ins, teacher review and history export. The existing health-only load script cannot certify these workflows.

Release remains blocked until an operator signs the actual evidence. Real-user biometric calibration and voice anti-spoofing acceptance are not provided by this record.
