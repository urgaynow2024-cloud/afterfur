# AfterFur Post-Migration Schema Validation Script
#
# PURPOSE: Verify the staging database schema after migration rehearsal.
#          Checks tables, columns, indexes, RLS policies, functions, triggers,
#          and storage buckets expected from the 11 approved migrations.
#
# SAFETY RULES:
#   - Never connect to production. Use staging only.
#   - Never print or expose credentials.
#   - Requires explicit staging credentials (never falls back to .env.local).
#   - Safe to rerun - all checks are read-only.
#
# USAGE:
#   # Source env first, then validate:
#   . ./scripts/load-staging-env.ps1
#   .\scripts\validate-migration-schema.ps1
#
#   # Or with explicit credentials:
#   .\scripts\validate-migration-schema.ps1 -StagingUrl <url> -ServiceRoleKey <key>

param(
  [Parameter(Mandatory = $false)]
  [string]$StagingUrl,

  [Parameter(Mandatory = $false)]
  [string]$ServiceRoleKey,

  [Parameter(Mandatory = $false)]
  [string]$MigrationPath = "supabase/migrations",

  [Parameter(Mandatory = $false)]
  [string]$LogFile
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$envFile = Join-Path $repoRoot ".env.staging.local"

# Production host that must NEVER be used for staging
$productionHost = "kunwfddahxkpvsivmmkm.supabase.co"

# Try loading from .env.staging.local if params not provided
if (-not $StagingUrl -and (Test-Path $envFile)) {
  Write-Host "Loading staging environment from: $envFile" -ForegroundColor Cyan
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
      $name = $matches[1]
      $value = $matches[2].Trim().Trim('"').Trim("'")
      if ($name -eq "NEXT_PUBLIC_SUPABASE_URL") { $StagingUrl = $value }
      if ($name -eq "SUPABASE_SERVICE_ROLE_KEY") { $ServiceRoleKey = $value }
    }
  }
}

# Reject missing credentials - never fall back to .env.local
if (-not $StagingUrl -or -not $ServiceRoleKey) {
  Write-Error "Missing staging credentials.`n`nProvide -StagingUrl and -ServiceRoleKey, or create .env.staging.local from .env.staging.example.`nNever fall back to .env.local (production)." -ErrorAction Stop
}

# Reject production host
if ($StagingUrl -match $productionHost) {
  Write-Error "REFUSING: Staging URL points to production host: $productionHost" -ErrorAction Stop
}

# Extract host for validation
try {
  $stagingUri = [System.Uri]$StagingUrl
  $stagingHost = $stagingUri.Host
} catch {
  Write-Error "Invalid StagingUrl format: $StagingUrl" -ErrorAction Stop
}

if ($stagingHost -eq $productionHost) {
  Write-Error "REFUSING: Staging host resolves to production: $productionHost" -ErrorAction Stop
}

Write-Host "Validating staging schema at host: $stagingHost" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0
$warnings = 0

function Test-Check {
  param([string]$Name, [string]$Expected, [string]$Actual)
  if ($Actual -eq $Expected) {
    Write-Host "  [PASS] $Name" -ForegroundColor Green
    $script:passed++
  } else {
    Write-Host "  [FAIL] $Name - expected '$Expected', got '$Actual'" -ForegroundColor Red
    $script:failed++
  }
}

function Test-Warning {
  param([string]$Name, [string]$Message)
  Write-Host "  [WARN] $Name - $Message" -ForegroundColor Yellow
  $script:warnings++
}

# ============================================================================
# 1. Verify migration execution log (if provided)
# ============================================================================
if ($LogFile) {
  Write-Host "=== MIGRATION EXECUTION LOG ===" -ForegroundColor Cyan
  if (Test-Path $LogFile) {
    $logContent = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
    if ($logContent) {
      $logEntries = $logContent | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($logEntries) {
        $total = $logEntries.Count
        $success = ($logEntries | Where-Object { $_.Status -eq "OK" }).Count
        $failed = ($logEntries | Where-Object { $_.Status -ne "OK" }).Count
        Write-Host "  Log file: $LogFile" -ForegroundColor Gray
        Write-Host "  Total migrations logged: $total" -ForegroundColor Gray
        Write-Host "  Successful: $success" -ForegroundColor Gray
        Write-Host "  Failed: $failed" -ForegroundColor Gray
        if ($failed -gt 0) {
          Test-Warning "Log contains failed migrations" "Review $LogFile for details"
        }
      } else {
        Test-Warning "Log file not valid JSON" "Could not parse $LogFile"
      }
    } else {
      Test-Warning "Log file is empty" "$LogFile exists but contains no data"
    }
  } else {
    Test-Warning "Log file not found" "$LogFile - cannot verify execution history"
  }
  Write-Host ""
}

