# AfterFur 2.0 --- Complete UI/UX Redesign

## Project codename: Midnight

**Project:** AfterFur\
**Local project:** `D:\Afterfur`\
**Live website:** https://www.afterfur.site/\
**Repository:** https://github.com/urgaynow2024-cloud/afterfur\
**Design direction:** Midnight\
**Primary accent:** Purple / lavender

------------------------------------------------------------------------

## 1. Vision and objective

Transform the existing AfterFur application into a polished, modern,
creator-focused social platform with a distinctive identity and a
substantially better overall user experience than X.

This is a redesign of the **existing application**, not a rebuild from
scratch. Preserve the existing routes, components, integrations, data
structures and working functionality wherever possible.

The goal is not merely to change colours. Improve the actual page
layouts, information hierarchy, navigation, spacing, typography,
component presentation, interactions, responsive behaviour and usability
across the entire website.

Use the approved **AfterFur 2.0 --- Midnight** visual mockup from the
conversation as a visual reference. Treat it as direction and
inspiration, not as a reason to copy another platform.

### Core design principles

-   Premium, modern and recognisably AfterFur.
-   Easy to navigate and pleasant to use.
-   Creator-focused and community-driven.
-   Consistent across every route.
-   Powerful customisation without clutter.
-   Responsive and accessible.
-   Fast, reliable and secure.

------------------------------------------------------------------------

## 2. Non-negotiable safety and preservation rules

Before changing code, understand the current local project and its
existing uncommitted work. Some local work may not have been pushed or
deployed, so the live website is not necessarily an accurate
representation of the current project.

**The local project is the source to protect.**

Do not:

-   Reset Git or hard-reset to an older commit.
-   Discard or overwrite uncommitted work.
-   Replace the application with a new project.
-   Remove working functionality to simplify the redesign.
-   Commit or push changes automatically.
-   Execute production SQL or database migrations.
-   Weaken security or replace server-side authorization with
    client-side visibility checks.
-   Claim a page is redesigned merely because it uses shared design
    tokens.
-   Add decorative controls that do not work.

If a change risks data loss, security or destructive modification, stop
before that change and explain the exact blocker. Otherwise, continue
with safe UI implementation.

### Preserve all existing functionality

Preserve the existing implementation of:

-   Supabase integration and authentication.
-   Profiles and profile editing.
-   Posts and individual post pages.
-   Replies.
-   Likes and unlikes.
-   Reposts and undo reposts.
-   Bookmarks.
-   Media uploads and image compression.
-   Existing image, video and GIF support.
-   Notifications.
-   Messaging, where implemented.
-   Search and Explore.
-   Creator discovery.
-   Follow and unfollow.
-   Private profiles and follow requests.
-   Blocking and unblocking.
-   Stage 21A blocking protections.
-   Stage 21B privacy and permissions.
-   Secure signed media URLs.
-   Private media storage.
-   Media ownership and authorization checks.
-   Existing API routes, database structures and RLS policies.
-   Existing direct profile and post URLs.

Do not weaken any privacy, age restriction, content restriction or
access-control behaviour for visual convenience.

------------------------------------------------------------------------

## 3. Brand identity --- Midnight

Create a consistent design system for the entire application.

### Suggested palette

  Token                  Suggested colour
  ---------------------- ------------------
  Main background        `#09090F`
  Secondary background   `#0F1018`
  Surface                `#151622`
  Elevated surface       `#1B1C2A`
  Hover surface          `#242538`
  Primary purple         `#8B5CF6`
  Deep purple            `#7042D8`
  Lavender               `#B69AFF`
  Soft lavender          `#D2C2FF`
  Primary text           `#F5F3FA`
  Secondary text         `#AAA8B8`
  Muted text             `#777588`
  Border                 `#292A39`
  Success                `#39C98A`
  Warning                `#F4B942`
  Error                  `#F06B79`

These are starting values. Use shared CSS variables or the project's
existing token system rather than scattering literal colours throughout
components.

### Design rules

-   Use deep charcoal rather than pure black for every surface.
-   Use purple and lavender as purposeful accents, not on every element.
-   Establish consistent typography, spacing, border radii and
    elevation.
-   Use subtle borders and shadows.
-   Use gradients and glow sparingly.
-   Keep text readable and hierarchy clear.
-   Use one consistent icon style and sizing system.
-   Give icon-only controls accessible labels and tooltips.
-   Keep focus, hover, active, disabled and loading states consistent.

