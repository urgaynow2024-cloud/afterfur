export type QrMatrix = {
  size: number;
  version: number;
  modules: boolean[][];
};

type EcLevel = "L" | "M" | "Q" | "H";

const EC_FORMAT_BITS: Record<EcLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

type VersionSpec = {
  version: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
};

const VERSION_TABLE_M: VersionSpec[] = [
  { version: 1, totalCodewords: 26, ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 2, totalCodewords: 44, ecCodewordsPerBlock: 16, group1Blocks: 1, group1DataCodewords: 28, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 3, totalCodewords: 70, ecCodewordsPerBlock: 18, group1Blocks: 1, group1DataCodewords: 44, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 4, totalCodewords: 100, ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 32, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 5, totalCodewords: 134, ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 43, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 6, totalCodewords: 172, ecCodewordsPerBlock: 16, group1Blocks: 4, group1DataCodewords: 27, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 7, totalCodewords: 196, ecCodewordsPerBlock: 18, group1Blocks: 4, group1DataCodewords: 31, group2Blocks: 0, group2DataCodewords: 0 },
  { version: 8, totalCodewords: 242, ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCodewords: 38, group2Blocks: 2, group2DataCodewords: 39 },
  { version: 9, totalCodewords: 292, ecCodewordsPerBlock: 22, group1Blocks: 3, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37 },
  { version: 10, totalCodewords: 346, ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 43, group2Blocks: 1, group2DataCodewords: 44 },
];

const ALIGNMENT_CENTERS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function totalDataCodewords(spec: VersionSpec): number {
  return spec.group1Blocks * spec.group1DataCodewords + spec.group2Blocks * spec.group2DataCodewords;
}

function selectVersionSpec(byteLength: number, ecLevel: EcLevel = "M"): VersionSpec {
  const headerBits = 4 + 8;
  for (const spec of VERSION_TABLE_M) {
    const capacityBits = totalDataCodewords(spec) * 8;
    if (headerBits + byteLength * 8 <= capacityBits) {
      return spec;
    }
  }
  const fallback = VERSION_TABLE_M[VERSION_TABLE_M.length - 1];
  if (!fallback) throw new Error("Unsupported QR version");
  const fallbackCapacityBits = totalDataCodewords(fallback) * 8;
  if (ecLevel !== "M" && headerBits + byteLength * 8 > fallbackCapacityBits) {
    throw new Error("Payload too large for QR code");
  }
  return fallback;
}

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x80) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]]!;
}

function buildGeneratorPolynomial(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gfMultiply(poly[j]!, EXP_TABLE[i]!);
    }
    poly = next;
  }
  return poly;
}

function computeErrorCorrection(dataBlock: Uint8Array, ecCount: number): Uint8Array {
  const generator = buildGeneratorPolynomial(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < dataBlock.length; i++) {
    const factor = dataBlock[i]! ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMultiply(generator[j + 1]!, factor);
    }
  }
  return remainder;
}

function encodeDataCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const totalData = totalDataCodewords(spec);
  const bits: number[] = [];

  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i]!, 8);
  }

  const capacityBits = totalData * 8;
  const terminatorLength = Math.min(4, capacityBits - bits.length);
  if (terminatorLength > 0) {
    pushBits(0, terminatorLength);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalData);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i + b]!;
    }
    codewords[i / 8] = byte;
  }

  let padIndex = 0;
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8; i < totalData; i++) {
    codewords[i] = padBytes[padIndex % 2]!;
    padIndex++;
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: Uint8Array, spec: VersionSpec): Uint8Array {
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;

  for (let b = 0; b < spec.group1Blocks; b++) {
    const blockData = dataCodewords.slice(offset, offset + spec.group1DataCodewords);
    offset += spec.group1DataCodewords;
    blocks.push({
      data: blockData,
      ec: computeErrorCorrection(blockData, spec.ecCodewordsPerBlock),
    });
  }
  for (let b = 0; b < spec.group2Blocks; b++) {
    const blockData = dataCodewords.slice(offset, offset + spec.group2DataCodewords);
    offset += spec.group2DataCodewords;
    blocks.push({
      data: blockData,
      ec: computeErrorCorrection(blockData, spec.ecCodewordsPerBlock),
    });
  }

  const result: number[] = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i]!);
      }
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (const block of blocks) {
      result.push(block.ec[i]!);
    }
  }

  return new Uint8Array(result);
}

