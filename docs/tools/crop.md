# Crop PDF

Slug `crop`, category `edit`. Backend `apps/api/app/tools/edit/crop.py` with pure geometry in `crop_math.py`; frontend panel `apps/web/src/components/tools/panels/crop.tsx` with the mirrored geometry in `apps/web/src/lib/crop-math.ts`.

## Options

| Option | Type | Meaning |
| --- | --- | --- |
| `mode` | `visual` \| `permanent` | See below. Default `visual`. |
| `margins` | `{top,right,bottom,left}` in points, each 0 to 14400 | Amount to trim from each edge as the page is displayed (after `/Rotate`). |
| `auto` | bool | Ignore `margins` and trim each page to its rendered content. |
| `padding` | points, 0 to 144 | Space kept around detected content when `auto` is on. Default 6. |
| `pages` | page expression or null | `null` is every page; otherwise `3`, `1-4, 9-end`, `odd`, `even`, `!2`. |

Without `auto`, at least one margin must be above zero. Up to 50 PDFs per job; each file is cropped with the same options and the outputs are zipped.

## Geometry

The visible page area is the CropBox intersected with the MediaBox, with any origin (for example `[100 200 500 800]`). Margins are given in display orientation and mapped to unrotated PDF sides:

| `/Rotate` | PDF left | PDF bottom | PDF right | PDF top |
| --- | --- | --- | --- | --- |
| 0 | left | bottom | right | top |
| 90 | top | left | bottom | right |
| 180 | right | top | left | bottom |
| 270 | bottom | right | top | left |

A crop narrower or shorter than 1 pt is rejected with "The crop area is empty on page N". Negative margins are rejected by option validation. The web panel converts mm, inches and % (of the current page's width for left/right and height for top/bottom) to points before sending.

## Modes, exactly

- **Visual**: only `/CropBox` is written. MediaBox, other boxes, content streams and annotations are untouched, so resetting the CropBox restores the page.
- **Permanent**: `/MediaBox`, `/CropBox`, `/TrimBox`, `/BleedBox` and `/ArtBox` are all set to the crop rectangle. The page content is wrapped as `q x y w h re W n … Q`, so anything outside is clipped when drawn. Clipped text, images and vector objects are **not deleted**; they remain in the content stream and text extraction can still find them. Annotations whose `/Rect` lies entirely outside the crop are removed from `/Annots`, together with Popup annotations whose parent was removed. Form field widgets are always kept so the AcroForm stays consistent.

## Remove margins (`auto`)

Inside the job sandbox each selected page is rendered with pypdfium2 at 36 dpi (scale 0.5), converted to greyscale, and pixels darker than 240 count as content. The bounding box of content is converted to display-space margins (minus `padding`) and then cropped with the same mapping as manual margins, so rotation and box origins are handled the same way. Pages with no content are left unchanged. There is no separate content-bounds endpoint: the preview shows a note instead of a rectangle while this preset is active.

## Tests

- `apps/api/tests/test_crop_tool.py`: rotation mapping and round trips (Hypothesis), crop math with origin offsets, units, crop all/one/range/even, rotated 90 and 270 pages rendered and checked by colour, offset MediaBox origin, visual vs permanent differences (boxes, content streams, annotations, text still present), auto bounds on a wide-margin fixture (plain and rotated), invalid boxes, batch with an encrypted file. Every output passes `qpdf --check`.
- `apps/web/src/lib/crop-math.test.ts`: the same mapping table, crop box math, units, rect moves/resizes, aspect lock and paper presets.
- `apps/web/e2e/crop.spec.ts`: upload, drag a handle, nudge a handle with the keyboard, type margins in pt, run in visual mode and read the output CropBox and MediaBox with pikepdf through `readPageBoxes`.
