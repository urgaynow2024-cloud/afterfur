"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { classifyMedia, classifyMediaUrl, formatBytes, validateMediaSelection } from "@/lib/media";

export type MediaItem = {
  file: File;
  preview: string;
  kind: "image" | "video" | "gif";
};

type MediaComposerProps = {
  disabled: boolean;
  uploading: boolean;
  uploadProgress: number;
  media: MediaItem[];
  onAdd: (items: MediaItem[]) => void;
  onRemove: (index: number) => void;
};

function MediaComposer({ disabled, uploading, uploadProgress, media, onAdd, onRemove }: MediaComposerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;
      const list = Array.from(files);
      const err = validateMediaSelection(list);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      const newItems: MediaItem[] = list.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        kind: classifyMedia(file) as "image" | "video" | "gif",
      }));
      onAdd(newItems);
    },
    [disabled, onAdd],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      addFiles(event.dataTransfer?.files ?? null);
    },
    [addFiles],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const onDragLeave = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const onPick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addFiles(event.target.files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles],
  );

  useEffect(() => () => {
    media.forEach((item) => URL.revokeObjectURL(item.preview));
  }, [media]);

  if (media.length === 0 && !uploading) {
    return (
      <label
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm transition-colors ${
          isDragging
            ? "border-af-brand-soft bg-af-brand/10 text-af-text"
            : "border-af-border-strong bg-af-surface/40 text-af-muted hover:border-af-brand-soft hover:text-af-text"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span aria-hidden="true" className="text-base">📎</span>
        <span>{isDragging ? "Drop media here" : "Add image, video or GIF"}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          aria-label="Attach media"
          disabled={disabled}
          onChange={onPick}
        />
      </label>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {uploading && (
        <div>
          <div className="flex items-center justify-between text-xs text-af-muted">
            <span>Uploading…</span>
            <span>{Math.max(0, Math.min(100, Math.round(uploadProgress)))}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-af-surface-2">
            <div
              className="h-full bg-af-brand transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(uploadProgress)))}%` }}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {media.map((item, index) => (
          <div key={item.preview + index} className="relative">
            {item.kind === "video" ? (
              <video src={item.preview} controls playsInline className="aspect-video w-full rounded-lg bg-black object-contain" />
            ) : (
              <img src={item.preview} alt="Selected media" className="aspect-square w-full rounded-lg object-cover" />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(index)}
              aria-label="Remove media"
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        <label
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-af-border-strong text-af-muted hover:border-af-brand-soft hover:text-af-text ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className="px-3 py-2 text-xs">Add more</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            aria-label="Attach more media"
            disabled={disabled}
            onChange={onPick}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-af-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default MediaComposer;