------------------------------------------------------------------------

## 4. Global application shell and navigation

Improve the application shell across all authenticated routes.

### Desktop layout

Use a balanced layout with:

1.  Left navigation.
2.  Main content area.
3.  Contextual right sidebar where useful.

The main content must remain the focus. Use sensible maximum widths and
avoid stretching content across very large screens.

### Navigation

Retain all existing destinations and improve their presentation,
including where present:

-   Home.
-   Explore.
-   Search.
-   Notifications.
-   Messages.
-   Bookmarks.
-   After Dark.
-   Profile.
-   Settings.
-   More.

Improve:

-   Logo and brand presentation.
-   Icon alignment and sizing.
-   Active page indicator.
-   Hover and focus states.
-   Notification badges.
-   Account area.
-   Post creation action.
-   Navigation spacing and hierarchy.

Do not remove existing destinations.

### Contextual sidebar

Where appropriate, provide reusable right-side content such as:

-   Creator Spotlight.
-   Suggested creators.
-   Trending or discovery content.
-   Relevant community information.

Do not force a sidebar onto pages where it makes the main content
cramped.

### Mobile navigation

Create a purpose-designed mobile navigation experience. Do not merely
shrink the desktop sidebar.

Keep important destinations and actions easy to reach. Avoid horizontal
overflow and tiny touch targets.

------------------------------------------------------------------------

## 5. Home page and social feed

Improve the home experience and make the feed feel polished, readable
and responsive.

### Home header and feed tabs

-   Clear page heading.
-   For You and Following feeds, if already supported.
-   Obvious selected-tab state.
-   Consistent navigation and loading behaviour.

### Post composer

Improve the existing composer with:

-   Current user's avatar.
-   Comfortable text input.
-   Natural expansion while typing.
-   Character counter where supported.
-   Media attachment controls.
-   Supported image, video and GIF attachment options.
-   Attachment previews.
-   Remove attachment action.
-   Upload progress and error feedback.
-   Clear publish action.
-   Disabled and loading states.

Keep the composer compact when inactive. Preserve existing upload
validation, compression and limits.

### Post cards

Improve the presentation and hierarchy of:

-   Author avatar.
-   Display name and username.
-   Badges.
-   Timestamp.
-   Post content.
-   Links, mentions and hashtags.
-   Attached media.
-   Reply action.
-   Repost action.
-   Like action.
-   Bookmark action.
-   More menu.

Interactions should provide immediate and accurate feedback. Prevent
accidental duplicate submissions.

### Post menus

Where supported and permitted, provide:

-   Edit post.
-   Delete post.
-   Copy link.
-   Share.
-   Report.
-   Other existing post actions.

Only show actions the current user is allowed to perform.

### Media

-   Preserve aspect ratios.
-   Never stretch or distort media.
-   Use responsive dimensions.
-   Provide loading and error states.
-   Use a suitable media viewer where available.
-   Preserve private media authorization and signed URL handling.

------------------------------------------------------------------------

## 6. Complete profile redesign

Profiles are a core part of AfterFur's identity. Make them personal,
polished, useful and easy to navigate.

### Profile header and information

Include and improve:

-   Banner.
-   Circular avatar.
-   Display name.
-   Username.
-   Profile badges.
-   Bio with preserved line breaks and supported links.
-   Website or social links where supported.
-   Location.
-   Join date.
-   Follower count.
-   Following count.
-   Profile action buttons.
-   Profile overflow menu.

### Banner and avatar requirements

**Banner:** - Responsive aspect ratio. - Sensible positioning and
cropping. - No distortion. - Suitable fallback when absent.

**Avatar:** - True circular shape. - Fixed width and height. -
`object-fit: cover`. - No stretched or oval avatars. - Sensible fallback
initials or placeholder. - Consistent sizing across the application.

### Profile tabs

Preserve and improve all existing tabs:

-   Posts.
-   Replies.
-   Reposts.
-   Media.
-   Likes.

Each tab must show the correct content and appropriate loading, empty
and error states.

### Profile states

Design the appropriate presentation for:

-   Own profile.
-   Public profile.
-   Private profile.
-   Followed profile.
-   Pending follow request.
-   Rejected or cancelled request, as applicable.
-   Blocked relationship.
-   Empty profile.
-   Loading profile.
-   Unavailable or not-found profile.

