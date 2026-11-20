# Bluesky vs AfterFur: Reference Implementation Comparison Report

**Status:** Audit only — no files modified, no implementation started. Awaiting approval before any changes.

**Reference archive:** `Ref/bluesky/` (read-only)
**Subject:** `AfterFur` Next.js + Supabase application

---

## 1. Reference Archive Inventory

### 1.1 Top-level files in `Ref/bluesky/`

| File | Purpose | Relevance to AfterFur |
|------|---------|----------------------|
| `README.md` | Project overview, contribution/forking guidelines | Establishes that this is a **React Native** (Expo) app, not Next.js. Forking guidelines require rebranding and replacement of licensed assets. |
| `LICENSE` | MIT license for source code | Covers source only; does not cover brand assets, icons, fonts, artwork. |
| `NOTICE.md` | Third-party attribution notices | Material Icons (Apache 2.0), Inter/Noto Sans (OFL 1.1), country-flag-icons (MIT). These fonts/icons must NOT be copied into AfterFur. |
| `src/` | Source tree (3 top-level dirs) | Contains the reference implementations reviewed below. |

### 1.2 Source tree inventory (`src/`)

```
src/
├── features/
│   └── followingV2/
│       └── home/
│           ├── anchorCorrection.test.ts / .ts
│           ├── api/                          (feed API helpers)
│           ├── FeedPage.tsx                  (feed page container)
│           ├── GapRow.tsx / gapRowStatus.ts  (gap-filling UI)
│           ├── Home.tsx                      (home screen shell)
│           ├── index.test.tsx / index.tsx
│           ├── mixSamples.test.ts / .ts      (saved-feed sample mixing)
│           ├── PostFeed.tsx                  (virtualised feed list, 1524 lines)
│           ├── PrependPill.tsx               (new-posts pill)
│           ├── queries/
│           │   ├── followingSnapshot.test.ts / .ts
│           │   ├── postFeed.test.tsx / .ts   (react-query feed queries)
│           │   ├── savedFeedSamples.test.tsx / .ts
│           └── useAnchorCorrectionScrollHandlers.ts
│           ├── useListRest.ts
│           ├── useNewPostsCheck.test.ts / .ts (polling for new posts)
│           ├── usePrependPill.test.ts / .ts
│           ├── useSettleAtTop.ts
│           └── useSettleScrollHandlers.ts
├── screens/
│   ├── Profile/
│   │   ├── components/GermButton.tsx
│   │   ├── ErrorState.tsx
│   │   ├── KnownFollowers.tsx
│   │   ├── ProfileFollowers.tsx
│   │   ├── ProfileFollows.tsx
│   │   ├── ProfileLabelerLikedBy.tsx
│   │   ├── ProfileSearch.tsx
│   │   ├── Header/
│   │   │   ├── DisplayName.tsx
│   │   │   ├── EditProfileDialog.tsx
│   │   │   ├── GrowableAvatar.tsx
│   │   │   ├── GrowableBanner.tsx
│   │   │   ├── Handle.tsx
│   │   │   ├── index.tsx            (ProfileHeader, MinimalHeader)
│   │   │   ├── layout.test.ts / .ts
│   │   │   ├── Metrics.tsx          (follower/following counts)
│   │   │   ├── ProfileHeaderLabeler.tsx
│   │   │   ├── ProfileHeaderStandard.tsx
│   │   │   ├── PronounsDialog.tsx
│   │   │   ├── pronunSuggestions.test.ts / .ts
│   │   │   ├── Shell.tsx
│   │   │   ├── StatusBarShadow.tsx / .web.tsx
│   │   │   └── SuggestedFollows.tsx
│   │   └── Sections/
│   │       ├── Feed.tsx             (ProfileFeedSection)
│   │       ├── Labels.tsx
│   │       └── types.ts             (SectionRef)
│   └── Settings/
│       ├── AboutSettings.tsx
│       ├── AccessibilitySettings.tsx
│       ├── AccountSettings.tsx      (email, password, handle, birthday, deactivate, delete)
│       ├── ActivityPrivacySettings.tsx (notification subscriptions)
│       ├── AppearanceSettings.tsx   (color mode, dark theme, font, font size)
│       ├── AppIconSettings/
│       ├── AppPasswords.tsx
│       ├── AutomationLabelSettings.tsx
│       ├── BetaFeaturesSettings.tsx
│       ├── components/
│       │   ├── __tests__/
│       │   ├── AddAppPasswordDialog.tsx
│       │   ├── AlgoVisibilityOptOut.tsx
│       │   ├── BetaFeaturesFeedbackDialog.tsx
│       │   ├── ChangeHandleDialog.tsx
│       │   ├── ChangePasswordDialog.tsx
│       │   ├── CopyButton.tsx
│       │   ├── DeactivateAccountDialog.tsx
│       │   ├── DeleteAccountDialog.tsx
│       │   ├── DisableEmail2FADialog.tsx
│       │   ├── Email2FAToggle.tsx
│       │   ├── ExportCarDialog.tsx
│       │   ├── GrowthbookDialog.tsx
│       │   ├── OTAInfo.tsx / .web.tsx
│       │   ├── PwiOptOut.tsx
│       │   └── SettingsList.tsx     (shared settings list primitives)
│       ├── ContentAndMediaSettings.tsx
│       ├── ExternalMediaPreferences.tsx
│       ├── FindContactsSettings.tsx
│       ├── FollowingFeedPreferences.tsx
│       ├── InterestsSettings.tsx
│       ├── LanguageSettings.tsx
│       ├── LegacyNotificationSettings.tsx
│       ├── NotificationSettings/
│       │   ├── ActivityNotificationSettings.tsx
│       │   ├── components/
│       │   │   └── ItemTextWithSubtitle.tsx
│       │   └── index.tsx
│       ├── PrivacyAndSecuritySettings.tsx (2FA, app passwords, notification declaration, algo opt-out, PWI opt-out)
│       ├── Settings.tsx             (settings root)
│       ├── ThreadPreferences.tsx
│       └── view/screens/Profile.tsx (web profile screen wrapper)
└── view/
    ├── com/
    │   └── home/
    │       ├── HomeHeader.tsx
    │       ├── HomeHeaderLayout.tsx / .web.tsx
    │       └── HomeHeaderLayoutMobile.tsx
    └── screens/
        └── Profile.tsx
```

