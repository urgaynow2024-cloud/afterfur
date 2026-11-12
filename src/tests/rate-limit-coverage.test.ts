import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name === "route.ts") out.push(p);
  }
  return out;
}

describe("API rate-limit coverage regression (Phase 5.3)", () => {
  it("every exported HTTP method in every API route calls rateLimit()", () => {
    const root = path.join(process.cwd(), "src", "app", "api");
    const files = walk(root);
    expect(files.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const f of files) {
      const c = fs.readFileSync(f, "utf8");
      const rel = path.relative(process.cwd(), f).replace(/\\/g, "/");
      const methods = [...c.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
      for (const m of methods) {
        const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b[\\s\\S]*?(?=export\\s+(?:async\\s+)?function\\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\\b|$)`);
        const block = c.match(re)?.[0] ?? "";
        if (!/\brateLimit\s*\(/.test(block)) missing.push(`${rel} ${m}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
