import sharp from "sharp";

// ─────────────────────────────────────────────────────────────────────────
// OCR image preprocessing
//
// Tesseract reads the rendered page image. Raw scans are often noisy,
// uneven in contrast, and slightly soft — Tesseract still recognises most
// characters, but the marginal ones get worse. A short preprocessing
// pipeline before the recognise call moves those marginal cases off the
// failure boundary.
//
// The pipeline:
//   1. Greyscale       — text is monochrome; the colour channels just add
//                        noise.
//   2. Normalise       — stretch contrast to fill 0–255. Faint scans become
//                        cleanly readable.
//   3. Median(1)       — a 3×3 median filter, the standard cure for
//                        salt-and-pepper speckle that survives compression.
//   4. Sharpen         — restore edge crispness lost to JPEG/scan softness.
//
// Deskew is *not* included here. It needs angle detection that sharp does
// not provide; adding it well requires a projection-profile or Hough pass
// that is out of scope for this step. Norwegian filings are typically
// straight, and the loop's reconstruction branch handles modest skew via
// geometry-first reassembly.
//
// Binarisation (a hard black/white threshold) is also deliberately omitted.
// Tesseract recognises antialiased greyscale better than naive binarised
// text — pure-binary pipelines can clip thin strokes on diacritics.
// ─────────────────────────────────────────────────────────────────────────

export const OCR_PREPROCESSING_PIPELINE_VERSION =
  "greyscale_normalise_median1_sharpen_v1";

/**
 * Runs the OCR preprocessing pipeline on a PNG/JPEG image buffer. Returns a
 * PNG buffer. Throws if sharp cannot decode the input.
 */
export async function preprocessOcrImage(
  input: Buffer,
  options?: { invert?: boolean; rotationDegrees?: 0 | 90 | 180 | 270 },
): Promise<Buffer> {
  let pipeline = sharp(input)
    .greyscale()
    .normalise();

  if (options?.rotationDegrees !== undefined && options.rotationDegrees !== 0) {
    pipeline = pipeline.rotate(options.rotationDegrees);
  }

  if (options?.invert) {
    pipeline = pipeline.negate({ alpha: false });
  }

  return pipeline
    .median(1)
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();
}
