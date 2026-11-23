# Edit metadata (`edit-metadata`)

View and edit document properties, remove all metadata, and strip hidden data.

## Backend
- Module: `apps/api/app/tools/edit/metadata.py` (`EditMetadataTool`, `MetadataOptions`).
- Options:
  - `title`, `author`, `subject`, `keywords`, `creator`, `producer` (max 2000 chars). `null` leaves a field unchanged, `""` deletes it.
  - `creation_date`, `modification_date`: `D:YYYYMMDDHHmmSS` with optional `Z` or `+HH'mm'`; the calendar date and time must exist.
  - `custom`: up to 50 entries, names `^[A-Za-z][A-Za-z0-9_.-]{0,63}$`, standard names rejected, values max 2000 chars, `""` deletes.
  - `remove_all`: deletes the trailer `/Info`, `/Root /Metadata` and every page `/Metadata`; field edits are ignored.
  - `remove_attachments`, `remove_javascript`, `remove_thumbnails`.
- Edits write `/Info` first and then rebuild XMP from it with `load_from_docinfo(delete_missing=True)`, so dc:title, dc:creator, dc:description, pdf:Keywords, xmp:CreatorTool, pdf:Producer and the dates stay consistent. Unparseable XMP is replaced.
- Hidden data (`apps/api/app/files/hidden_data.py`, shared with inspection):
  - attachments: `/Names /EmbeddedFiles`, `/AF`, `/Collection`, `/FileAttachment` annotations;
  - JavaScript: `/Names /JavaScript`, JavaScript `/OpenAction`, JavaScript entries in `/AA` of the catalog, pages, annotations and form fields, JavaScript annotation `/A` actions (including `/Next` chains);
  - thumbnails: page `/Thumb`.
- Metadata values and filenames are never logged.

## Inspection
`POST /api/v1/files/{id}/inspect` now includes `metadata` (`apps/api/app/files/metadata.py`): the eight standard fields, `custom`, `has_info`, `has_xmp`, `pages_with_xmp` and `hidden` counts. The panel uses it for the "before" column and the counts shown next to each hidden-data option.

## Frontend
- Panel: `apps/web/src/components/tools/panels/metadata.tsx`, messages namespace `tool_metadata`.
- Main area shows a before/after table; the payload sends only changed fields so batches keep each file's other properties. The summary line lists what will be removed with counts.

## Tests
- `apps/api/tests/test_edit_metadata_tool.py`: Info/XMP consistency, clearing fields, remove all, hidden-data stripping on `make_attachment_pdf` plus extra JavaScript/thumbnail/page XMP, date and key validation, length limits, encrypted input, batch, inspection fields. Every output passes `qpdf --check`.
- `apps/web/e2e/metadata.spec.ts`: set title and author, and remove all metadata, verified with Python.