**Important:** This is **not** a standalone runnable Next.js application. It is a React Native (Expo) codebase that depends on:
- `@react-navigation/native`, `@react-navigation/native-stack`
- `react-native`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-worklets`
- `@tanstack/react-query`
- `@lingui/core`, `@lingui/react` (i18n)
- `@bsky/sdk` / `@atproto/api` (AT Protocol)
- `expo` and Expo modules
- Custom alias `#/` resolving to the repo root

None of these runtime dependencies exist in AfterFur (`package.json` shows Next.js 16, React 19, Supabase JS, Tailwind, Vitest, Playwright). **Patterns may be adapted; code cannot be copied directly.**

### 1.3 Bluesky-specific dependencies / functionality that MUST NOT be copied

| Item | Reason |
|------|--------|
| `@bsky/sdk`, `@atproto/api`, `app.bsky.*` lexicons | AT Protocol data layer; AfterFur uses Supabase/PostgreSQL. |
| `react-native`, `react-native-reanimated`, `@react-navigation/*` | Mobile-only UI toolkit; AfterFur is a Next.js web app. |
| `@lingui/*` i18n macros | AfterFur has no i18n setup. |
| `assets/icons/`, `assets/fonts/inter/`, Material Icons font | Third-party licensed; NOT covered by MIT. Forking guidelines explicitly require replacing icons and fonts. |
| `assets/illustrations/` | Commissioned artwork licensed to Bluesky alone. |
| Bluesky logo, app icons, brand assets | Trademarks, not licensed with the code. |
| `bskyweb/` Go web service | Server-side rendering for RN Web; not applicable. |
| Age assurance / PawPass-style native banners tied to atproto | AfterFur has its own age-verification and PawPass systems in Supabase. |
| Moderation shadow filtering via `moderateProfile` / `app.bsky.labeler` | atproto-specific; AfterFur has its own moderation + RLS. |

---

## 2. Bluesky Architecture Overview

### 2.1 Stack and paradigm
- **React Native (Expo)** mobile app with a React Native Web build served by a small Go service (`bskyweb/`).
- **Navigation:** `@react-navigation` stack/tab navigators; screens are route-based components.
- **Data:** AT Protocol via `@bsky/sdk`; queries managed with `@tanstack/react-query`; session state via custom `#/state/session`.
- **Styling:** `react-native` `StyleSheet` + a custom design-token system (`#/alf` atoms, themes).
- **Animation:** `react-native-reanimated` worklets (shared values, animated styles, `withTiming`, `useAnimatedReaction`).
- **i18n:** `@lingui` (`msg` macro, `Trans`, `useLingui`).
- **Analytics:** custom `#/analytics` with feature flags and metrics.

### 2.2 Feed architecture (`features/followingV2/home/`)
- **`FeedPage.tsx`**: page container. Handles focus/adjacency, soft-reset (scroll-to-top + refresh on tab return), compose FAB, "load new posts" button, home badge.
- **`PostFeed.tsx`** (1524 lines): the core virtualised feed. Builds a `FeedRow[]` array (loading/empty/error/sliceItem/videoGridRow/interstitial/gap/ageAssuranceBanner/composerPrompt/etc.), renders via `react-native` `List` (FlatList equivalent). Features:
  - **Anchored scrolling** (`useSettleAtTop`, `useSettleScrollHandlers`, `useListRest`): when the reader is at the top, new posts are prepended above without jumping the view; a "new posts pill" offers them.
  - **New-posts polling** (`useNewPostsCheck`): focus/return/interval-triggered checks (`FOCUS_CHECK_AFTER=60s`, `RETURN_STALE_AFTER=2min`, `CHECK_LATEST_AFTER=30s`) that light a pill/dot instead of force-refreshing.
  - **Gap filling** (`GapRow`, `findGaps`, `usePostFeedGapFill`): skipped pages can be filled in later.
  - **Saved-feed sample mixing** (`mixSamples`): inserts sampled posts into the feed.
  - **Interstitials**: progress guides, suggested follows, trending topics/videos, composer prompts, age-assurance banners, live-event banners.
  - **Thread handling**: incomplete threads show first + "view full thread" + last child.
  - **Moderation shadow filtering** (`usePostAuthorShadowFilter`): blocks/muted authors are skipped server-side via query `select`.
- **`queries/postFeed.ts`**: react-query feed queries (`usePostFeedQuery`, `usePostFeedRefresh`, `usePostFeedPrepend`, `usePostFeedSettle`, `usePostFeedGapFill`, `usePostFeedFetcher`). Query key `RQKEY(feed)`.
- **`Home.tsx`**: home screen; `view/com/home/HomeHeader*` provides the sticky header with feed tabs.

