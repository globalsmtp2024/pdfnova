# Compress PDF (`compress`)

Backend: `apps/api/app/tools/optimize/compress.py`. Panel: `apps/web/src/components/tools/panels/compress.tsx`. Tests: `apps/api/tests/test_compress_tool.py`, `apps/web/e2e/compress.spec.ts`.

## Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `level` | `low` \| `recommended` \| `extreme` \| `custom` | `recommended` | Strength preset. |
| `target_kb` | int, 1 to 4 194 304 | none | Required for `custom`: desired file size in KB (the panel accepts KB or MB). |
| `grayscale` | bool | `false` | Convert raster images to DeviceGray. Text and vector graphics keep their colours. |
| `strip_metadata` | bool | `false` | Remove the XMP metadata stream and the document information dictionary. |

Batch: 1 to 50 PDFs per task, processed with `run_each`; a failing file is listed in `processing-report.txt` while the others finish. Password-protected inputs are accepted once unlocked by the password prompt; the output is not encrypted.

## Presets

| Level | Target image resolution | JPEG quality | Fallback longest edge | Re-encode existing JPEGs without resizing |
| --- | --- | --- | --- | --- |
| low | 220 ppi | 85 | 3000 px | no |
| recommended | 150 ppi | 72 | 2000 px | yes |
| extreme | 96 ppi | 50 | 1300 px | yes |

`custom` walks an eight-step ladder from 220 ppi / q85 down to 48 ppi / q22 and binary-searches for the gentlest step that fits under the target. If even the strongest step is too large, the smallest result is returned and the result page says the target could not be reached.

## Pipeline

1. Remove page thumbnails (`/Thumb`) and `/PieceInfo` private data; optionally metadata.
2. Find where each image is drawn by walking page content streams (`q`, `Q`, `cm`, `Do`) through nested form XObjects (depth limit 12) and record the largest placed size in inches. The effective resolution is `pixels / inches`; images are resampled (Lanczos) only when they exceed the target by more than 15 %. Images not drawn from page content (annotations, patterns) are capped by the fallback longest edge instead.
3. Re-encode eligible images: 8-bit DeviceGray, DeviceRGB, DeviceCMYK or ICCBased (1, 3 or 4 components), without `/Decode`, colour-key `/Mask` arrays or `/SMaskInData`. Photographic content becomes JPEG; images with 256 colours or fewer stay lossless (Flate). ICC profiles are kept unless grayscale is chosen. CMYK JPEGs are written with an inverted `/Decode` array to match the Adobe CMYK convention Pillow writes.
4. Never touched: JBIG2, CCITT, JPEG 2000, 1-bit and 16-bit images, image masks, and soft masks. `/SMask` and stencil `/Mask` streams stay attached to the re-encoded image, so transparency is never flattened.
5. A replacement is kept only when it is smaller than the stored stream; re-encoding an existing JPEG at the same size must save at least 15 %.
6. Identical image streams and font programs (`/FontFile`, `/FontFile2`, `/FontFile3`) are deduplicated by content hash plus dictionary, and every reference is relinked.
7. Save with qpdf via pikepdf: object streams, compressed xref, Flate level 9 with all Flate/LZW streams recompressed. Unreferenced objects are dropped automatically.
8. If the result is not smaller than the input, the original bytes are returned unchanged and the result page reports "Already optimized".

## Result page

`CompressResult` (rendered from `result-panel.tsx` for this tool) shows the percentage saved, before and after sizes from the task's `input_bytes`/`output_bytes`, an honest message when a custom target was missed, and a side-by-side first-page thumbnail of the input and the output using the existing `/api/v1/files/{id}/pages/1/thumbnail` endpoint (single-file tasks only).

## Limits

Images above 80 megapixels are left untouched. Vector content, fonts (other than deduplication) and inline images are not changed.
