# AfterFur Privacy Regression Fix – Public Profiles Incorrectly Blocked

## Root Cause

A public profile with `is_private = false` (or NULL) was being classified as private because the **settings page never loaded the `is_private` value from the database**.

### Bug 1: `isPrivate` state never populated from DB

`src/app/settings/page.tsx` line 38:
```ts
const [isPrivate, setIsPrivate] = useState(false);
```

The `isPrivate` state was initialized to `false` and **never updated** from the actual database value. The existing `useEffect` that loads profile data (around line 121) selected only `display_name, username, profile_customisation` — it did **not** select `is_private`.

**Impact:**
- If a user's profile had `is_private = true` in the database, the checkbox showed **unchecked** (because `isPrivate` state was `false`).
- The user believed their profile was public, but it was actually private.
- When any visitor (logged-out or authenticated non-follower) viewed that profile, the API returned 403, and ProfileClient displayed: "Could not load this profile: This profile is private."

### Bug 2: Outdated disclaimer

`src/app/settings/page.tsx` line 292 displayed:
> "Privacy controls are documented in the Privacy Policy. Blocking and visibility enforcement are not yet implemented."

This was incorrect — Stage 21B implemented profile and post privacy enforcement.

## Changes Made

### 1. `src/app/settings/page.tsx`

**Fixed disclaimer** (line 292):
- Removed: "Privacy controls are documented in the Privacy Policy. Blocking and visibility enforcement are not yet implemented."
- Added: "When your account is private, only you and your approved followers can view your profile and posts. Public accounts are visible to everyone."

**Fixed `is_private` loading**:
- Added `is_private` to the profiles select query in the existing `useEffect`:
  ```ts
  void supabase.from("profiles").select("display_name, username, profile_customisation, is_private").eq("id", user.id).maybeSingle()
  ```
- Added `setIsPrivate(!!data.is_private)` so the checkbox reflects the actual saved database value. NULL values default to `false` (public).

### 2. No changes to privacy enforcement logic

The following files were **reviewed and confirmed correct** — no changes needed:
- `src/lib/profilePrivacy.ts` — `canViewProfile()` correctly returns `true` for public profiles (`!isPrivate`), owner access, and accepted followers for private profiles.
- `src/lib/profiles.server.ts` — `getProfileForViewer()` correctly passes `!!profile.is_private` to `canViewProfile`, handles blocks and follow status.
- `src/app/api/profile/[username]/route.ts` — correctly returns 403 for forbidden, 404 for not found.
- `src/app/[username]/ProfileClient.tsx` — correctly handles 403/404 responses from the API.

## Regression Tests Added

`src/lib/profiles.server.test.ts` — 11 new tests:

| Test | Scenario | Expected |
|------|----------|----------|
| Logged-out visitor views public profile | viewerId=null, is_private=false | Allowed |
| Authenticated user views public profile | viewerId!=owner, is_private=false | Allowed |
| Unauthenticated access to private profile | viewerId=null, is_private=true | Forbidden |
| Owner views own private profile | viewerId=ownerId, is_private=true | Allowed |
| Approved follower views private profile | followStatus=accepted, is_private=true | Allowed |
| NULL is_private treated as public | is_private=null, viewerId=null | Allowed (isPrivate=false) |
| Stranger denied private profile | followStatus=none, is_private=true | Forbidden |
| Blocked user denied access | blocked=true, is_private=false | Forbidden |

Existing tests in `profilePrivacy.test.ts` (13 tests) continue to pass.

## Verification

- TypeScript: `tsc --noEmit` clean
- Tests: 327 passed across 32 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue)
- Production build: `next build --turbopack` completed successfully

## Behavior After Fix

| Profile Type | Viewer | Access |
|-------------|--------|--------|
| Public (`is_private=false`) | Logged-out visitor | Allowed |
| Public | Authenticated non-follower | Allowed |
| Public | Owner | Allowed |
| Private (`is_private=true`) | Owner | Allowed |
| Private | Approved follower | Allowed |
| Private | Pending/rejected follower | Denied |
| Private | Non-follower | Denied |
| Private | Logged-out visitor | Denied |
| Any | Blocked by owner | Denied |

The "Private account" checkbox in settings now correctly reflects the saved `is_private` value, and unchecking + saving makes the profile public again.
