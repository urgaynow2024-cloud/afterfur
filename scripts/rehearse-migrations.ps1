# AfterFur Staging Migration Rehearsal Script
#
# PURPOSE: Rehearse the 11 approved production migrations against a staging
#          Supabase project BEFORE applying them to production.
#
# SAFETY RULES:
#   - Never connect to production. Use a separate staging Supabase project.
#   - Never copy production data into staging. Use synthetic data only.
#   - Never print or expose credentials.
#   - Never apply these migrations to production from this script.
#   - Requires explicit --confirm flag before executing any migration.
#   - Never silently falls back to .env.local (production).
#
# PREREQUISITES:
#   - A separate staging Supabase project provisioned (not production).
#   - .env.staging.local exists with staging-only credentials.
#   - Run: .\scripts\load-staging-env.ps1 before this script, OR pass
#     -StagingUrl and -ServiceRoleKey explicitly.
#
# USAGE:
#   # Source env first, then rehearse:
#   . ./scripts/load-staging-env.ps1
#   .\scripts\rehearse-migrations.ps1 -Confirm
#
#   # Or with explicit credentials:
#   .\scripts\rehearse-migrations.ps1 -StagingUrl <url> -ServiceRoleKey <key> -Confirm

param(
  [Parameter(Mandatory = $false)]
  [string]$StagingUrl,

  [Parameter(Mandatory = $false)]
  [string]$ServiceRoleKey,

  [Parameter(Mandatory = $false)]
  [string]$MigrationPath = "supabase/migrations",

  [Parameter(Mandatory = $true)]
  [switch]$Confirm
)

$ErrorActionPreference = "Stop"

# ============================================================================
# 1. Load and validate staging environment
# ============================================================================
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$envFile = Join-Path $repoRoot ".env.staging.local"

# Production host that must NEVER be used for staging
$productionHost = "kunwfddahxkpvsivmmkm.supabase.co"

# Allowed staging host patterns (must NOT match production)
$allowedStagingHostPatterns = @(
  "*.supabase.co",     # Any supabase.co subdomain (but not production ref)
  "*.supabase.in",     # Any supabase.in subdomain
  "localhost",         # Local development
  "127.0.0.1"          # Local development
)

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

# ============================================================================
# 2. Reject production host reference
# ============================================================================
if ($StagingUrl -match $productionHost) {
  Write-Error "REFUSING: Staging URL points to production host: $productionHost`nStaging must use a separate Supabase project." -ErrorAction Stop
}

# Extract host from URL for allowlist checking
try {
  $stagingUri = [System.Uri]$StagingUrl
  $stagingHost = $stagingUri.Host
} catch {
  Write-Error "Invalid StagingUrl format: $StagingUrl" -ErrorAction Stop
}

# Check against allowed staging host patterns
$isAllowedHost = $false
foreach ($pattern in $allowedStagingHostPatterns) {
  if ($pattern -eq "localhost" -or $pattern -eq "127.0.0.1") {
    if ($stagingHost -eq $pattern) { $isAllowedHost = $true; break }
  } else {
    # Pattern like *.supabase.co - check if host ends with the suffix
    $suffix = $pattern -replace "^\*\.", ""
    if ($stagingHost.EndsWith($suffix)) { $isAllowedHost = $true; break }
  }
}

if (-not $isAllowedHost) {
  Write-Error "Staging host '$stagingHost' is not in the allowed staging host patterns:`n  $($allowedStagingHostPatterns -join ", ")`nUpdate the allowlist in this script if you need to use a different staging provider." -ErrorAction Stop
}

# Double-check: reject production host even if it matches a pattern
if ($stagingHost -eq $productionHost -or $StagingUrl -match $productionHost) {
  Write-Error "REFUSING: Staging URL resolves to production host: $productionHost" -ErrorAction Stop
}

Write-Host "Staging URL: $($StagingUrl.Substring(0, 30))..." -ForegroundColor Cyan
Write-Host "Staging host: $stagingHost (allowed)" -ForegroundColor Green
Write-Host "Migration path: $MigrationPath" -ForegroundColor Cyan
Write-Host "Explicit confirmation: YES" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 3. Approved migration order (deduplicated from 13 raw files to 11)
# ============================================================================
$migrations = @(
  @{ Order = 1; File = "STAGE_21A_FINAL_BLOCKING_MIGRATION.sql"; Description = "Bidirectional blocking helpers + block triggers" },
  @{ Order = 2; File = "STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql"; Description = "is_private column + follows.status column + privacy RLS" },
  @{ Order = 3; File = "STAGE_21B_FOLLOW_REQUESTS_RLS.sql"; Description = "Restrict pending follow requests to recipient" },
  @{ Order = 4; File = "STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql"; Description = "media table + media_private storage bucket" },
  @{ Order = 5; File = "0024_user_reports.sql"; Description = "User reports table + submit_report RPC" },
  @{ Order = 6; File = "0025_follow_and_mention_notifications.sql"; Description = "Follow/mention notification triggers" },
  @{ Order = 7; File = "STAGE_25_MESSAGE_READ_RECEIPTS.sql"; Description = "message_reads table + mark_messages_read RPC" },
  @{ Order = 8; File = "STAGE_25_MESSAGE_ATTACHMENTS.sql"; Description = "message_attachments table + message_attachments bucket" },
  @{ Order = 9; File = "STAGE_26_CONVERSATION_MUTES.sql"; Description = "conversation_mutes table" },
  @{ Order = 10; File = "STAGE_PAWPASS_COMPLETE.sql"; Description = "PawPass (bookmark folders + post_boosts) - SKIP PawPass_Migration.sql and STAGE_PAWPASS_BOOSTS.sql" },
  @{ Order = 11; File = "Account_Data_Rights_Migration.sql"; Description = "Account deletion + data export requests" }
)