function computeVersionInfo(version: number): number {
  let rem = version << 12;
  for (let i = 0; i < 6; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function computeFormatInfo(ecLevel: EcLevel, maskPattern: number): number {
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | maskPattern;
  let rem = data << 10;
  for (let i = 0; i < 5; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function applyMask(maskPattern: number, row: number, col: number): boolean {
  switch (maskPattern) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return false;
  }
}

function evaluatePenalty(matrix: boolean[][], size: number): number {
  let penalty = 0;

  // Rule 1: Consecutive runs of 5+ same-color modules in row or column
  for (let r = 0; r < size; r++) {
    let runColor = matrix[r]![0]!;
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r]![c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c++) {
    let runColor = matrix[0]![c]!;
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r]![c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const tl = matrix[r]![c];
      if (tl === matrix[r]![c + 1] && tl === matrix[r + 1]![c] && tl === matrix[r + 1]![c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like patterns 1:1:3:1:1
  const pattern1 = [true, false, true, true, true, false, true];
  const pattern4 = [false, false, false, false];
  const matchesPattern = (line: boolean[], idx: number, pat: boolean[]) => {
    for (let k = 0; k < pat.length; k++) {
      if (line[idx + k] !== pat[k]) return false;
    }
    return true;
  };
  for (let r = 0; r < size; r++) {
    const row = matrix[r]!;
    for (let c = 0; c <= size - 7; c++) {
      if (matchesPattern(row, c, pattern1)) {
        if ((c >= 4 && matchesPattern(row, c - 4, pattern4)) || (c + 7 <= size - 4 && matchesPattern(row, c + 7, pattern4))) {
          penalty += 40;
        }
      }
    }
  }
  for (let c = 0; c < size; c++) {
    const col = matrix.map((r) => r[c]!);
    for (let r = 0; r <= size - 7; r++) {
      if (matchesPattern(col, r, pattern1)) {
        if ((r >= 4 && matchesPattern(col, r - 4, pattern4)) || (r + 7 <= size - 4 && matchesPattern(col, r + 7, pattern4))) {
          penalty += 40;
        }
      }
    }
  }

  // Rule 4: Dark module proportion deviation from 50%
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]![c]) darkCount++;
    }
  }
  const totalModules = size * size;
  const darkPercent = (darkCount * 100) / totalModules;
  const deviation = Math.abs(darkPercent - 50) / 5;
  penalty += Math.floor(deviation) * 10;

  return penalty;
}

export function generateQrMatrix(text: string, ecLevel: EcLevel = "M"): QrMatrix {
  if (!text || typeof text !== "string") {
    throw new Error("QR text is required");
  }
  const bytes = new TextEncoder().encode(text);
  const spec = selectVersionSpec(bytes.length, ecLevel);
  const version = spec.version;
  const size = version * 4 + 17;

  const dataCodewords = encodeDataCodewords(bytes, spec);
  const finalCodewords = interleaveCodewords(dataCodewords, spec);

  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false) as boolean[]);
  const baseMatrix: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false) as boolean[]);

  // 1. Finder patterns (top-left, top-right, bottom-left)
  const placeFinder = (startRow: number, startCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startRow + r;
        const col = startCol + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        isFunction[row]![col] = true;
        const inInner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        baseMatrix[row]![col] = inInner && (onBorder || inCore);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (!isFunction[6]![i]) {
      isFunction[6]![i] = true;
      baseMatrix[6]![i] = bit;
    }
    if (!isFunction[i]![6]) {
      isFunction[i]![6] = true;
      baseMatrix[i]![6] = bit;
    }
  }

  // 3. Alignment patterns
  const centers = ALIGNMENT_CENTERS[version - 1] ?? [];
  for (let rIdx = 0; rIdx < centers.length; rIdx++) {
    for (let cIdx = 0; cIdx < centers.length; cIdx++) {
      const centerRow = centers[rIdx]!;
      const centerCol = centers[cIdx]!;
      if (isFunction[centerRow]![centerCol]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const row = centerRow + dr;
          const col = centerCol + dc;
          isFunction[row]![col] = true;
          baseMatrix[row]![col] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }

  // 4. Reserve format information areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8]![i]) { isFunction[8]![i] = true; baseMatrix[8]![i] = false; }
    if (!isFunction[i]![8]) { isFunction[i]![8] = true; baseMatrix[i]![8] = false; }
    const rightCol = size - 1 - i;
    if (!isFunction[8]![rightCol]) { isFunction[8]![rightCol] = true; baseMatrix[8]![rightCol] = false; }
    const bottomRow = size - 1 - i;
    if (!isFunction[bottomRow]![8]) { isFunction[bottomRow]![8] = true; baseMatrix[bottomRow]![8] = false; }
  }

  // 5. Dark module at (4*version + 9, 8)
  isFunction[size - 8]![8] = true;
  baseMatrix[size - 8]![8] = true;

  // 6. Reserve version information areas (Version >= 7)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const r1 = i;
        const c1 = size - 11 + j;
        isFunction[r1]![c1] = true;
        baseMatrix[r1]![c1] = false;

        const r2 = size - 11 + j;
        const c2 = i;
        isFunction[r2]![c2] = true;
        baseMatrix[r2]![c2] = false;
      }
    }
  }

  // 7. Place data bits in zigzag order
  let bitIndex = 0;
  const totalDataBits = finalCodewords.length * 8;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) {
      rightCol = 5;
    }
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = rightCol - j;
        const upward = ((rightCol + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!isFunction[row]![col] && bitIndex < totalDataBits) {
          const byteIdx = bitIndex >>> 3;
          const bitPos = 7 - (bitIndex & 7);
          const bit = ((finalCodewords[byteIdx]! >>> bitPos) & 1) === 1;
          baseMatrix[row]![col] = bit;
          bitIndex++;
        }
      }
    }
  }

  // 8. Try all 8 mask patterns and select the one with lowest penalty
  let bestMatrix: boolean[][] | null = null;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const candidate: boolean[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        const unmasked = Boolean(baseMatrix[r]![c]);
        if (isFunction[r]![c]) return unmasked;
        return Boolean(unmasked !== applyMask(mask, r, c));
      })
    );

    // Write format info for this mask
    const formatBits = computeFormatInfo(ecLevel, mask);
    const bitAt = (shift: number) => ((formatBits >>> shift) & 1) === 1;

    for (let i = 0; i <= 5; i++) {
      candidate[8]![i] = bitAt(i);
    }
    candidate[8]![7] = bitAt(6);
    candidate[8]![8] = bitAt(7);
    candidate[7]![8] = bitAt(8);
    for (let i = 9; i <= 14; i++) {
      candidate[14 - i]![8] = bitAt(i);
    }

    for (let i = 0; i <= 7; i++) {
      candidate[size - 1 - i]![8] = bitAt(i);
    }
    for (let i = 8; i <= 14; i++) {
      candidate[8]![size - 15 + i] = bitAt(i);
    }
    candidate[size - 8]![8] = true;

    // Write version info if version >= 7
    if (version >= 7) {
      const vBits = computeVersionInfo(version);
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >>> i) & 1) === 1;
        const aRow = Math.floor(i / 3);
        const aCol = size - 11 + (i % 3);
        candidate[aRow]![aCol] = bit;

        const bRow = size - 11 + (i % 3);
        const bCol = Math.floor(i / 3);
        candidate[bRow]![bCol] = bit;
      }
    }

    const penalty = evaluatePenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatrix = candidate;
    }
  }

  if (!bestMatrix) {
    throw new Error("Failed to generate QR matrix");
  }

  return {
    size,
    version,
    modules: bestMatrix,
  };
}