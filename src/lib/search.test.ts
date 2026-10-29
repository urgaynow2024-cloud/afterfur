import { describe, expect, it } from "vitest";
import { mergeByIdPage, pageRange } from "@/lib/search";

describe("search pagination", () => {
  it("creates safe inclusive ranges for PostgREST", () => {
    expect(pageRange(0, 20)).toEqual([0, 19]);
    expect(pageRange(20, 20)).toEqual([20, 39]);
    expect(pageRange(-4, 0)).toEqual([0, 0]);
  });

  it("appends pages without duplicating rows and replaces on a new search", () => {
    const first = [{ id: "a", content: "old" }, { id: "b", content: "bee" }];
    const next = [{ id: "b", content: "updated" }, { id: "c", content: "see" }];
    expect(mergeByIdPage(first, next, true)).toEqual([
      { id: "a", content: "old" },
      { id: "b", content: "updated" },
      { id: "c", content: "see" },
    ]);
    expect(mergeByIdPage(first, [{ id: "c", content: "new query" }], false)).toEqual([{ id: "c", content: "new query" }]);
  });
});