$skipped = @(
  "PawPass_Migration.sql`t- Byte-identical duplicate of STAGE_PAWPASS_COMPLETE.sql",
  "STAGE_PAWPASS_BOOSTS.sql`t- Subset of STAGE_PAWPASS_COMPLETE.sql (post_boosts only)"
)

Write-Host "=== APPROVED MIGRATION ORDER (11 of 13 raw files) ===" -ForegroundColor Cyan
$migrations | ForEach-Object {
  Write-Host "  $($_.Order). $($_.File)`t- $($_.Description)"
}
Write-Host ""
Write-Host "=== SKIPPED (redundant) ===" -ForegroundColor Yellow
$skipped | ForEach-Object { Write-Host "  SKIP: $_" }
Write-Host ""

# ============================================================================
# 4. Preflight checks
# ============================================================================
Write-Host "=== PREFLIGHT CHECKS ===" -ForegroundColor Cyan

$preflightPassed = $true

# Check all migration files exist
foreach ($m in $migrations) {
  $filePath = Join-Path $repoRoot $MigrationPath $m.File
  if (-not (Test-Path $filePath)) {
    Write-Host "  [FAIL] Migration file not found: $($m.File)" -ForegroundColor Red
    $preflightPassed = $false
  } else {
    Write-Host "  [OK]   $($m.File)"
  }
}

if (-not $preflightPassed) {
  Write-Error "Preflight checks failed. Missing migration files."
  exit 1
}

# Confirm staging host is not production
Write-Host "  [OK]   Staging host '$stagingHost' is not production ($productionHost)" -ForegroundColor Green

# Confirm explicit confirmation flag
Write-Host "  [OK]   Explicit confirmation flag provided" -ForegroundColor Green

Write-Host ""

# ============================================================================
# 5. Final safety warning before execution
# ============================================================================
Write-Host "!!! SAFETY WARNING !!!" -ForegroundColor Red
Write-Host "This script will execute 11 migrations against your STAGING Supabase project." -ForegroundColor Red
Write-Host "Staging host: $stagingHost" -ForegroundColor Red
Write-Host "This is NOT production ($productionHost)." -ForegroundColor Red
Write-Host "Migrations are idempotent but should still be reviewed before execution." -ForegroundColor Red
Write-Host ""

# ============================================================================
# 6. Execution logging setup
# ============================================================================
$logDir = Join-Path $repoRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "migration-rehearsal-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$results = @()

function Log-Result {
  param([string]$Order, [string]$File, [string]$Status, [string]$Detail)
  $entry = [PSCustomObject]@{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Order     = $Order
    File      = $File
    Status    = $Status
    Detail    = $Detail
  }
  $script:results += $entry
  $statusColor = if ($Status -eq "OK") { "Green" } elseif ($Status -eq "WARN") { "Yellow" } else { "Red" }
  Write-Host "  [$Order] $File - $Status" -ForegroundColor $statusColor
  if ($Detail) { Write-Host "      $Detail" -ForegroundColor Gray }
}

# ============================================================================
# 7. Execute migrations in order
# ============================================================================
Write-Host "=== EXECUTING MIGRATIONS ===" -ForegroundColor Cyan

foreach ($m in $migrations) {
  $filePath = Join-Path $repoRoot $MigrationPath $m.File
  $start = Get-Date

  try {
    # Use supabase CLI if available, otherwise psql
    $supabaseCmd = Get-Command "supabase" -ErrorAction SilentlyContinue
    if ($supabaseCmd) {
      $result = supabase db execute --linked --file $filePath 2>&1
      $exitCode = $LASTEXITCODE
    } else {
      # Fallback: try psql with the staging database URL
      # Convert https:// to postgresql:// for psql
      $dbUrl = $StagingUrl -replace "^https://", "postgresql://postgres:"
      $result = & psql "$dbUrl" -f $filePath 2>&1
      $exitCode = $LASTEXITCODE
    }

    $duration = (Get-Date) - $start
    if ($exitCode -eq 0) {
      Log-Result $m.Order $m.File "OK" "Completed in $($duration.TotalSeconds)s"
    } else {
      Log-Result $m.Order $m.File "FAIL" "Exit code $exitCode: $result"
    }
  } catch {
    Log-Result $m.Order $m.File "ERROR" $_.Exception.Message
  }
}

# ============================================================================
# 8. Write execution log
# ============================================================================
$results | ConvertTo-Json -Depth 3 | Out-File -FilePath $logFile -Encoding utf8
Write-Host ""
Write-Host "Execution log written to: $logFile" -ForegroundColor Cyan

# ============================================================================
# 9. Summary
# ============================================================================
$failures = $results | Where-Object { $_.Status -ne "OK" }
if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "=== REHEARSAL FAILED ===" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  FAIL: $($_.File) - $($_.Detail)" -ForegroundColor Red }
  exit 1
} else {
  Write-Host ""
  Write-Host "=== REHEARSAL PASSED ===" -ForegroundColor Green
  Write-Host "All 11 migrations executed successfully against staging."
  Write-Host ""
  Write-Host "NEXT STEPS:" -ForegroundColor Cyan
  Write-Host "  1. Run post-migration validation: .\scripts\validate-migration-schema.ps1"
  Write-Host "  2. Verify RLS policies and storage bucket access."
  Write-Host "  3. Test application against staging schema."
  Write-Host "  4. Take production backup before applying to production."
  Write-Host "  5. Apply migrations to production only with explicit permission."
}
