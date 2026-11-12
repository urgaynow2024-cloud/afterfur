/**
 * NSFW media private reconciliation script (hardened, Phase 5.3)
 *
 * Moves NSFW media from the public `media` bucket to the private
 * `media_private` bucket, updating post media_urls from public URLs to bare
 * storage paths. Only NSFW-classified posts are affected.
 *
 * Safety guarantees:
 *   - Idempotent: posts with media_reconciled_at set are skipped.
 *   - Resumable: processes one post at a time and records progress after each.
 *   - No destructive operations until verification: originals are deleted only
 *     after the private copy is independently verified (path, size, SHA-256).
 *   - Duplicate destinations are recognised and verified, not blindly copied.
 *
 * Unclassified legacy media handling:
 *   - Posts with NULL/unknown classification containing public-bucket media are
 *     NOT automatically classified or reconciled. They are quarantined for manual
 *     review in the report. Unknown classification is never treated as SFW.
 *   - Quarantine report distinguishes UNRESOLVED (quarantine/manual review) from
 *     RECONCILED (NSFW migrated) and FAILED items.
 *
 * Coverage:
 *   - Default behavior paginates through ALL posts (no silent truncation).
 *   - `--limit=N` applies only to NSFW reconciliation batch size (for controlled
 *     rollout); quarantine scan still paginates all posts unless `--scan-limit=N`
 *     is explicitly set, and the report marks `scanComplete`/`scanLimitApplied`.
 *   - `--known-post=<id>` reports investigation status for a specific post ID.
 *
 * Usage:
 *   npx tsx scripts/reconcile-nsfw-media.ts --dry-run
 *   npx tsx scripts/reconcile-nsfw-media.ts
 *   npx tsx scripts/reconcile-nsfw-media.ts --known-post=7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { storagePathFromPublicUrl, isNsfwReconciliationCandidate } from "../src/lib/nsfwMedia";

const ENV_FILE = ".env.local";
type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

export type PostRow = {
  id: string;
  author_id: string;
  created_at: string;
  classification: string | null;
  media_urls: string[] | null;
  media_reconciled_at: string | null;
};

const PUBLIC_BUCKET = "media";
const PRIVATE_BUCKET = "media_private";
export const PUBLIC_MEDIA_URL_RE = /\/object\/public\/media\//;

export type QuarantineEntry = {
  postId: string;
  authorId: string;
  createdAt: string;
  classification: string | null;
  status: "UNRESOLVED_QUARANTINE";
  reason: string;
  publicMediaUrls: string[];
};

export type ReconciledEntry = { postId: string; classification: "NSFW"; status: "RECONCILED" | "DRY_RUN"; publicMediaUrls: string[] };
export type FailedEntry = { postId: string; classification: string | null; status: "FAILED"; reason: string; publicMediaUrls: string[] };

export type InvestigationEntry = {
  postId: string;
  foundInScannedData: boolean;
  classification: string | null;
  mediaReconciledAt: string | null;
  publicMediaUrls: string[];
  disposition: "WOULD_QUARANTINE" | "NSFW_RECONCILIATION_CANDIDATE" | "ALREADY_RECONCILED" | "NO_PUBLIC_MEDIA" | "NOT_FOUND_IN_SCAN";
  note: string;
};

function loadEnv(path: string): Env {
  let text: string;
  try { text = fs.readFileSync(path, "utf8"); } catch {
    throw new Error(`Could not read ${path}. Create it with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  }
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  const missing = ["SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment variables in ${path}: ${missing.join(", ")}`);
  if (!env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!env.SUPABASE_URL) throw new Error(`Missing required environment variable in ${path}: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)`);
  return env as Env;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function classifyQuarantine(posts: PostRow[]): QuarantineEntry[] {
  const out: QuarantineEntry[] = [];
  for (const p of posts) {
    if (p.classification === "NSFW") continue;
    const urls = (p.media_urls ?? []).filter((u) => PUBLIC_MEDIA_URL_RE.test(u));
    if (urls.length === 0) continue;
    out.push({
      postId: p.id,
      authorId: p.author_id,
      createdAt: p.created_at,
      classification: p.classification ?? null,
      status: "UNRESOLVED_QUARANTINE",
      reason:
        p.classification == null
          ? "Unclassified (NULL) post has public-bucket media; never treated as SFW; manual review required."
          : `Non-NSFW classification (${String(p.classification)}) has public-bucket media; manual review required.`,
      publicMediaUrls: urls,
    });
  }
  return out;
}

export function investigateKnownPost(posts: PostRow[], knownPostId: string): InvestigationEntry {
  const p = posts.find((x) => x.id === knownPostId);
  if (!p) {
    return {
      postId: knownPostId,
      foundInScannedData: false,
      classification: null,
      mediaReconciledAt: null,
      publicMediaUrls: [],
      disposition: "NOT_FOUND_IN_SCAN",
      note: "NOT VERIFIED from scan: post not found in scanned dataset (scan may be limited or post absent). A live read-only query is required for definitive status.",
    };
  }
  const publicUrls = (p.media_urls ?? []).filter((u) => PUBLIC_MEDIA_URL_RE.test(u));
  if (p.media_reconciled_at) {
    return { postId: knownPostId, foundInScannedData: true, classification: p.classification, mediaReconciledAt: p.media_reconciled_at, publicMediaUrls: publicUrls, disposition: "ALREADY_RECONCILED", note: "Post marked media_reconciled_at; public originals should have been deleted only after verified copy (per script logic). Live storage verification still required." };
  }
  if (isNsfwReconciliationCandidate(p)) {
    return { postId: knownPostId, foundInScannedData: true, classification: p.classification, mediaReconciledAt: p.media_reconciled_at, publicMediaUrls: publicUrls, disposition: "NSFW_RECONCILIATION_CANDIDATE", note: "Would be handled by NSFW reconciliation (not quarantine)." };
  }
  if (publicUrls.length > 0) {
    return { postId: knownPostId, foundInScannedData: true, classification: p.classification, mediaReconciledAt: p.media_reconciled_at, publicMediaUrls: publicUrls, disposition: "WOULD_QUARANTINE", note: "Has public-bucket media and is not an NSFW reconciliation candidate; would appear in quarantine report for manual review." };
  }
  return { postId: knownPostId, foundInScannedData: true, classification: p.classification, mediaReconciledAt: p.media_reconciled_at, publicMediaUrls: [], disposition: "NO_PUBLIC_MEDIA", note: "No public-bucket media URLs detected in scanned row." };
}

export function buildReport(args: {
  dryRun: boolean;
  scanComplete: boolean;
  scanLimitApplied: number | null;
  scannedPosts: number;
  quarantine: QuarantineEntry[];
  reconciled: ReconciledEntry[];
  failed: FailedEntry[];
  investigations: InvestigationEntry[];
}) {
  return {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    scanComplete: args.scanComplete,
    scanLimitApplied: args.scanLimitApplied,
    scannedPosts: args.scannedPosts,
    totals: {
      unresolvedQuarantinedPosts: args.quarantine.length,
      unresolvedPublicMediaFiles: args.quarantine.reduce((s, e) => s + e.publicMediaUrls.length, 0),
      reconciledPosts: args.reconciled.length,
      failedPosts: args.failed.length,
    },
    // Clear separation: unresolved/quarantined items are NOT reconciled and NOT auto-classified.
    unresolvedQuarantine: args.quarantine,
    reconciled: args.reconciled,
    failed: args.failed,
    investigations: args.investigations,
  };
}

function writeReport(report: ReturnType<typeof buildReport>, dryRun: boolean): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `quarantine-report-${timestamp}${dryRun ? "-dry-run" : ""}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  return filename;
}

async function fetchAllPosts(supabase: any, scanLimit: number | null): Promise<{ posts: PostRow[]; scanComplete: boolean }> {
  const pageSize = 500;
  const posts: PostRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("posts")
      .select("id,author_id,created_at,classification,media_urls,media_reconciled_at")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Failed to fetch posts: ${error.message}`);
    const batch = (data ?? []) as PostRow[];
    posts.push(...batch);
    if (scanLimit && posts.length >= scanLimit) return { posts: posts.slice(0, scanLimit), scanComplete: false };
    if (batch.length < pageSize) return { posts, scanComplete: true };
    from += pageSize;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const reconcileLimit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null; // NSFW reconcile batch only
  const scanLimitArg = process.argv.find((a) => a.startsWith("--scan-limit="));
  const scanLimit = scanLimitArg ? parseInt(scanLimitArg.split("=")[1], 10) : null; // explicit scan cap
  const knownArg = process.argv.find((a) => a.startsWith("--known-post="));
  const knownPostId = knownArg ? knownArg.split("=")[1] : "7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c";

  let env: Env;
  try { env = loadEnv(ENV_FILE); } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(`AfterFur NSFW media private reconciliation (Phase 5.3)${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`Supabase URL: ${env.SUPABASE_URL}`);
  console.log(`NSFW reconcile limit: ${reconcileLimit ?? "none"} | Scan limit: ${scanLimit ?? "none (paginate all)"}`);
  console.log(`Known-post investigation: ${knownPostId}`);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let scanComplete = true;
  let posts: PostRow[] = [];
  try {
    const scanned = await fetchAllPosts(supabase, scanLimit);
    posts = scanned.posts;
    scanComplete = scanned.scanComplete;
  } catch (e) {
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (!scanComplete || scanLimit) {
    console.warn("WARNING: Scan is NOT complete (explicit scan limit applied or pagination stopped early). Large datasets may be missed. Rerun without --scan-limit for full coverage.");
  }

  const quarantine = classifyQuarantine(posts);
  const investigations = [investigateKnownPost(posts, knownPostId)];
  const unreconciledAll = posts.filter(isNsfwReconciliationCandidate) as (PostRow & { media_urls: string[] })[];
  const unreconciled = reconcileLimit ? unreconciledAll.slice(0, reconcileLimit) : unreconciledAll;

  const reconciled: ReconciledEntry[] = [];
  const failed: FailedEntry[] = [];

  // Log known-post investigation (does not prove production state if scan incomplete)
  for (const inv of investigations) {
    console.log(`\nKNOWN POST ${inv.postId}: ${inv.disposition}`);
    console.log(`  ${inv.note}`);
    if (!inv.foundInScannedData && (!scanComplete || scanLimit)) {
      console.log("  Scan incomplete — NOT VERIFIED. Run a full scan or read-only live query.");
    }
  }

  for (const post of unreconciled) {
    const postId = post.id;
    const authorId = post.author_id;
    const urls = post.media_urls ?? [];
    const publicUrls = urls.filter((u) => PUBLIC_MEDIA_URL_RE.test(u));
    const storagePaths = urls.filter((u) => !PUBLIC_MEDIA_URL_RE.test(u));

    if (publicUrls.length === 0) {
      if (!dryRun) {
        const { error: markError } = await supabase.from("posts").update({ media_reconciled_at: new Date().toISOString() }).eq("id", postId);
        if (markError) { failed.push({ postId, classification: post.classification, status: "FAILED", reason: markError.message, publicMediaUrls: publicUrls }); continue; }
      }
      reconciled.push({ postId, classification: "NSFW", status: dryRun ? "DRY_RUN" : "RECONCILED", publicMediaUrls: [] });
      continue;
    }

    const newUrls: string[] = [];
    let postFailedReason: string | null = null;
    for (const publicUrl of publicUrls) {
      const storagePath = storagePathFromPublicUrl(publicUrl);
      if (!storagePath) { postFailedReason = `Could not extract storage path from ${publicUrl}`; break; }
      if (dryRun) { newUrls.push(storagePath); continue; }

      const { data: sourceBlob, error: sourceError } = await supabase.storage.from(PUBLIC_BUCKET).download(storagePath);
      if (sourceError || !sourceBlob) { postFailedReason = `Source download failed: ${sourceError?.message}`; break; }
      const sourceBuf = Buffer.from(await sourceBlob.arrayBuffer());
      const sourceSize = sourceBuf.length;
      const sourceHash = sha256(sourceBuf);

      const { data: destBlob } = await supabase.storage.from(PRIVATE_BUCKET).download(storagePath);
      let destVerified = false;
      if (destBlob) {
        const destBuf = Buffer.from(await destBlob.arrayBuffer());
        if (destBuf.length === sourceSize && sha256(destBuf) === sourceHash) destVerified = true;
        else { postFailedReason = `Destination size/hash mismatch for ${storagePath}`; break; }
      }
      if (!destVerified) {
        const { error: uploadError } = await supabase.storage.from(PRIVATE_BUCKET).upload(storagePath, sourceBuf, { upsert: false, contentType: sourceBlob.type || undefined });
        if (uploadError) { postFailedReason = `Upload failed: ${uploadError.message}`; break; }
        const { data: verifyBlob, error: verifyError } = await supabase.storage.from(PRIVATE_BUCKET).download(storagePath);
        if (verifyError || !verifyBlob) { postFailedReason = `Verification download failed: ${verifyError?.message}`; break; }
        const verifyBuf = Buffer.from(await verifyBlob.arrayBuffer());
        if (verifyBuf.length !== sourceSize || sha256(verifyBuf) !== sourceHash) { postFailedReason = `Verification size/hash mismatch for ${storagePath}`; break; }
      }

      const mediaType = storagePath.toLowerCase().endsWith(".gif") ? "gif" : /\.(mp4|webm|mov)(?:$|\?)/i.test(storagePath) ? "video" : /\.(png|jpg|jpeg|webp)(?:$|\?)/i.test(storagePath) ? "image" : null;
      const { error: insertError } = await supabase.from("media").insert({ owner_id: authorId, post_id: postId, storage_path: storagePath, bucket_id: PRIVATE_BUCKET, media_type: mediaType });
      if (insertError && !insertError.message.toLowerCase().includes("duplicate")) { postFailedReason = `Media record insert failed: ${insertError.message}`; break; }
      newUrls.push(storagePath);
    }

    if (postFailedReason) { failed.push({ postId, classification: post.classification, status: "FAILED", reason: postFailedReason, publicMediaUrls: publicUrls }); continue; }

    const finalUrls = [...newUrls, ...storagePaths];
    const { error: updateError } = await supabase.from("posts").update({ media_urls: finalUrls, media_reconciled_at: new Date().toISOString() }).eq("id", postId);
    if (updateError) { failed.push({ postId, classification: post.classification, status: "FAILED", reason: updateError.message, publicMediaUrls: publicUrls }); continue; }

    // Delete originals ONLY after DB update succeeded and private copy verified.
    for (const publicUrl of publicUrls) {
      const storagePath = storagePathFromPublicUrl(publicUrl)!;
      await supabase.storage.from(PUBLIC_BUCKET).remove([storagePath]);
    }
    reconciled.push({ postId, classification: "NSFW", status: dryRun ? "DRY_RUN" : "RECONCILED", publicMediaUrls: publicUrls });
  }

  const report = buildReport({ dryRun, scanComplete: scanComplete && !scanLimit, scanLimitApplied: scanLimit, scannedPosts: posts.length, quarantine, reconciled, failed, investigations });
  const filename = writeReport(report, dryRun);
  console.log(`\nReport: ${filename}`);
  console.log(`Scanned: ${posts.length} (complete=${report.scanComplete}). Unresolved quarantine: ${quarantine.length}. Reconciled: ${reconciled.length}. Failed: ${failed.length}.`);
  if (dryRun) console.log("Dry run — no data/storage mutations performed.");
}

if (require.main === module) {
  main().catch((err) => { console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); });
}
