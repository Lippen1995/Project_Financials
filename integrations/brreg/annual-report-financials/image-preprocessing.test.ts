import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  preprocessOcrImage,
  OCR_PREPROCESSING_PIPELINE_VERSION,
} from "@/integrations/brreg/annual-report-financials/image-preprocessing";

async function makeRgbImage(width: number, height: number): Promise<Buffer> {
  // A small synthetic image with a horizontal stripe of dark "text" on a
  // light background so the preprocessing pipeline has something to work on.
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const isStripe = y >= height / 3 && y < (2 * height) / 3;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const value = isStripe ? 40 : 220;
      pixels[idx] = value;
      pixels[idx + 1] = value;
      pixels[idx + 2] = value;
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

describe("preprocessOcrImage", () => {
  it("returns a PNG buffer with the same dimensions as the input", async () => {
    const input = await makeRgbImage(80, 60);
    const output = await preprocessOcrImage(input);

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(60);
  });

  it("converts a colour input to monochrome (R == G == B per pixel)", async () => {
    // sharp may emit a 1-channel PNG or keep a 3-channel PNG with the
    // colour channels equalised — both are monochrome for OCR. We assert
    // the value invariant rather than the channel count.
    const input = await makeRgbImage(40, 40);
    const output = await preprocessOcrImage(input);
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels >= 3) {
      for (let pixel = 0; pixel < data.length; pixel += info.channels) {
        expect(data[pixel]).toBe(data[pixel + 1]);
        expect(data[pixel]).toBe(data[pixel + 2]);
      }
    } else {
      // 1- or 2-channel output is trivially monochrome.
      expect(info.channels).toBeLessThanOrEqual(2);
    }
  });

  it("stretches contrast: a low-contrast input becomes a high-contrast output", async () => {
    // Build an input where the stripe vs background differ by only ~20 levels.
    const width = 40;
    const height = 30;
    const channels = 3;
    const pixels = Buffer.alloc(width * height * channels);
    for (let y = 0; y < height; y++) {
      const isStripe = y >= height / 3 && y < (2 * height) / 3;
      const value = isStripe ? 110 : 130;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        pixels[idx] = value;
        pixels[idx + 1] = value;
        pixels[idx + 2] = value;
      }
    }
    const input = await sharp(pixels, { raw: { width, height, channels } })
      .png()
      .toBuffer();

    const output = await preprocessOcrImage(input);

    const rawOut = await sharp(output).raw().toBuffer();
    let minValue = 255;
    let maxValue = 0;
    for (const value of rawOut) {
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
    }
    // After normalisation the output should use most of the 0–255 range,
    // far wider than the input's ~20-level spread.
    expect(maxValue - minValue).toBeGreaterThan(150);
  });

  it("exposes a stable pipeline-version string for diagnostics", () => {
    expect(OCR_PREPROCESSING_PIPELINE_VERSION).toMatch(/^greyscale_normalise/);
  });
});
