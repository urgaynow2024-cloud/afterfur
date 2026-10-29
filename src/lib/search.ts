export function pageRange(offset: number, pageSize: number): [number, number] {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  return [safeOffset, safeOffset + safePageSize - 1];
}

export function mergeByIdPage<T extends { id: string }>(current: T[], next: T[], append: boolean): T[] {
  const merged = new Map<string, T>((append ? current : []).map((item) => [item.id, item]));
  for (const item of next) merged.set(item.id, item);
  return [...merged.values()];
}
