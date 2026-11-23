# Protect PDF

Slug `protect`, backend `apps/api/app/tools/security/protect.py`, panel `apps/web/src/components/tools/panels/protect.tsx`.

## Behaviour
- Encrypts each input with AES-256 (R6) through pikepdf `Encryption(user=, owner=, R=6, allow=Permissions(...))`.
- Open (user) password is required. Owner password is optional; when absent a random `secrets.token_urlsafe(32)` owner password is generated in the sandbox and discarded.
- Permission options (`allow_print`, `allow_print_high_quality`, `allow_copy`, `allow_modify`, `allow_annotate`, `allow_fill_forms`, `allow_assemble`). High-quality print requires print. Accessibility is always allowed: qpdf and PDF 2.0 ignore that bit for R3+, so offering a toggle would be fake.
- Batch: up to 100 files with the same password via `run_each`.
- Every output is verified in the tool: opening without a password must raise `PasswordError`, opening with the password must succeed.
- Already-encrypted inputs are accepted only after the user unlocks them with the existing password prompt; they are decrypted by the sandbox and re-encrypted with the new password.
- Passwords are limited to 127 UTF-8 bytes (AES-256 limit).

## Job secrets
Passwords never travel in `options`. The generic job-secrets path:
1. `StartTaskRequest.secrets` (max 8 keys, names `^[a-z][a-z0-9_]*$` up to 64 chars, values up to 512 chars, `repr=False`).
2. `TaskService.start` rejects names the tool does not list in `Tool.accepted_secrets`, requires `Tool.required_secrets`, and seals them with the per-file passwords into `tasks.secrets_sealed` (`seal_secrets`, AES-GCM with the storage key).
3. `JobEngine.execute` opens the sealed blob, sets `secrets_sealed = NULL` and commits before running, then passes the values through `SandboxRequest.secrets` (excluded from repr) into `JobContext.secrets` (excluded from repr). The sandbox clears the request copy once the context exists and calls `ctx.forget_secrets()` after `run`; the engine clears its copies when the job ends.
4. A retry after an infrastructure error has no secrets left and fails with `secret_missing` ("Start the task again").

## Tests
- `apps/api/tests/test_protect_tool.py`: permissions, owner password, random owner, batch, re-encryption, wrong input password, missing secret, overlong password, repr hiding, API flow (no password in DB options, `secrets_sealed` NULL after run, nothing in logs or responses), validation of missing and unknown secrets.
- `apps/web/src/lib/password-strength.test.ts`: strength meter and generator.
- `apps/web/e2e/protect.spec.ts`: protect with copy blocked and re-protect an encrypted upload, both checked with pikepdf.