### 2.3 Profile architecture (`screens/Profile/`)
- **`Header/index.tsx`**: `ProfileHeader` (memoised). Renders `ProfileHeaderStandard` or `ProfileHeaderLabeler` depending on whether the profile is a labeler. Includes `MinimalHeader` (collapsing header on scroll, reanimated, opacity/translate animation), `GrowableAvatar`, `GrowableBanner`, `DisplayName`, `Handle`, `Metrics`, `EditProfileDialog`, `PronounsDialog`, `ProfileHeaderLabeler`, `SuggestedFollows`, `StatusBarShadow`.
- **`Sections/Feed.tsx`**: `ProfileFeedSection` — wraps `PostFeed` for a profile feed, with scroll-to-top, empty state, "load new posts" button.
- **`Sections/types.ts`**: `SectionRef { scrollToTop }`.
- **`ProfileFollowers.tsx` / `ProfileFollows.tsx`**: dedicated followers/following screens.
- **`KnownFollowers.tsx`**, `ProfileLabelerLikedBy.tsx`, `ProfileSearch.tsx`: supporting profile screens.

### 2.4 Settings architecture (`screens/Settings/`)
- **Root** `Settings.tsx` with dedicated screens per concern:
  - `AccountSettings.tsx`: email (verify/update), password, handle, birthday, age-assurance card, automation label, export data, deactivate, delete. Each action opens a dialog (`ChangeHandleDialog`, `ChangePasswordDialog`, `DeactivateAccountDialog`, `DeleteAccountDialog`, `ExportCarDialog`, `BirthDateSettingsDialog`).
  - `AppearanceSettings.tsx`: color mode (system/light/dark), dark theme (dim/dark), font family (system/theme), font scale (smaller/default/larger). Uses `SegmentedControl` radio groups and `SettingsList` primitives.
  - `PrivacyAndSecuritySettings.tsx`: 2FA toggle, app passwords (with count badge), notification subscriptions (allow others to be notified), algorithmic visibility opt-out, "personal web inclusion" (PWI) opt-out, plus a tip admonition about public network exposure.
  - `ActivityPrivacySettings.tsx`: radio-group toggle for who can subscribe to notifications (anyone who follows me / mutuals / no one), with query + mutation (`useNotificationDeclarationQuery`/`Mutation`).
  - `ContentAndMediaSettings.tsx`: manage saved feeds, thread preferences, following-feed preferences, external media, interests, in-app browser, autoplay videos/GIFs, trending topics/videos toggles.
  - `AccessibilitySettings.tsx`: require alt text before posting, larger alt text badges, haptics (native only).
  - `NotificationSettings/`: per-activity notification preferences.
- **Shared primitives**: `SettingsList.Container/Group/Item/ItemIcon/ItemText/BadgeText/BadgeButton/Chevron/PressableItem/LinkItem/Divider`, `Toggle.Group/Toggle.Item/Toggle.Radio/Toggle.LabelText/Toggle.Platform`, `SegmentedControl`, `Admonition`, `Loader`, `CopyButton`.

---

## 3. AfterFur Implementation Inventory

### 3.1 Feature areas and current files

| Feature | AfterFur files | Summary |
|---------|---------------|---------|
| Home page / feed | `src/app/page.tsx` (677 lines), `src/lib/feed.ts`, `src/components/PostCard.tsx`, `src/components/PostInteractionProvider.tsx` | Single client component handles feed loading, following filter, composer, post create/edit/delete, spotlight creator rail, IntersectionObserver pagination ("Load older posts"), manual refresh button. No polling, no new-posts indicator, no anchored scroll. |
| Post cards | `src/components/PostCard.tsx` (494 lines), `src/components/post/post-media.tsx`, `src/components/post/media-item.tsx`, `src/components/post/private-media-grid.tsx`, `src/components/post/private-media-item.tsx`, `src/components/PostInteractionProvider.tsx`, `src/components/PostInteractionGate.tsx`, `src/components/post/MediaComposer.tsx`, `src/components/PostText.tsx` | PostCard handles like/repost/bookmark with optimistic counts, report/share dialogs, PawPass boost, edit/delete, media, timestamps, profile customisation styling. |
| Profile header | `src/app/[username]/ProfileClient.tsx` (723 lines, inline header), `src/components/profile/profile-header.tsx` (reusable but not used by ProfileClient), `src/components/profile/profile-types.ts`, `src/components/profile/styled-name.tsx`, `src/components/profile/profile-links.tsx`, `src/components/profile/profile-overflow-menu.tsx` | ProfileClient embeds the header inline (banner, avatar, name, bio, links, counts, follow/block buttons, report). `profile-header.tsx` is a separate reusable component with similar surface plus block/unblock, copy link, share. |
| Profile tabs | `src/components/profile/profile-tabs.tsx` (51 lines), inline tabs in `ProfileClient.tsx` | Posts/replies/reposts/media/likes tabs; sticky positioned; media tab has photos/gifs/videos filter + PrivateMediaGrid. |
| Profile feed | `src/components/profile/profile-feed.tsx` (115 lines), `ProfileClient.tsx` | Renders PostCard per tab; media tab uses PrivateMediaGrid. No virtualisation, no pagination on profile. |
| Followers / following | `src/app/[username]/ProfileClient.tsx` (`openList` modal dialog), `src/lib/follow.ts`, `src/lib/followRequests.ts` | Modal dialog listing followers/following with avatar, name, username, unblock button. No dedicated screens. |
| Account settings | `src/app/settings/page.tsx` (822 lines, all-in-one), `src/app/account-security/page.tsx` (policy page only), `src/lib/accountSessions.ts`, `src/lib/pawpass.ts` | Single settings page with sidebar sections: account, security, privacy, blocked-accounts, notifications, accessibility, appearance, pawpass, account-data. Server actions via Supabase client + RPC. |
| Appearance | `src/app/settings/page.tsx` (appearance section: theme select, accent color input, ProfileCustomisationStudio), `src/lib/afterDark.ts`, `src/globals.css` | Theme (default/dark/light) + accent color stored via `get_my_ui_preferences`/`update_ui_preferences` RPC. No system dark mode, no font scaling, no segmented control UI. |
| Privacy & security | `src/lib/postPrivacy.ts`, `src/lib/profilePrivacy.ts`, `src/app/settings/page.tsx` (private account toggle, follow requests, blocked accounts, data export, deletion), `src/app/account-security/page.tsx`, `src/components/ReportDialog.tsx`, `src/components/moderation/*` | `canViewProfile`/`canViewPost` server-enforced privacy logic; RLS policies; private account; follow requests; blocks; data export; scheduled deletion. Account security page is a policy stub. |
| Shared components | `src/components/Shell.tsx`, `src/components/ui/{avatar,button,card,media-viewer,separator,skeleton}.tsx`, `src/components/BadgeList.tsx`, `src/components/EmptyState` (in Shell) | Shell provides layout, nav, composer, account menu. ui/ has primitives. No dedicated SettingsList/Toggle/SegmentedControl primitives. |
| Auth / session | `src/components/AuthProvider.tsx`, `src/lib/supabase/{client,server,activeClient,database.types}.ts`, `src/middleware.ts` | Supabase auth, server client, middleware. |
| Database / schema | `supabase/migrations/` (82 files), `src/lib/supabase/database.types.ts` | Posts, profiles, follows, blocks, likes, replies, reports, notifications, moderation, age verification, PawPass, data export, account deletion. |