Never reveal private profile content through cached data, client-side
navigation, previews or loading states.

------------------------------------------------------------------------

## 7. Profile buttons, actions and overflow menus

This is a required part of the redesign. Do not redesign only the
profile header while leaving its controls unfinished.

### Own profile actions

Provide the appropriate existing actions:

-   **Edit Profile**
-   **Share Profile**
-   **More menu**

### Other users' profile actions

Provide the correct state-dependent actions:

-   **Follow**
-   **Following**
-   **Follow back**, where applicable
-   **Request Follow**
-   **Requested**
-   **Cancel Follow Request**
-   **Message**, where supported
-   **Share Profile**
-   **More menu**

Buttons must reflect the actual relationship and privacy state. Do not
display contradictory states.

### Profile More menu

Include existing supported actions as appropriate:

-   **Block / Unblock**
-   **Report Profile**
-   **Copy Profile Link**
-   **Mute / Unmute**, only if the functionality exists
-   Other existing account actions

### Blocking behaviour

-   Preserve Stage 21A blocking logic and security.
-   Show Block or Unblock according to the current relationship.
-   Provide a clear confirmation step for blocking where appropriate.
-   Make the resulting state clear.
-   Ensure blocked users cannot access or interact with content
    prohibited by existing rules.
-   Do not rely on hiding a button as the security mechanism.
-   Do not weaken server-side checks or RLS.

### Follow and private profile behaviour

-   Clearly show when a profile is private.
-   Display the correct Follow, Request Follow, Requested, Cancel
    Request and Following states.
-   Preserve accepted-follower permissions.
-   Do not expose private posts or media to unauthorised viewers.

### Followers and Following

Improve the follower and following controls and lists:

-   Make counts clear and usable.
-   Make the controls open the correct lists.
-   Provide useful user rows with avatars, names and usernames.
-   Include follow actions where permitted.
-   Respect private-profile and blocking rules.
-   Include loading, empty and error states.

### Menus and confirmation dialogs

Use consistent menus and dialogs. Destructive actions should have
appropriate confirmation and feedback. Every visible control must work
and must use existing backend functionality.

------------------------------------------------------------------------

## 8. Profile Appearance Studio

Give the appearance editor a premium creator-tool experience. It should
not feel like a cramped generic settings form.

### Organised sections

Separate the controls into clear sections:

1.  Display name.
2.  Username.
3.  Typography.
4.  Text effects.
5.  Glow and lighting.
6.  Live preview.

Use a responsive layout. Controls must never overlap or become cramped.

### Display name customisation

Preserve and improve supported options:

-   Preset colours.
-   Custom HEX colour.
-   Colour picker.
-   Font family.
-   Font weight.
-   Text styling.
-   Text effects.
-   Glow enable/disable.
-   Glow colour.
-   Glow intensity.

### Username customisation

Provide separate controls for:

-   Username colour.
-   Custom HEX colour.
-   Font selection where supported.
-   Text effects.
-   Glow settings.

Changing display-name styling must not accidentally change username
styling.

### Colour presets

Provide a coherent palette, including:

-   Purple.
-   Lavender.
-   Violet.
-   Blue.
-   Cyan.
-   Pink.
-   Magenta.
-   Red.
-   Orange.
-   Gold.
-   Green.
-   White.
-   Custom.

### Live preview and saving

Show an accurate preview of the user's profile identity as settings
change.

Include:

-   Display name.
-   Username.
-   Representative badges.
-   Suitable profile background.

Clearly indicate unsaved changes. Provide Save Changes and Reset
controls, saving progress, success feedback and useful error handling.

Preserve existing saved customisation data and compatible data formats.

------------------------------------------------------------------------

## 9. Settings redesign

Organise settings into clear, consistent sections without removing
existing controls.

Suggested categories, where supported:

### Account

-   Account details.
-   Username.
-   Email and account management.

### Profile

-   Display name.
-   Username.
-   Bio.
-   Avatar.
-   Banner.
-   Profile links.
-   Location.

### Appearance

-   Appearance Studio.
-   Theme.
-   Profile customisation.
-   Accessibility preferences where supported.

### Privacy

-   Public/private profile.
-   Follow permissions.
-   Blocking.
-   Other existing privacy controls.

### Security

-   Existing authentication and security settings.
-   Session management where supported.

### Notifications

-   Existing notification preferences.

### Other

-   Help.
-   Support.
-   Legal documents.
-   Existing application preferences.

