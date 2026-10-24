# Export, recovery and incident operations

## Backups

For institutional use, prefer managed MongoDB Atlas snapshots/point-in-time recovery with an agreed retention, recovery-point objective and recovery-time objective. They are not configured by this repository. Test recovery on an isolated staging database and record the result. A live pilot on free hosting is not an availability SLA.

The repository includes an encrypted **logical export utility**, useful during a maintenance window or for migration. It is not a consistent point-in-time snapshot while concurrent writes occur.

```sh
# Set MONGODB_URI, explicit MONGODB_DB and a separate random 64-hex BACKUP_KEY
# in a private environment file. Use a private backup directory.
node --env-file-if-exists=.env scripts/backup.mjs export /private/backups/attendex.adx
```

The archive is gzip-compressed then AES-256-GCM encrypted. Existing output files are never overwritten. Keep the export key separately from the archive and separately from `BIOMETRIC_KEY`. Store exports in encrypted, access-controlled durable storage; this script does not upload or schedule backups.

## Restore drill

Select a NEW isolated database using a separate environment file. Do not use the production URI/database for testing. Disable `AWS_FACE_ENABLED` in restored staging and use a separate AWS account/prefix if later enabling provider tests.

```sh
RESTORE_CONFIRM=RESTORE_EMPTY_DATABASE node --env-file-if-exists=.env.restore scripts/backup.mjs restore /private/backups/attendex.adx
```

Restore refuses a non-empty database and authenticates/decompresses the archive into a temporary private file before inserting data. If import later fails, it may leave a partial **isolated target**; do not promote it, and review/discard it manually. This utility does not drop databases or overwrite existing records. Start the application against the isolated target to recreate indexes, then verify counts, login and attendance history.

Sessions, recovery tokens, encrypted outgoing mail jobs, rate counters, liveness sessions, pending proposals and managed provider face enrollments are not restored. Users must sign in again; managed face enrollment requires a new consented live capture. Encrypted pilot descriptors in user records still require the original `BIOMETRIC_KEY`; do not expose that key in logs or export metadata.

## Monitoring and incidents

- Monitor `/api/health`, request failures, latency, Mongo pool/CPU/storage, SMTP failures, `EMAIL_JOB_FAILED`, mail queue age/backlog, `AUDIT_WRITE_FAILED`, provider errors and pending deletion jobs.
- General activity logging is best-effort. If immutable/compliance-grade logs are required, integrate an external append-only/WORM destination and verify delivery.
- On suspected account compromise, revoke all sessions, use the password recovery flow and review account activity.
- On biometric/provider incident, disable AWS face analysis and keep manual attendance available. Preserve the minimum necessary incident evidence with restricted access; do not dump raw media or credentials into logs.
- Template revocation excludes a face from matching immediately. The background cleanup loop retries provider deletion every two minutes while the app is running; monitor the queue. Free-service sleep/suspension delays retries. Reconcile orphan templates after database/provider outages using authorized operational tooling.
- Rotate keys with a planned migration/re-enrollment procedure. Do not overwrite `BIOMETRIC_KEY` casually: existing encrypted templates become unreadable.

## Load and device testing

```sh
LOAD_CONCURRENCY=10 LOAD_SECONDS=10 node scripts/load-check.mjs http://127.0.0.1:8000
```

Remote runs require `ALLOW_REMOTE_LOAD_CHECK=yes` and explicit authorization for the **staging** host. Never point load tests at a third-party or production host by accident. This utility checks only readiness-request behavior, not full authenticated workloads or biometric throughput. Record full login, enrollment, joins, teacher review, CSV, large-roster/history and provider-quota behavior separately. Test target mobile/tablet browsers with real cameras/microphones and weak networks before approving an institutional rollout.