### 3.2 What AfterFur does well (should be preserved / enhanced, not replaced)
- **Server-enforced privacy:** `canViewProfile`/`canViewPost` (`src/lib/profilePrivacy.ts`, `src/lib/postPrivacy.ts`) + RLS. Privacy is never client-only. This is a strength vs. naive client-side filtering.
- **PostCard:** fairly complete interaction surface (like/repost/bookmark/report/share/edit/delete/boost) with optimistic counts.
- **Settings all-in-one page:** functional, searchable, sectioned, with responsive list/detail columns.
- **Profile media grid + filters:** photos/gifs/videos filter already exists.
- **Followers/following modal:** functional, with block/unblock.
- **Age verification / PawPass:** integrated membership and age-assurance system (must remain untouched).
- **Moderation:** reports, moderation centre, RLS hardening (must remain untouched).

### 3.3 Gaps vs. Bluesky
- No react-query / server-state cache; feed uses manual `useState` + `useEffect`.
- No new-posts polling or "new posts" pill/dot; user must press "Load older posts" or refresh.
- No anchored scroll-position preservation on prepend.
- Feed pagination is a "Load older posts" button + IntersectionObserver; no end-of-feed marker.
- Profile header is inline in `ProfileClient.tsx`; no collapsing/minimal header on scroll.
- Profile tabs lack dedicated followers/following screens (modal only).
- Settings is one monolithic page; no dedicated screens per area (2FA, app passwords, notification declaration, algo opt-out, PWI opt-out, content/media).
- No `SettingsList`/`Toggle`/`SegmentedControl` shared primitives; settings UI is hand-rolled per section.
- Appearance lacks system color mode, dark theme variants, font family/scale.
- No interstitials (progress guides, suggested follows, trending) — but these are engagement features, not core.
- No `Load latest` / pull-to-refresh equivalent beyond the manual refresh button.

---

## 4. Feature-by-Feature Comparison

### 4.1 Home page and feed experience

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/features/followingV2/home/FeedPage.tsx`, `PostFeed.tsx`, `queries/postFeed.ts`, `useNewPostsCheck.ts`, `usePrependPill.ts`, `useSettleAtTop.ts`, `view/com/home/HomeHeader*.tsx` |
| **AfterFur implementation** | `src/app/page.tsx`, `src/lib/feed.ts` |
| **Current functionality** | Feed loads visible posts (moderation filter), following/for-you tabs, composer, post create/edit/delete, spotlight creator rail, "Load older posts" button + IntersectionObserver, manual refresh, private-account following filter. |
| **Differences** | Bluesky: react-query cache, polling for new posts (30s interval + focus/return triggers), new-posts pill, anchored scroll position preservation, gap filling, saved-feed samples, interstitials, load-latest button, end-of-feed marker. AfterFur: manual state, no polling, no pill, no anchored scroll, "Load older posts" button only. |
| **Improvements** | Add new-posts polling + indicator/pill; anchored scroll preservation; pull-to-refresh/load-latest feel; end-of-feed state; react-query or SWR for server-state cache (optional). |
| **Proposed changes** | `src/app/page.tsx`, `src/lib/feed.ts` |
| **Risk** | Medium — feed logic is central; privacy filter must remain server-side. |
| **Tests** | Feed visibility (private/following/blocked), new-posts pill visibility, scroll position, empty/loading/error states. |

### 4.2 Post cards and feed interactions

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/view/com/posts/PostFeedItem.tsx` (referenced, not in archive), `PostFeed.tsx` renderItem, moderation UI, show-less, thread views. Archive covers feed row types not individual post item (not included). |
| **AfterFur implementation** | `src/components/PostCard.tsx`, `src/components/post/post-media.tsx`, `src/components/PostInteractionProvider.tsx` |
| **Current functionality** | Like/repost/bookmark with optimistic counts, report/share dialogs, edit/delete, PawPass boost, media, timestamps, profile customisation, post options menu. |
| **Differences** | Bluesky post items support show-less, view-full-thread, moderation blur/filter UI, embed layouts (images gallery, video, external), reason context (why shown), feed context tracking. AfterFur PostCard is solid but lacks thread-context view and moderation UI per post. |
| **Improvements** | Add moderation state UI (hidden/blurred posts with reveal), thread parent context, "show less" for repetitive content, richer embed layouts. Keep existing interaction logic. |
| **Proposed changes** | `src/components/PostCard.tsx`, `src/components/post/post-media.tsx` |
| **Risk** | Low — enhancements are additive. |
| **Tests** | PostCard interaction tests exist (`PostCard.test.tsx`); add moderation-state and thread-context tests. |