# ============================================================================
# 2. Tables expected after all 11 migrations
# ============================================================================
Write-Host "=== TABLES ===" -ForegroundColor Cyan
$expectedTables = @(
  "message_reads", "message_attachments", "conversation_mutes",
  "reports", "bookmark_folders", "bookmark_folder_items",
  "post_boosts", "account_deletion_requests", "data_export_requests", "media"
)

foreach ($table in $expectedTables) {
  $actual = & psql "$StagingUrl" -t -c "SELECT to_regclass('public.$table');" 2>$null
  $actual = $actual.Trim()
  Test-Check "Table $table exists" "public.$table" $actual
}

# ============================================================================
# 3. RLS enabled on all new tables
# ============================================================================
Write-Host ""
Write-Host "=== ROW LEVEL SECURITY ===" -ForegroundColor Cyan
$rlsTables = @("message_reads", "message_attachments", "conversation_mutes",
  "reports", "bookmark_folders", "bookmark_folder_items",
  "post_boosts", "account_deletion_requests", "data_export_requests", "media")

foreach ($table in $rlsTables) {
  $actual = & psql "$StagingUrl" -t -c "SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='$table';" 2>$null
  $actual = $actual.Trim()
  Test-Check "RLS enabled on $table" "t" $actual
}

# ============================================================================
# 4. RLS policies exist on all new tables
# ============================================================================
Write-Host ""
Write-Host "=== RLS POLICIES ===" -ForegroundColor Cyan
$expectedPolicies = @(
  @{ Table = "message_reads"; Policy = "message_reads read by member" },
  @{ Table = "message_reads"; Policy = "message_reads insert own" },
  @{ Table = "message_reads"; Policy = "message_reads update own" },
  @{ Table = "message_attachments"; Policy = "message_attachments read by member" },
  @{ Table = "message_attachments"; Policy = "message_attachments insert by member" },
  @{ Table = "conversation_mutes"; Policy = "conversation_mutes read own" },
  @{ Table = "conversation_mutes"; Policy = "conversation_mutes insert own" },
  @{ Table = "conversation_mutes"; Policy = "conversation_mutes delete own" },
  @{ Table = "reports"; Policy = "reports insert own" },
  @{ Table = "reports"; Policy = "reports read own" },
  @{ Table = "reports"; Policy = "reports staff read" },
  @{ Table = "reports"; Policy = "reports staff update" },
  @{ Table = "bookmark_folders"; Policy = "bookmark folders own" },
  @{ Table = "bookmark_folder_items"; Policy = "bookmark folder items own" },
  @{ Table = "post_boosts"; Policy = "post_boosts owner read" },
  @{ Table = "account_deletion_requests"; Policy = "account deletion requests select own" },
  @{ Table = "data_export_requests"; Policy = "data export requests select own" },
  @{ Table = "media"; Policy = "media read own" },
  @{ Table = "media"; Policy = "media insert own" },
  @{ Table = "media"; Policy = "media delete own" }
)

foreach ($pol in $expectedPolicies) {
  $actual = & psql "$StagingUrl" -t -c "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='$($pol.Table)' AND policyname='$($pol.Policy)';" 2>$null
  $actual = $actual.Trim()
  Test-Check "Policy $($pol.Policy) on $($pol.Table)" $pol.Policy $actual
}

# ============================================================================
# 5. Storage buckets
# ============================================================================
Write-Host ""
Write-Host "=== STORAGE BUCKETS ===" -ForegroundColor Cyan
$expectedBuckets = @(
  @{ Name = "media_private"; Public = "f" },
  @{ Name = "message_attachments"; Public = "f" }
)

foreach ($bucket in $expectedBuckets) {
  $actual = & psql "$StagingUrl" -t -c "SELECT public FROM storage.buckets WHERE id='$($bucket.Name)';" 2>$null
  $actual = $actual.Trim()
  Test-Check "Bucket $($bucket.Name) exists and is private" "f" $actual
}

# ============================================================================
# 6. Storage bucket policies (read closed)
# ============================================================================
Write-Host ""
Write-Host "=== STORAGE BUCKET POLICIES ===" -ForegroundColor Cyan
$expectedStoragePolicies = @(
  @{ Bucket = "message_attachments"; Policy = "message_attachments upload own" },
  @{ Bucket = "message_attachments"; Policy = "message_attachments update own" },
  @{ Bucket = "message_attachments"; Policy = "message_attachments delete own" },
  @{ Bucket = "message_attachments"; Policy = "message_attachments read" },
  @{ Bucket = "media_private"; Policy = "media_private upload own" },
  @{ Bucket = "media_private"; Policy = "media_private update own" },
  @{ Bucket = "media_private"; Policy = "media_private delete own" },
  @{ Bucket = "media_private"; Policy = "media_private read" }
)