Do not add fake controls or present unsupported features as functional.

------------------------------------------------------------------------

## 10. Explore and creator discovery

Improve discovery so users can find creators and content without an
overwhelming wall of cards.

### Explore

Improve existing discovery sections and supported content categories.

Include where available:

-   Recommended creators.
-   Popular content.
-   Recent posts.
-   Media discovery.
-   Existing categories.
-   Search entry point.

### Creator cards

Use consistent, attractive creator cards with:

-   Avatar.
-   Display name.
-   Username.
-   Relevant badges.
-   Short bio where appropriate.
-   Follow action.

### Creator Spotlight

Make Creator Spotlight a polished, compact discovery component. Preserve
existing follow actions and navigation to further discovery.

Respect blocked relationships and content permissions.

------------------------------------------------------------------------

## 11. Search

Improve the existing search experience.

Where supported, provide:

-   Prominent search field.
-   Search suggestions.
-   Clear search action.
-   Recent searches.
-   Appropriate result tabs.
-   User results.
-   Post results.
-   Relevant media results.

Include loading, empty, no-results and error states.

Ensure private content and blocked relationships remain protected by the
underlying queries and authorization.

------------------------------------------------------------------------

## 12. Notifications

Improve notification presentation for existing event types, such as:

-   New followers.
-   Follow requests.
-   Accepted follow requests.
-   Likes.
-   Replies.
-   Reposts.
-   Mentions.
-   Other supported notification events.

Include:

-   Read/unread states.
-   Appropriate grouping.
-   Timestamps.
-   Navigation to relevant content.
-   Clear empty and loading states.

Do not expose notifications to unauthorised users. Do not change read
behaviour accidentally.

------------------------------------------------------------------------

## 13. Messaging

Improve the existing messaging experience without inventing unsupported
backend functionality.

Where supported, improve:

-   Conversation list.
-   Conversation search.
-   User avatars.
-   Last message preview.
-   Timestamps.
-   Unread indicators.
-   Conversation view.
-   Message composer.
-   Existing attachment support.
-   Loading and empty states.

Make messaging responsive. On mobile, provide a natural
conversation-first experience.

Preserve existing message permissions and privacy.

------------------------------------------------------------------------

## 14. Bookmarks

Improve the saved-content experience.

Include:

-   Saved posts.
-   Post previews.
-   Author information.
-   Media previews.
-   Remove bookmark action.
-   Clear empty state.

Preserve existing bookmark functionality and permissions.

------------------------------------------------------------------------

## 15. After Dark

Preserve the existing After Dark destination and its access controls.

Apply the Midnight design consistently while preserving:

-   Existing age restrictions.
-   Existing content restrictions.
-   Existing access checks.
-   Privacy rules.

Do not expose restricted content through public feeds, previews or
unauthorised routes.

Do not weaken age-gating or content-access checks for visual
convenience.

------------------------------------------------------------------------

## 16. Media viewer

Where supported, improve the media viewer with:

-   Large responsive media presentation.
-   Previous and next controls for multiple attachments.
-   Close action.
-   Keyboard accessibility.
-   Mobile-friendly interactions.
-   Loading and error states.

Never expose protected media through unrestricted public storage URLs.
Continue using existing secure authorization and signed URL handling.

------------------------------------------------------------------------

## 17. Direct links and sharing

Preserve direct, shareable URLs, including:

-   `/username`
-   `/username/status/postId`

Opening a direct URL must load the correct profile or post.

Preserve:

-   Browser refresh.
-   Back and forward navigation.
-   Shareable links.
-   Correct unauthenticated behaviour.
-   Private-content restrictions.

Do not route every profile to one generic page.

------------------------------------------------------------------------

## 18. Shared components and interaction quality

Improve existing reusable components rather than creating unnecessary
duplicates.

Review shared components such as:

-   Application shell.
-   Sidebar and mobile navigation.
-   Right sidebar.
-   Page headers.
-   Profile header.
-   Avatar and banner.
-   Badges.
-   Buttons and icon buttons.
-   Tabs.
-   Dropdown menus.
-   Modals and dialogs.
-   Toast notifications.
-   Tooltips.
-   Post cards.
-   Post composer.
-   Media viewer.
-   Creator cards.
-   Empty, loading and error states.
-   Settings layout.

### Micro-interactions

Add restrained, purposeful interactions:

-   Button hover and active states.
-   Tab transitions.
-   Smooth menus.
-   Toast notifications.
-   Loading skeletons.
-   Like and repost feedback.
-   Follow-state transitions.
-   Focus indicators.
-   Smooth modal opening and closing.

Respect reduced-motion preferences. Avoid unnecessary animation.

------------------------------------------------------------------------

## 19. Responsive design

Design deliberately for:

### Large desktop

-   Full navigation.
-   Main content.
-   Contextual sidebar where useful.
-   Sensible maximum widths.

### Laptop

-   Comfortable central content.
-   Collapse or reduce the right sidebar when needed.

### Tablet

-   Simplified navigation.
-   Adequate content width.
-   Avoid cramped columns.

### Mobile

-   Dedicated mobile navigation.
-   Full-width content.
-   Properly scaled profile headers.
-   Comfortable touch targets.
-   Responsive media.
-   Mobile-friendly settings and menus.
-   No horizontal page overflow.

Do not simply scale desktop components down.

------------------------------------------------------------------------

## 20. Accessibility

Treat accessibility as part of the implementation.

Provide:

-   Semantic HTML.
-   Keyboard navigation.
-   Visible focus states.
-   Accessible labels.
-   Accessible menus and dialogs.
-   Sufficient colour contrast.
-   Screen-reader-friendly status messages.
-   Reduced-motion support.
-   Proper form labels.
-   Sensible heading hierarchy.

Do not use colour alone to communicate important states.

------------------------------------------------------------------------

## 21. Performance and reliability

Improve the user experience without compromising security.

Where appropriate, improve:

-   Unnecessary component re-renders.
-   Image loading and dimensions.
-   Media previews.
-   Loading skeletons.
-   Route transitions.
-   Data fetching.
-   Large lists and pagination.
-   Responsive media behaviour.

Do not load excessive posts or media at once. Do not add heavy
dependencies without a genuine need.

------------------------------------------------------------------------

## 22. Loading, empty, error and permission states

Major routes and components must not leave users staring at blank
screens.

Provide useful states for:

-   Loading.
-   Empty content.
-   Errors.
-   Retry actions.
-   Permission denied.
-   Not found.
-   Network problems where practical.

Explain what happened and what the user can do next.

Never reveal protected data in a loading or error state.

------------------------------------------------------------------------

## 23. Implementation expectations

Work directly in the existing local project at `D:\Afterfur`.

The live website may not contain all local changes, so do not treat it
as the only source of truth.

Make meaningful improvements to the actual page layouts and components.
Do not limit the work to design tokens or CSS colour changes.

Reuse working architecture and components where possible. Preserve
useful existing uncommitted work.

Do not repeatedly create plans or progress documents instead of
implementing the UI.

Do not ask the user to approve every individual page or component.
Coordinate the work independently.

If the environment has execution limits, continue from the remaining
implementation without repeating completed work or presenting a partial
result as complete.

If a genuine blocker prevents a safe change, explain the exact issue.
Continue with other safe work rather than abandoning the entire
redesign.

------------------------------------------------------------------------

## 24. Verification and definition of done

Run the existing checks and distinguish pre-existing failures from new
regressions.

At completion:

-   TypeScript check.
-   Full test suite.
-   Production build.
-   Route verification.
-   Desktop and mobile layout checks.
-   Profile action and menu checks.
-   Appearance customisation checks.
-   Post creation and interaction checks.
-   Follow request checks.
-   Blocking checks.
-   Private profile access checks.
-   Secure media loading checks.
-   Settings persistence checks.
-   Direct profile and post URL checks.

Do not claim a test passed unless it actually ran and passed.

### Completion report

Report:

1.  Pages and components actually redesigned.
2.  Visible layout and UX improvements.
3.  Profile buttons and menus implemented.
4.  Appearance Studio improvements.
5.  Existing features preserved.
6.  Security checks preserved.
7.  Tests and build results.
8.  Remaining issues, if any.

**The task is complete only when the existing AfterFur application has
received a meaningful, cohesive UI/UX improvement across its
routes---not merely a new colour palette.**

------------------------------------------------------------------------

# Final product objective

Create **AfterFur 2.0 --- Midnight**: a premium, modern, creator-focused
social platform with its own identity, excellent profile customisation,
intuitive social interactions and a polished experience across desktop
and mobile.

Make the existing product substantially better to use than X, without
copying X and without sacrificing the functionality and security already
built.