### 4.3 User profile header and profile editing

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Profile/Header/index.tsx`, `ProfileHeaderStandard.tsx`, `GrowableAvatar.tsx`, `GrowableBanner.tsx`, `EditProfileDialog.tsx`, `PronounsDialog.tsx`, `Metrics.tsx`, `StatusBarShadow.tsx`, `view/screens/Profile.tsx` |
| **AfterFur implementation** | `src/app/[username]/ProfileClient.tsx` (inline header), `src/components/profile/profile-header.tsx` (unused reusable), `src/components/profile/profile-types.ts`, `src/app/edit-profile/page.tsx` |
| **Current functionality** | ProfileClient renders banner, avatar, display name, username, pronouns, bio, links, counts, follow/block/report buttons. `profile-header.tsx` is a separate reusable component with block/unblock, copy link, share. Edit-profile page exists. No collapsing header. |
| **Differences** | Bluesky: separate memoised `ProfileHeader` with `MinimalHeader` (collapsing on scroll via reanimated), growable avatar/banner, dedicated `EditProfileDialog` and `PronounsDialog`, `Metrics` component, labeler vs standard variants, `StatusBarShadow`. AfterFur: header inline in a 723-line client component; no collapsing behavior; edit is a separate page not a dialog. |
| **Improvements** | Extract/refine `profile-header.tsx` as the single source of truth; add collapsing/minimal header on scroll; add growable avatar/banner; consider edit-profile as dialog for quick changes. |
| **Proposed changes** | `src/components/profile/profile-header.tsx`, `src/app/[username]/ProfileClient.tsx` |
| **Risk** | Medium — profile is high-traffic; header extraction must preserve follow/block/privacy behavior. |
| **Tests** | Profile header rendering, follow/unfollow, block/unblock, private-profile 403 handling, edit-profile navigation. |

### 4.4 Profile tabs and media presentation

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Profile/Sections/Feed.tsx`, `types.ts` (`SectionRef`), `view/com/posts/PostFeed.tsx` |
| **AfterFur implementation** | `src/components/profile/profile-tabs.tsx`, `src/components/profile/profile-feed.tsx`, `src/components/post/private-media-grid.tsx`, `ProfileClient.tsx` inline tabs |
| **Current functionality** | Posts/replies/reposts/media/likes tabs; sticky; media tab with photos/gifs/videos filter + PrivateMediaGrid; empty states per tab. |
| **Differences** | Bluesky: each tab is a full `PostFeed` section with scroll-to-top ref, new-posts pill, end-of-feed, video grid rows. AfterFur: tabs render inline PostCard lists; media uses PrivateMediaGrid; no virtualisation or pagination on profile. |
| **Improvements** | Keep current tab structure; consider scroll-to-top per section, end-of-feed markers. Media presentation is already comparable. |
| **Proposed changes** | `src/components/profile/profile-tabs.tsx`, `src/components/profile/profile-feed.tsx` |
| **Risk** | Low. |
| **Tests** | Tab switching, media filter, empty states, post render per tab. |

### 4.5 Followers and following

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Profile/ProfileFollowers.tsx`, `ProfileFollows.tsx`, `KnownFollowers.tsx` |
| **AfterFur implementation** | `src/app/[username]/ProfileClient.tsx` (`openList` modal), `src/lib/follow.ts` |
| **Current functionality** | Modal dialog listing followers/following with avatar/name/username, unblock button, loading/error/empty states. Follow counts on header. |
| **Differences** | Bluesky: dedicated full screens (ProfileFollowers/ProfileFollows) with search, known followers, labeler liked-by. AfterFur: inline modal only. |
| **Improvements** | Convert modal to dedicated pages (`/profile/[username]/followers`, `/following`) for better shareability and UX; keep modal as fallback. |
| **Proposed changes** | `src/app/[username]/followers/`, `src/app/[username]/following/` (new routes), or enhance `ProfileClient.tsx` modal. |
| **Risk** | Low — additive routes. |
| **Tests** | Follower/following list loading, privacy filtering (private accounts), unblock from list. |

### 4.6 Account settings

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Settings/AccountSettings.tsx`, `Settings.tsx`, `components/ChangeHandleDialog.tsx`, `ChangePasswordDialog.tsx`, `DeactivateAccountDialog.tsx`, `DeleteAccountDialog.tsx`, `ExportCarDialog.tsx`, `BirthDateSettingsDialog` |
| **AfterFur implementation** | `src/app/settings/page.tsx` (account section inline), `src/app/account-security/page.tsx` (policy stub), `src/lib/accountSessions.ts`, `src/lib/pawpass.ts` |
| **Current functionality** | Settings page has account section: email, user ID, edit-profile link, staff tools. Account security is a policy page (`account-security/page.tsx`). No dedicated 2FA, app passwords, handle/password change dialogs, data export is in account-data section, deletion with scheduled options. |
| **Differences** | Bluesky: dedicated `AccountSettings` screen with dialogs for email/password/handle/birthday, deactivate/delete, export (CAR). AfterFur: all in one page; account-security is a static policy page; deletion exists with grace periods. |
| **Improvements** | Break account settings into sub-sections/dialogs (change password, change handle, verify email); make account-security an active page (2FA, app passwords, active sessions) rather than policy stub. |
| **Proposed changes** | `src/app/settings/page.tsx`, `src/app/account-security/page.tsx` |
| **Risk** | Medium — security-related; must not weaken auth/session or RLS. |
| **Tests** | Password/handle change, email verification, deactivation/deletion flow, session security. |

