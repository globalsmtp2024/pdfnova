# Flatten PDF (`flatten`)

Burns form fields, comments/annotations and stamps into page content so they can no longer be edited.

## Backend
- Module: `apps/api/app/tools/optimize/flatten.py` (`FlattenTool`, `flatten_document`).
- Options: `forms`, `annotations`, `stamps` (at least one required), `keep_links`.
- Batch: up to 100 PDFs through `run_each`; encrypted inputs are opened with the supplied password and written unencrypted.
- How it works (pikepdf / QPDF only):
  1. When forms are selected, `Pdf.generate_appearance_streams()` creates missing field appearances.
  2. Each page's `/Annots` is partitioned: selected groups are flattened, unselected groups and kept links are held aside. Popups follow their parent annotation's group.
  3. `Pdf.flatten_annotations("all")` draws the appearances into the page content.
  4. Held annotations are restored. Leftover widgets (forms selected) and leftover popups of flattened groups are dropped; other annotations that had no appearance stay untouched.
  5. QPDF removes `/AcroForm` during flattening; it is removed explicitly when forms are flattened and restored when they are not.
- Malformed `/Annots` (non-array, non-dictionary entries) are discarded.

## Frontend
- Panel: `apps/web/src/components/tools/panels/flatten.tsx` (checkbox per group plus "Keep links clickable"), messages namespace `tool_flatten`.

## Tests
- `apps/api/tests/test_flatten_tool.py`: form fixture (no `/AcroForm`, no widgets, value in extracted text and ink in the field area), FreeText/Square/Stamp fixture with a link, link removal, stamps-only, forms kept, batch, encrypted input, hostile annotation arrays, validation. Every output passes `qpdf --check`.
- `apps/web/e2e/flatten.spec.ts`: uploads a reportlab form, flattens and verifies via Python that no fields or widgets remain.