foreach ($pol in $expectedStoragePolicies) {
  $actual = & psql "$StagingUrl" -t -c "SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='$($pol.Policy)';" 2>$null
  $actual = $actual.Trim()
  Test-Check "Storage policy $($pol.Policy) on $($pol.Bucket)" $pol.Policy $actual
}

# Verify storage read is closed (using false)
Write-Host ""
Write-Host "=== STORAGE READ CLOSED ===" -ForegroundColor Cyan
foreach ($bucket in @("message_attachments", "media_private")) {
  $actual = & psql "$StagingUrl" -t -c "SELECT definition FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='$($bucket) read';" 2>$null
  $actual = $actual.Trim()
  if ($actual -match "using\s*\(\s*false\s*\)") {
    Write-Host "  [PASS] Storage read on $bucket is closed (using false)" -ForegroundColor Green
    $script:passed++
  } else {
    Write-Host "  [FAIL] Storage read on $bucket is NOT closed - definition: $actual" -ForegroundColor Red
    $script:failed++
  }
}

# ============================================================================
# 7. Functions expected
# ============================================================================
Write-Host ""
Write-Host "=== FUNCTIONS ===" -ForegroundColor Cyan
$expectedFunctions = @(
  "mark_messages_read", "submit_report", "notify_on_follow",
  "notify_mentions_from_content", "create_bookmark_folder",
  "consume_post_boost", "get_boost_allowance",
  "request_account_deletion", "cancel_account_deletion", "request_data_export",
  "is_current_user_blocked"
)

foreach ($func in $expectedFunctions) {
  $actual = & psql "$StagingUrl" -t -c "SELECT proname FROM pg_proc WHERE proname='$func';" 2>$null
  $actual = $actual.Trim()
  Test-Check "Function $func exists" $func $actual
}

# ============================================================================
# 8. Triggers expected
# ============================================================================
Write-Host ""
Write-Host "=== TRIGGERS ===" -ForegroundColor Cyan
$expectedTriggers = @(
  "notify_on_follow_trigger",
  "notify_mentions_on_post_trigger",
  "notify_mentions_on_reply_trigger"
)

foreach ($trigger in $expectedTriggers) {
  $actual = & psql "$StagingUrl" -t -c "SELECT tgname FROM pg_trigger WHERE tgname='$trigger';" 2>$null
  $actual = $actual.Trim()
  Test-Check "Trigger $trigger exists" $trigger $actual
}

# ============================================================================
# 9. Data integrity - no production data leaked
# ============================================================================
Write-Host ""
Write-Host "=== DATA INTEGRITY ===" -ForegroundColor Cyan

# Check profiles count (should be 0 or small synthetic set in staging)
$profileCount = & psql "$StagingUrl" -t -c "SELECT count(*) FROM public.profiles;" 2>$null
$profileCount = $profileCount.Trim()
if ([int]::TryParse($profileCount, [ref]$null)) {
  $pc = [int]$profileCount
  if ($pc -eq 0) {
    Write-Host "  [PASS] Profiles table is empty (clean staging)" -ForegroundColor Green
    $script:passed++
  } elseif ($pc -le 100) {
    Write-Host "  [PASS] Profiles table has $pc rows (small synthetic set)" -ForegroundColor Green
    $script:passed++
  } else {
    Write-Warning "Profiles table has $pc rows - verify this is synthetic data, not production"
    $script:warnings++
  }
} else {
  Test-Warning "Could not parse profile count" "$profileCount"
}

# ============================================================================
# 10. Summary
# ============================================================================
Write-Host ""
Write-Host "=== VALIDATION SUMMARY ===" -ForegroundColor Cyan
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor Red
Write-Host "  Warnings: $warnings" -ForegroundColor Yellow

# Generate validation report file
$reportDir = Join-Path $repoRoot "logs"
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir | Out-Null }
$reportFile = Join-Path $reportDir "migration-validation-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$report = [PSCustomObject]@{
  Timestamp       = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  StagingHost     = $stagingHost
  IsProduction    = $false
  Passed          = $passed
  Failed          = $failed
  Warnings        = $warnings
  Status          = if ($failed -eq 0) { "PASSED" } else { "FAILED" }
  MigrationLog    = if ($LogFile) { $LogFile } else { $null }
}
$report | ConvertTo-Json -Depth 3 | Out-File -FilePath $reportFile -Encoding utf8
Write-Host ""
Write-Host "Validation report written to: $reportFile" -ForegroundColor Cyan

if ($failed -gt 0) {
  Write-Host ""
  Write-Host "=== VALIDATION FAILED ===" -ForegroundColor Red
  exit 1
} else {
  Write-Host ""
  Write-Host "=== VALIDATION PASSED ===" -ForegroundColor Green
  Write-Host "All schema elements verified against staging."
  Write-Host ""
  Write-Host "Rerun safety: This script is read-only and safe to rerun." -ForegroundColor Cyan
  Write-Host "Previously applied migrations are handled by IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING in the migration SQL."
}