### 4.7 Appearance and accessibility

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Settings/AppearanceSettings.tsx`, `AccessibilitySettings.tsx`, `state/shell` (theme prefs), `alf` (fonts) |
| **AfterFur implementation** | `src/app/settings/page.tsx` (appearance section), `src/lib/afterDark.ts`, `src/globals.css`, `src/lib/supabase/database.types.ts` (ui_preferences via RPC) |
| **Current functionality** | Theme (default/dark/light) + accent color stored via RPC `get_my_ui_preferences`/`update_ui_preferences`. Accessibility section notes `prefers-reduced-motion` only. No font scaling, no system color mode, no dark theme variants. |
| **Differences** | Bluesky: color mode (system/light/dark), dark theme (dim/dark), font family (system/theme), font scale (3 sizes), haptics (native), require alt text, larger alt badges. AfterFur: theme + accent only; accessibility is informational. |
| **Improvements** | Add system color mode, dark theme variants (dim/dark), font size scaling, require-alt-text toggle, larger alt-text badges. Respect `prefers-reduced-motion`. |
| **Proposed changes** | `src/app/settings/page.tsx`, `src/globals.css`, `src/lib/afterDark.ts` |
| **Risk** | Low — appearance is client preference. |
| **Tests** | Theme persistence, accent color, reduced-motion. |

### 4.8 Privacy and security

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Settings/PrivacyAndSecuritySettings.tsx`, `ActivityPrivacySettings.tsx`, `components/Email2FAToggle.tsx`, `AlgoVisibilityOptOut.tsx`, `PwiOptOut.tsx` |
| **AfterFur implementation** | `src/lib/profilePrivacy.ts`, `src/lib/postPrivacy.ts`, `src/app/settings/page.tsx` (privacy section), `src/app/account-security/page.tsx`, `src/lib/moderation.ts`, `src/components/ReportDialog.tsx`, RLS policies |
| **Current functionality** | `canViewProfile`/`canViewPost` server-enforced; private account toggle; follow requests; blocks; data export; scheduled deletion; report dialog; moderation centre. Account-security page is a policy stub. No 2FA, no app passwords, no notification-declaration, no algo/PWI opt-out. |
| **Differences** | Bluesky: 2FA toggle, app passwords, notification declaration (who can subscribe), algorithmic visibility opt-out, PWI opt-out, public-network tip admonition. AfterFur: stronger server-enforced post/profile privacy (RLS + lib functions), but fewer account-security features. |
| **Improvements** | Add 2FA and app passwords (aligned with existing Supabase auth), notification preferences already exist. **Do NOT** add client-side privacy enforcement — keep RLS + server lib functions. Add a public-content tip admonition similar to Bluesky's. |
| **Proposed changes** | `src/app/account-security/page.tsx`, `src/app/settings/page.tsx` (privacy section), `src/lib/authHeaders.ts` (2FA/app password helpers) |
| **Risk** | High — security surface. Any 2FA/app-password work must integrate with Supabase auth and existing RLS, never bypass them. |
| **Tests** | Privacy enforcement (private posts not visible to non-followers), RLS, 2FA/app-password flow, report flow, moderation visibility. |

### 4.9 Shared components and responsive layouts

| Field | Information |
|-------|-------------|
| **Bluesky reference** | `Ref/bluesky/src/screens/Settings/components/SettingsList.tsx`, `components/forms/Toggle/*`, `components/forms/SegmentedControl/*`, `components/Layout/*` (`Screen`, `Header.Outer/Content/TitleText/Slot`), `components/Admonition/*`, `components/Link/*` |
| **AfterFur implementation** | `src/components/Shell.tsx`, `src/components/ui/{avatar,button,card,media-viewer,separator,skeleton}.tsx`, `src/components/EmptyState` (in Shell) |
| **Current functionality** | Shell: layout, top nav (mobile), side nav (desktop), bottom mobile nav, composer, account menu. `PageHeader` helper. ui/ primitives. No settings-specific list/toggle/segmented-control primitives. |
| **Differences** | Bluesky: `SettingsList` group/item primitives, `Toggle` radio groups, `SegmentedControl`, `Layout.Screen/Header` with back button + title + slot, `Admonition` tip/error boxes. AfterFur: hand-rolled settings UI in one page; Shell handles layout. |
| **Improvements** | Extract `SettingsList`, `Toggle`, `SegmentedControl` primitives for settings screens; reuse `PageHeader` consistently; keep Shell as layout shell. |
| **Proposed changes** | `src/components/ui/` (add settings primitives), `src/app/settings/page.tsx` |
| **Risk** | Low. |
| **Tests** | Component unit tests for new primitives; settings page regression. |

---

## 5. Exact AfterFur Files Requiring Potential Changes

