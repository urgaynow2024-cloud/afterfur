import { describe, expect, it } from "vitest";
import { generateQrMatrix } from "@/lib/qr";

describe("generateQrMatrix", () => {
  it("generates a valid QR matrix for a post permalink", () => {
    const matrix = generateQrMatrix("http://localhost:3000/artist/status/post-1", "M");
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    expect(matrix.modules).toHaveLength(matrix.size);
    for (const row of matrix.modules) {
      expect(row).toHaveLength(matrix.size);
    }

    // Verify top-left 7x7 finder pattern (outer border is dark, inner ring is light, 3x3 center is dark)
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        expect(matrix.modules[r]![c]).toBe(onBorder || inCenter);
      }
    }

    // Verify dark module at (size - 8, 8)
    expect(matrix.modules[matrix.size - 8]![8]).toBe(true);
  });

  it("scales version for longer URLs", () => {
    const shortMatrix = generateQrMatrix("https://afterfur.site/a/status/1", "M");
    const longMatrix = generateQrMatrix("https://afterfur.site/very-long-username-here/status/1234567890-abcdef", "M");
    expect(longMatrix.size).toBeGreaterThanOrEqual(shortMatrix.size);
  });
});