"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface ModColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T, ctx: { index: number }) => ReactNode;
  className?: string;
}

interface Props<T> {
  data: T[];
  columns: ModColumn<T>[];
  keyExtractor: (row: T) => string;
  sortKey?: string | null;
  sortDir?: SortDirection;
  onSortChange?: (key: string, dir: SortDirection) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  emptyMessage?: string;
  striped?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export default function ModTable<T>({
  data,
  columns,
  keyExtractor,
  sortKey,
  sortDir,
  onSortChange,
  onRowClick,
  rowClassName,
  emptyMessage = "No items.",
  striped = false,
  className,
  bodyClassName,
  children,
}: Props<T>) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const toggleSort = (col: ModColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    let next: SortDirection = "asc";
    if (sortKey === col.key && sortDir === "asc") next = "desc";
    else if (sortKey === col.key && sortDir === "desc") next = null;
    onSortChange(col.key, next);
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortable) return data;
    const a = [...data];
    a.sort((x, y) => {
      const xv = (x as Record<string, unknown>)[sortKey];
      const yv = (y as Record<string, unknown>)[sortKey];
      if (xv == null && yv == null) return 0;
      if (xv == null) return 1;
      if (yv == null) return -1;
      if (typeof xv === "number" && typeof yv === "number") return sortDir === "asc" ? xv - yv : yv - xv;
      const xs = String(xv).toLowerCase();
      const ys = String(yv).toLowerCase();
      if (xs < ys) return sortDir === "asc" ? -1 : 1;
      if (xs > ys) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return a;
  }, [data, sortKey, sortDir, columns]);

  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="af-mod-table w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${alignClass(col.align)} ${col.className ?? ""}`.trim()}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className="inline-flex items-center gap-1 hover:text-af-text"
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <span aria-hidden="true">▲</span>
                        ) : sortDir === "desc" ? (
                          <span aria-hidden="true">▼</span>
                        ) : (
                          <span aria-hidden="true" className="opacity-40">⇔</span>
                        )
                      ) : (
                        <span aria-hidden="true" className="opacity-30">⇔</span>
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={bodyClassName}>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-af-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => {
                const id = keyExtractor(row);
                const isHover = hoveredRow === id;
                return (
                  <tr
                    key={id}
                    className={`${striped && index % 2 === 1 ? "bg-af-surface-2/40" : ""} ${rowClassName?.(row) ?? ""} ${isHover ? "bg-af-surface-2" : ""}`.trim()}
                    onMouseEnter={() => setHoveredRow(id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${alignClass(col.align)} ${col.className ?? ""}`.trim()}
                      >
                        {col.render(row, { index })}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}