High priority:
1. `src/app/page.tsx` — home feed (new-posts polling, pill, anchored scroll, refresh)
2. `src/lib/feed.ts` — feed visibility/pagination helpers
3. `src/components/profile/profile-header.tsx` — reusable profile header (extract from ProfileClient, add collapsing header)
4. `src/app/[username]/ProfileClient.tsx` — profile page (use refined header, dedicated follower/following routes)
5. `src/components/profile/profile-tabs.tsx` — profile tabs (refine)
6. `src/components/profile/profile-feed.tsx` — profile feed per tab
7. `src/app/settings/page.tsx` — settings (break into sub-sections, appearance enhancements)
8. `src/app/account-security/page.tsx` — make active (2FA, app passwords, sessions)
9. `src/components/PostCard.tsx` — post interactions (moderation UI, thread context) — additive
10. `src/components/ui/` — shared settings primitives (SettingsList, Toggle, SegmentedControl)

Medium priority:
11. `src/lib/postPrivacy.ts` / `src/lib/profilePrivacy.ts` — keep, possibly extend with notification-declaration logic
12. `src/lib/follow.ts` / `src/lib/followRequests.ts` — keep, extend for dedicated follower/following pages
13. `src/components/post/post-media.tsx` — embed layouts — additive
14. `src/globals.css` / `src/lib/afterDark.ts` — appearance (system dark mode, font scale)

Do NOT touch (preserve):
- `src/lib/supabase/*` (Supabase clients, RLS-adjacent types)
- `src/lib/moderation.ts`, `src/components/moderation/*` (moderation systems)
- `src/lib/afterDark.ts`, `src/lib/pawpass.ts`, `src/lib/ageVerification.ts` (age assurance / PawPass)
- `src/components/AuthProvider.tsx`, `src/middleware.ts` (auth/session)
- `supabase/migrations/*` (database)
- `src/components/ReportDialog.tsx`, `src/components/PostInteractionGate.tsx` (reporting / interaction gating)
- `src/app/notifications/*`, `src/app/messages/*`, `src/app/bookmarks/*`, `src/app/posts/[id]/page.tsx` (existing features)
- `Ref/bluesky/*` (read-only reference)

---

## 6. Recommended Improvements, Prioritised by Impact

### Phase 1 (Foundation — highest impact, lowest risk)
1. **Feed new-posts indicator + polling** — `src/app/page.tsx`, `src/lib/feed.ts`. Add a lightweight poll for newer posts (respecting `CHECK_LATEST_AFTER`-style interval) and a "new posts" indicator/button, mirroring Bluesky's `useNewPostsCheck` + `PrependPill` pattern. Keep the existing "Load older posts" + IntersectionObserver.
2. **Refresh/load-latest UX** — enhance the existing refresh button with scroll-to-top + replace, mirroring `FeedPage.onSoftReset` / `LoadLatestBtn`.

### Phase 2 (Profile experience)
3. **Unified, collapsible profile header** — `src/components/profile/profile-header.tsx` + `ProfileClient.tsx`. Use `profile-header.tsx` as the single source; add a collapsing/minimal header on scroll (CSS `position: sticky` + transform, no reanimated needed on web).
4. **Dedicated followers/following pages** — new routes under `src/app/[username]/followers` and `.../following`, or enhance the existing modal into full pages.

### Phase 3 (Settings & appearance)
5. **Settings primitives** — `src/components/ui/` (`SettingsList`, `Toggle`, `SegmentedControl`) to replace hand-rolled settings UI.
6. **Appearance enhancements** — system color mode, dark theme variants, font-size scaling, respect `prefers-reduced-motion` — `src/app/settings/page.tsx`, `src/globals.css`.
7. **Account security activation** — `src/app/account-security/page.tsx`: 2FA status, app passwords, active sessions (integrate with Supabase auth, do not bypass RLS).

