# AfterFur Staging Environment Loader
#
# PURPOSE: Load and validate .env.staging.local for staging-only operations.
#          Never loads .env.local (production). Never falls back to production.
#
# SAFETY RULES:
#   - Only loads .env.staging.local (never .env.local).
#   - Validates all required staging variables are present.
#   - Rejects any variable that points to the production Supabase project.
#   - Exports validated variables as environment variables for caller scripts.
#   - Never prints or exposes credential values.
#
# USAGE:
#   . ./scripts/load-staging-env.ps1
#   # After sourcing, $STAGING_URL and $STAGING_SERVICE_ROLE_KEY are available.
#
#   Or with validation only:
#   . ./scripts/load-staging-env.ps1 -ValidateOnly
#

param(
  [Parameter(Mandatory = $false)]
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$envFile = Join-Path $repoRoot ".env.staging.local"

# Production host that must NEVER be used for staging
$productionHost = "kunwfddahxkpvsivmmkm.supabase.co"

# Required staging environment variables
$requiredVars = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
)

# Optional but recommended staging variables
$optionalVars = @(
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_NAME",
  "DATABASE_URL",
  "NEXT_PUBLIC_MEDIA_BUCKET",
  "MAX_IMAGE_BYTES",
  "MAX_VIDEO_BYTES",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_FROM",
  "AGE_VERIFICATION_ENABLED",
  "AGE_VERIFICATION_PROVIDER",
  "PRIME_PAYMENT_PROVIDER",
  "PRIME_PRICE_MONTHLY_GBP",
  "PRIME_PRICE_YEARLY_GBP"
)

# ============================================================================
# 1. Load .env.staging.local only
# ============================================================================
if (-not (Test-Path $envFile)) {
  Write-Error "Staging environment file not found: $envFile`n`nCreate it from .env.staging.example:`n  cp .env.staging.example .env.staging.local`nThen fill in staging-only credentials from your staging Supabase project dashboard." -ErrorAction Stop
}

Write-Host "Loading staging environment from: $envFile" -ForegroundColor Cyan

$envContents = Get-Content $envFile -ErrorAction Stop
$parsedVars = @{}

foreach ($line in $envContents) {
  # Skip comments and blank lines
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
    continue
  }

  # Parse KEY=VALUE
  if ($line -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
    $name = $matches[1]
    $value = $matches[2].Trim().Trim('"').Trim("'")
    $parsedVars[$name] = $value
  }
}

# ============================================================================
# 2. Validate required variables are present
# ============================================================================
$missingVars = @()
foreach ($var in $requiredVars) {
  if (-not $parsedVars.ContainsKey($var) -or [string]::IsNullOrWhiteSpace($parsedVars[$var])) {
    $missingVars += $var
  }
}

if ($missingVars.Count -gt 0) {
  Write-Error "Missing required staging variables in $envFile:`n  $($missingVars -join ", ")`n`nFill these in from your staging Supabase project dashboard." -ErrorAction Stop
}

Write-Host "  [OK]   All required staging variables present" -ForegroundColor Green

# ============================================================================
# 3. Reject production host references
# ============================================================================
$stagingUrl = $parsedVars["NEXT_PUBLIC_SUPABASE_URL"]

if ($stagingUrl -match $productionHost) {
  Write-Error "REFUSING: NEXT_PUBLIC_SUPABASE_URL points to production host: $productionHost`nStaging must use a separate Supabase project." -ErrorAction Stop
}

# Also reject any supabase.co URL that looks like a production project ref
# Production project refs are typically 22-char alphanumeric + .supabase.co
if ($stagingUrl -match "https://[a-z0-9]{22}\.supabase\.co") {
  Write-Warning "WARNING: NEXT_PUBLIC_SUPABASE_URL looks like a Supabase project reference. Verify this is your STAGING project, not production."
}

Write-Host "  [OK]   Staging URL is not production host" -ForegroundColor Green

# ============================================================================
# 4. Check optional variables and warn if missing
# ============================================================================
$missingOptional = @()
foreach ($var in $optionalVars) {
  if (-not $parsedVars.ContainsKey($var) -or [string]::IsNullOrWhiteSpace($parsedVars[$var])) {
    $missingOptional += $var
  }
}

if ($missingOptional.Count -gt 0) {
  Write-Warning "Optional staging variables not set (non-critical for migration rehearsal):"
  $missingOptional | ForEach-Object { Write-Warning "  - $_" }
}

# ============================================================================
# 5. Export validated variables
# ============================================================================
$script:STAGING_URL = $stagingUrl
$script:STAGING_SERVICE_ROLE_KEY = $parsedVars["SUPABASE_SERVICE_ROLE_KEY"]

# Export as environment variables for child processes
$env:NEXT_PUBLIC_SUPABASE_URL = $stagingUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $parsedVars["SUPABASE_SERVICE_ROLE_KEY"]

Write-Host ""
Write-Host "=== STAGING ENVIRONMENT LOADED ===" -ForegroundColor Green
Write-Host "  URL: $($stagingUrl.Substring(0, 30))..." -ForegroundColor Gray
Write-Host "  Service role key: [REDACTED]" -ForegroundColor Gray
Write-Host ""

if ($ValidateOnly) {
  Write-Host "Validation complete. Staging environment is ready." -ForegroundColor Green
  exit 0
}
