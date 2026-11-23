# Merge PDF

Slug `merge`, category organize. Live since Phase 1, upgraded in Phase 2.

## Backend (`apps/api/app/tools/organize/merge.py`)

Options (`MergeOptions`):

| Field | Default | Meaning |
| --- | --- | --- |
| `files` | `[]` | One entry per input: `pages` (range expression), `rotate` (0/90/180/270), `bookmark_title`. |
| `pages` | `null` | Page mode. Ordered list of `OrganizeOperation` (`source` file/blank, `file` index, `page` 1-based, `rotate`). When set, per-file `pages`/`rotate` are ignored; `bookmark_title` is still used. |
| `add_bookmarks` | `true` | One top-level bookmark per file, pointing at that file's first page in the output. |
| `keep_existing_bookmarks` | `true` | Copy each file's outline, remapped to the pages that were kept. Nested under the file bookmark when `add_bookmarks` is on, flat otherwise. |
| `form_fields` | `preserve` | `preserve` keeps AcroForm fields whose widgets are on included pages, merges `/DR` resources and renames clashing top-level names by prefixing the file number (`2_name`). `discard` removes Widget annotations and the AcroForm. |
| `output_name` | `merged.pdf` | Output file name; `.pdf` is appended when missing. |

Behaviour:

- Everything is assembled in a single pass over one `pikepdf` document. Top-level file bookmarks are ordered by where each file first appears in the output.
- `allow_encrypted_pdf=True`. Encrypted inputs are unlocked with the per-task password (sandbox decrypts before `run`; `open_pdf` also accepts `InputFile.password`). The output is never encrypted.
- Validation: per-file settings must match the input count; page-mode entries must reference uploaded files and existing pages; `pages` cannot be an empty list.

Tests: `apps/api/tests/test_merge_tool.py` (ordering, ranges, rotation, page mode across files, bookmark modes, forms preserve/discard, encrypted + plain inputs, wrong password, sandbox). Every output passes `assert_qpdf_ok`.

## Frontend

- Panel: `apps/web/src/components/tools/panels/merge.tsx` (`useMergePanel`), registered in `panels/registry.ts`. Pure state, payload and size estimate live in `panels/merge-state.ts` with unit tests.
- Modes: whole files (file-level drag reorder plus per-file range and rotation controls rendered on each file card through `ToolPanelView.renderFileExtras`) or page by page (reuses `OrganizeEditor`/`useOrganizeState`: reorder across files, rotate, delete, duplicate, blank pages, undo/redo).
- Bookmarks: one radio group with four outcomes (one per file with originals nested, one per file only, originals only, none).
- Form fields: keep fillable or remove.
- Summary shows the page count and "about X" size, estimated from each file's size in proportion to the pages selected.
- File cards show a lazy first-page thumbnail from `/api/v1/files/{id}/pages/1/thumbnail` once the upload is ready and not encrypted (local preview before that).
- Strings: namespace `tool_merge` in `messages/en.json` and `messages/ur.json`; existing `toolPage` merge keys are reused for presets and per-file controls.

## End-to-end

`apps/web/e2e/merge-upgrade.spec.ts`: page mode moving a page of file 2 to the front and deleting a page; encrypted plus plain input through the password prompt. The original merge flow in `site.spec.ts` and the merge-to-rotate chain in `page-tools.spec.ts` still cover file mode.