### Phase 4 (Post & privacy refinements)
8. **Post moderation UI** — `src/components/PostCard.tsx`: hidden/blurred post state with reveal, mirroring Bluesky moderation UI. Keep server-enforced privacy.
9. **Privacy tip admonition** — public-content notice in privacy settings (Bluesky's "Atmosphere" tip).
10. **Thread context / show-less** — additive post-card refinements.

---

## 7. Security and Privacy Considerations

- **AfterFur's server-enforced privacy model is a strength and must be preserved.** `canViewProfile` (`src/lib/profilePrivacy.ts`) and `canViewPost` (`src/lib/postPrivacy.ts`) are called server-side / in Server Components and enforced by RLS. Bluesky's client-side moderation shadow filtering (`usePostAuthorShadowFilter`) is atproto-specific and has no direct equivalent; AfterFur's approach is more appropriate for a Supabase-backed app.
- **Do NOT introduce client-side-only privacy enforcement.** All feed/profile visibility decisions must remain server-side (Supabase queries + RLS). Any client-side filtering is UI-only optimization and must never be the sole enforcement.
- **Do not expose private posts, private profile info, restricted media, or authenticated data** through feeds, search, caching, or profile endpoints. The existing `moderation_status.is.null,moderation_status.eq.visible` filter and `is_private` checks must remain.
- **Do not weaken existing security checks or introduce alternative authentication.** Auth remains Supabase via `AuthProvider` + middleware. Any 2FA/app-password additions must integrate with Supabase Auth, not replace it.
- **Age verification / PawPass / age-assurance** (`src/lib/ageVerification.ts`, `src/lib/pawpass.ts`, `src/app/pawpass/`) must remain untouched.
- **Moderation systems** (`src/lib/moderation.ts`, `src/components/moderation/*`, reports) must remain untouched.
- **RLS policies** in `supabase/migrations/` must not be altered by this work.
- When adapting Bluesky's "public network tip" admonition, phrase it for AfterFur's own network (not the AT Protocol/Atmosphere).

---

## 8. Regression Risks

| Risk area | Description | Mitigation |
|-----------|-------------|------------|
| Feed changes | Adding polling/pill to `src/app/page.tsx` could break private/following filtering or cause duplicate posts. | Keep `filterVisibleFeedPosts`/`isFeedPostVisible` unchanged; test privacy matrix. |
| Profile header extraction | Moving header logic out of `ProfileClient.tsx` could lose follow/block/private-profile behavior. | Keep `profile-header.tsx` props identical; run existing profile tests. |
| Settings refactor | Breaking the all-in-one settings page could lose PawPass/private-prefs persistence. | Incremental; keep existing RPC calls (`get_my_ui_preferences`/`update_ui_preferences`). |
| Account security | Activating `account-security/page.tsx` with 2FA/app passwords could conflict with Supabase auth. | Scope to read-only status + Supabase-native features; no custom auth. |
| Appearance changes | Theme/font-scale changes could cause FOUC or contrast issues. | Test in light/dark + reduced-motion; use CSS variables. |

---

## 9. Recommended Testing Strategy

- **Unit tests (vitest):** `src/lib/feed.ts` visibility matrix (private × following × blocked × tab), `src/lib/postPrivacy.ts`, `src/lib/profilePrivacy.ts`, `src/components/PostCard.tsx` interactions, `src/components/profile/profile-header.tsx` rendering.
- **Component tests:** `src/components/PostCard.tsx` (existing `PostCard.test.tsx`), profile header, settings primitives, tabs.
- **Integration tests (vitest + Playwright):** feed load / refresh / new-posts indicator, profile follow/unfollow/block, private-profile 403, settings save (theme/accent/private), account-deletion flow, RLS enforcement via API routes.
- **Security tests:** existing `src/tests/security-*.test.ts`, `profile-access-regression.test.ts`, `feedPrivacy.server.test.ts`, `postPrivacy.test.ts` — keep passing; add tests for any new settings endpoints.
- **Visual/regression:** Playwright for profile header, settings page, feed empty/loading states.

---

## 10. Phased Implementation Roadmap

| Phase | Focus | Files | Approval gate |
|-------|-------|-------|--------------|
| 1 | Feed: new-posts polling + indicator + load-latest refresh | `src/app/page.tsx`, `src/lib/feed.ts` | User approval |
| 2 | Profile: unified collapsible header + dedicated followers/following | `src/components/profile/profile-header.tsx`, `src/app/[username]/ProfileClient.tsx`, new routes | User approval |
| 3 | Settings primitives + appearance (system dark mode, font scale) | `src/components/ui/*`, `src/app/settings/page.tsx`, `src/globals.css` | User approval |
| 4 | Account security activation (2FA status, app passwords via Supabase) | `src/app/account-security/page.tsx`, `src/lib/authHeaders.ts` | User approval |
| 5 | Post moderation UI + privacy tip + thread context | `src/components/PostCard.tsx`, `src/app/settings/page.tsx` | User approval |

**Stop here.** No implementation begins until you approve this report and the first phase.

---

## Concise Summary

**Biggest UI/UX improvement opportunities:**
1. Home feed: new-posts polling with a "new posts" indicator/pill and anchored scroll position (no jump when new posts arrive), plus a load-latest/pull-to-refresh feel.
2. Profile: a reusable, collapsible/minimal header on scroll (currently inline in a 723-line client component), plus dedicated followers/following pages instead of a modal.
3. Settings: break the monolithic page into sub-sections with shared `SettingsList`/`Toggle`/`SegmentedControl` primitives; add system dark mode, dark theme variants, and font-size scaling.
4. Account security: convert the static policy stub into an active page (2FA status, app passwords, active sessions) via Supabase Auth.

**Existing AfterFur files to address first:**
1. `src/app/page.tsx` — feed polling + new-posts indicator
2. `src/lib/feed.ts` — feed helper additions
3. `src/components/profile/profile-header.tsx` — reusable collapsible header
4. `src/app/[username]/ProfileClient.tsx` — use refined header, follower/following routes
5. `src/app/settings/page.tsx` — settings sub-sections + appearance
6. `src/app/account-security/page.tsx` — activate security page

**Features that should remain untouched:**
- Auth/session (`AuthProvider.tsx`, `middleware.ts`, `lib/supabase/*`)
- Privacy enforcement (`profilePrivacy.ts`, `postPrivacy.ts`, RLS policies)
- Age verification / PawPass (`ageVerification.ts`, `pawpass.ts`, `/pawpass` routes)
- Moderation (`moderation.ts`, `components/moderation/*`, reports)
- Existing notifications, posts, replies, likes, reposts
- Database migrations

**Architectural incompatibilities:**
- Bluesky is React Native (Expo) + AT Protocol; AfterFur is Next.js + Supabase. **Adapt patterns only, never copy code or dependencies.**
- Bluesky icons/fonts/artwork are third-party licensed and excluded from the MIT license; they must not be copied.
- `react-native-reanimated`, `@react-navigation`, `@lingui`, `@bsky/sdk` have no place in AfterFur.

**Recommended first implementation phase:** Phase 1 — feed new-posts polling + indicator + load-latest refresh in `src/app/page.tsx` and `src/lib/feed.ts`. Highest UX impact, lowest risk, does not touch security or auth.

**Do not start implementing anything after completing this report. Stop and wait for my approval.**