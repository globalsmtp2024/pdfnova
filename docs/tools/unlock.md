# Unlock PDF

Slug `unlock`, category security. Backend `apps/api/app/tools/security/unlock.py`, panel `apps/web/src/components/tools/panels/unlock.tsx`, e2e `apps/web/e2e/unlock.spec.ts`.

## Behaviour

- Owner-restricted files (empty user password, owner password with print/copy/edit limits) open without a password. The output is saved with `encryption=False`, so every restriction is gone.
- Files that need a password to open are unlocked only with the password the user typed into the existing per-file prompt. The password travels through the sealed per-input path (`passwords` on start, `Task.secrets_sealed`), is never in options or logs, and is wiped by the engine when the job runs.
- No password guessing, dictionary attacks, brute force or cracking of any kind. A missing or wrong password fails that file with `password_required`.
- Up to 50 files via `run_each`. A file with a wrong or missing password is listed in `processing-report.txt`; the rest still finish. A single failing file fails the task with `password_required`.
- `decrypt_inputs = False`: the tool opens each original file itself so one bad password does not fail the whole batch in the sandbox pre-step.

## Upload inspection change

`app/files/pdf_safety.inspect_pdf` now reports `encrypted=True` only when the file cannot be opened without a password. Owner-restricted files that open with an empty user password are reported as not encrypted, so upload does not force a password prompt for them (in any tool). The `/files/{id}/inspect` endpoint still reports `encrypted` from `pdf.is_encrypted` plus `permissions`; the Unlock panel uses it to label files as "editing restrictions only" or "not protected".

## UI

- Notice that users should only unlock files they own or have the right to modify.
- Per-file status: needs a password, password entered, editing restrictions only, not protected.

## Tests

- `apps/api/tests/test_unlock_tool.py`: owner-restricted output has full permissions and is unencrypted; correct password keeps text; wrong password raises `password_required` with no output and no password in the message; missing password raises `password_required`; mixed batch with report; API flow asserts sealed secrets, no password in options, error message or logs, and `secrets_sealed` cleared; every PDF passes `assert_qpdf_ok`.
- `apps/web/src/components/tools/panels/unlock.test.ts`: status mapping.
- `apps/web/e2e/unlock.spec.ts`: wrong then correct password, output verified unencrypted through `describePdfProtection`; owner-restricted file runs without a prompt.
