"use strict";

import { useCallback, useMemo, useState } from "react";

type SortDirection = "asc" | "desc" | null;

interface UseTableOptions<T> {
  data: T[];
  searchableFields?: (keyof T)[];
  defaultSort?: { field: keyof T; dir: SortDirection };
}

export function useModerationTable<T extends Record<string, unknown>>({
  data,
  searchableFields,
  defaultSort,
}: UseTableOptions<T>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortDirection>(defaultSort?.dir ?? null);
  const [sortField, setSortField] = useState<keyof T | null>(defaultSort?.field ?? null);

  const filtered = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      if (searchableFields?.length) {
        result = result.filter((row) => searchableFields.some((f) => String(row[f] ?? "").toLowerCase().includes(q)));
      } else {
        result = result.filter((row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q)));
      }
    }
    if (sortField && sort) {
      result = [...result].sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
        return sort === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, searchableFields, sortField, sort]);

  const toggleSort = useCallback((field: keyof T) => {
    if (sortField === field) {
      setSort((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
    } else {
      setSortField(field);
      setSort("asc");
    }
  }, [sortField, sort]);

  const clearSort = useCallback(() => {
    setSort(null);
    setSortField(null);
  }, []);

  return {
    search,
    setSearch,
    sort,
    sortField,
    filtered,
    total: filtered.length,
    toggleSort,
    clearSort,
    sortDirLabel: (field: keyof T) => {
      if (sortField !== field) return "";
      return sort === "asc" ? " ▲" : sort === "desc" ? " ▼" : "";
    },
  };
}
