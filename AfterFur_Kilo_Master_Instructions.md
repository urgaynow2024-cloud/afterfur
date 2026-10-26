# AFTERFUR — Master Development Instructions for Kilo

## Purpose

Build **AfterFur**, a complete, production-quality 18+ social-media platform for the furry community, following the supplied `AfterFur_Full_Platform_Plan.txt`.

AfterFur is a social network first—not merely an adult-content website. Its identity is:

> **AFTERFUR — Social media, after dark.**  

> An 18+ furry social platform built for creators and the community.

Core principles:

- No AI-generated content.

- Creator-first design.

- Human-reviewed moderation decisions.

- Strong privacy and safety controls.

- Transparent moderation and appeals.

- Adult-content controls and age safety designed from the beginning.

- Genuine community interaction.

This file is an implementation brief. **Inspect the existing project before making changes, then implement the work in tested phases.** Do not stop after producing plans or mockups.

## 1. Inspect the Existing Repository First

Before modifying files:

1. Inspect the repository structure and read its README, package files, configuration, environment examples, database schema, migrations, authentication, routes, components, and deployment configuration.

2. Identify the current framework, database, storage provider, authentication system, and hosting setup.

3. Determine which features work, are incomplete, or are missing.

4. Run existing tests, linting, type checks, and builds where available.

5. Record bugs, security concerns, and technical limitations.

Preserve working functionality. Do not delete features, replace the architecture, overwrite configuration, or introduce a new framework without a clear technical reason.

If the repository is empty, choose a maintainable full-stack architecture and document the choice.

Create or update `docs/AFTERFUR_IMPLEMENTATION_PLAN.md` with the audit, architecture, database design, phases, security approach, testing strategy, known limitations, and deployment requirements. Then begin implementation.

## 2. Design and User Experience

Create a polished, distinctive, responsive interface for desktop, tablet, and mobile. It should feel like a modern social platform, not a generic template.

Establish a consistent design system for colours, typography, spacing, buttons, cards, forms, modals, navigation, notifications, content warnings, badges, loading states, empty states, and errors.

Use AfterFur branding consistently. Build intuitive social navigation, a central feed, and contextual sidebars where appropriate.

Every visible button, menu, tab, filter, and form must work or be clearly marked as not yet available. Do not use hardcoded production posts, fake users, fake statistics, or fake interactions. Test fixtures are acceptable in development and automated tests.

Ensure keyboard navigation, readable contrast, accessible labels, useful validation, and clear error messages.

## 3. Authentication, Age Safety, and Accounts

Implement:

- Registration, login, logout, password reset, and account recovery.

- Unique usernames and editable display names.

- Profile pictures, banners, bios, and links.

- Account privacy settings and session management.

- Secure account deletion and data-deletion workflows.

- Login notifications where supported.

- Two-factor authentication.

- Rate limiting and abuse prevention.

Use established authentication libraries or providers and secure password hashing. Never store plaintext passwords, expose secrets, or commit real credentials. Validate input server-side and protect all authenticated endpoints.

Because AfterFur is 18+, implement an age-gating and age-verification workflow appropriate to applicable law and operational requirements. Do not assume a date-of-birth checkbox is sufficient wherever stronger verification is required. Minimize collection and retention of identity data. Document any age-verification provider dependency or unresolved compliance requirement.

## 4. Profiles and Social Graph

Profiles should include:

- Avatar and banner.

- Display name and username.

- Bio and external links.

- Follower and following counts.

- Join date.

- Creator categories such as digital artist, VRChat creator, fursuiter, photographer, and animator.

- Posts, replies, media, and pinned post.

- Relevant creator information.

Implement follow/unfollow, follower/following lists, block/unblock, mute/unmute, interaction restrictions, profile privacy controls, and account reporting.

Enforce blocking and privacy on the server across feeds, replies, messages, search visibility where appropriate, and other interactions—not just in the UI.

## 5. Posts, Interactions, and Media

Posts should support:

- Text, images, multiple images, videos, GIFs, hashtags, and mentions.

- Likes, replies, reposts, quote posts, bookmarks, sharing, editing where supported, deleting, and reporting.

Store posts and interactions in the database. Add database constraints and server-side checks to prevent invalid duplicates, including duplicate likes, follows, and bookmarks.

Use cursor-based pagination or equivalent for feeds and histories. Add loading, empty, and error states.

Secure media uploads with validated file types, size limits, safe filenames, upload rate limits, appropriate storage permissions, and access controls. Do not trust file extensions or browser-supplied MIME types alone. Use suitable image/video processing and prevent unauthorized access to restricted media.

## 6. Content Classification and After Dark

Support these classifications from the platform plan:

- SFW.

- Suggestive.

- Adult.

- Restricted.

Applicable media posts must have an explicit classification. Provide preferences to:

- Show or hide adult content.

- Show or hide suggestive content.

- Blur sensitive media.

- Show or hide adult content in Explore.

Create a dedicated **After Dark** section. Content restrictions must be enforced server-side in feeds, search, Explore, notifications, previews, reposts, quote posts, embeds, and direct media access. Do not rely on CSS or frontend hiding.

Restricted content must never be exposed to unauthorized users. Define and enforce prohibited-content rules; illegal content and sexual content involving minors must never be allowed. Prevent access-control bypasses through direct URLs, cached previews, and shared content.

## 7. Home Feed, Explore, Hashtags, and Search

Implement feed modes:

- **Following:** content from followed accounts.

- **For You:** recommendations based on maintainable, explainable relevance signals.

- **Latest:** chronological posts.

- **Media:** image/video-focused posts.

- **After Dark:** permitted adult content for eligible users who enable it.

Explore should support trending posts and hashtags, popular/rising/new creators, popular artwork and videos, suggested creators, and community topics. Give smaller creators reasonable discovery opportunities instead of ranking only by popularity.

Hashtag pages should have Popular, Latest, Media, and Creators sections.

Search should support users, posts, hashtags, and media. Advanced filters for date, content type, SFW/Adult, and creator can follow once core search is stable. Apply content permissions to all search results.

## 8. Engagement, Bookmarks, and Sharing

Implement likes, replies, reposts, quote posts, bookmarks, and sharing as real persistent features.

Bookmarks must be private. Future enhancements may include folders, collections, saved creators, and saved searches.

Users must not be able to read another user's private bookmarks through the UI or API.

## 9. Private Messaging and Notifications

Messaging should support:

- Text and permitted media.

- Sharing posts.

- Message requests.

- Blocking and reporting conversations.

- Deleting conversations according to documented semantics.

- Controls over who can message a user.

Use secure access controls so only conversation participants and explicitly authorized moderation workflows can access message content. Document any retention and deletion limitations.

Notifications should support likes, replies, reposts, quote posts, follows, mentions, messages, creator updates, moderation notifications, and Prime notifications as features become available.

Provide granular notification preferences and prevent notifications from revealing restricted media to users who cannot access it.

## 10. Creator Features

Build creator profile categories, portfolio and commission links, and a foundation for creator verification and analytics.

Future monetization possibilities from the plan include tips, creator subscriptions, paid posts, digital products, commission tools, creator storefronts, and analytics. Do not enable payment features until provider terms, adult-content rules, taxes, refunds, chargebacks, and legal requirements have been researched and documented.

Keep creator subscriptions separate from AfterFur Prime.

## 11. No-AI Policy and Art-Theft Reporting

AfterFur prohibits AI-generated content under its community rules.

Users must be able to report suspected AI-generated content. Automated detection may help prioritize review but must not automatically punish users. Use the process:

**Report → Human review → Decision → Appeal**

Provide reporting for stolen artwork, reuploads, impersonation, stolen commissions, and unauthorized artwork use.

Potential later features include original-post timestamps, creator verification, watermark tools, copyright reporting, and repeat-offender tracking.

Do not claim AI-detection systems can conclusively prove authorship. Provide a fair human review process and appeal route.

## 12. Moderation, Reports, and Appeals

Users should be able to report:

- Harassment and hate.

- Spam and scams.

- Art theft and impersonation.

- Suspected AI-generated content.

- Sexual-content violations.

- Illegal content.

- Other platform-rule violations.

Create a moderation dashboard with:

- Report queue and history.

- Reported content and user profiles.

- Previous warnings and moderation actions.

- Account history and restrictions.

- Suspensions and bans.

- Appeal queue.

Every moderation action must be recorded in an audit log with the actor, target, action, reason, timestamp, and relevant expiry or case reference.

Users must be told which rule was violated, what action was taken, when it happened, whether it expires, and how to appeal. Where practical, appeals should be reviewed by someone other than the original moderator.

Use permission tiers:

- **Moderator:** routine reports and content moderation.

- **Senior Moderator:** serious cases and appeals.

- **Administrator:** platform-wide management.

- **Owner:** final platform authority.

Enforce permissions on the server. Never trust a role or permission supplied by the browser. Log privileged actions and prevent unauthorized role escalation.

## 13. Anti-Spam, Security, and Privacy

Build protections for mass account creation, spam posts, follow spam, DM spam, bot activity, scam links, repeated harassment, malicious uploads, and abusive request patterns.

Automated systems may flag suspicious activity for human review. Use sensible rate limits and explainable enforcement.

Security requirements:

- Secure password hashing and session handling.

- Optional/required 2FA as designed.

- Server-side authorization checks.

- Input validation and output encoding.

- CSRF protection where applicable.

- Protection against XSS, SQL injection, SSRF, and insecure direct object references.

- Secure upload handling and malware scanning where feasible.

- Secrets management.

- Database backups and recovery procedures.

- Data minimization and deletion workflows.

- Audit logging.

- Dependency updates and vulnerability checks.

- Appropriate security headers and transport security.

Do not log passwords, session tokens, private keys, or unnecessary sensitive content. Document security limitations and required operational controls.

## 14. AfterFur Prime

AfterFur Prime is an optional membership supporting the platform. The free social network must remain usable.

Potential starting prices in the plan are **£4.99/month** and **£49.99/year**; these are proposals, not final commitments.

Potential benefits:

- Prime badge.

- Custom username and display-name colours.

- Profile accent colour and themes.

- Additional profile customization.

- Monthly post boosts.

- More bookmark folders.

- Longer posts.

- Higher media limits and longer videos.

- Advanced search.

- Enhanced notification controls.

- Profile and post analytics.

- Early access to features.

Prime boosts must be clearly labelled, time-limited, subject to moderation, and never bypass content controls or moderation.

Do not trust client-side subscription flags. Verify membership status server-side and handle cancellations, renewals, failed payments, refunds, and webhook retries safely. Do not integrate payments until the provider permits the intended platform and content categories.

## 15. Admin Dashboard

Create a separate protected admin dashboard for:

- User management.

- Moderator management.

- Reports and appeals.

- Bans and suspensions.

- Content moderation.

- Hashtag management.

- Verification management.

- Platform statistics.

- System announcements.

- Prime management.

- Audit logs.

- Security monitoring.

Apply role-based access controls on every admin endpoint. Keep an auditable record of administrative actions. Do not expose private user data to staff who do not need it for their role.

## 16. Database and Technical Architecture

Inspect and respect the existing stack. Design a maintainable database covering the features actually being implemented, including appropriate entities for:

- Users and sessions.

- Profiles and privacy settings.

- Follows, blocks, and mutes.

- Posts and media references.

- Hashtags and mentions.

- Likes, replies, reposts, and bookmarks.

- Notifications.

- Conversations, participants, and messages.

- Reports, moderation actions, and appeals.

- Age-verification status and minimum necessary records.

- Prime memberships and subscription events.

- Audit logs.

Use foreign keys, indexes, uniqueness constraints, migrations, and transactions where appropriate. Store media in suitable object storage rather than directly in relational database rows unless the existing architecture has a justified alternative. Use a CDN when appropriate for the hosting setup.

Do not assume the development database is the production database. Never run destructive migrations or modify production data without explicit authorization and a verified backup.

## 17. Required Development Phases

Implement in this order, adjusting only when repository constraints justify it.

### Phase 1 — Audit and Foundation

- Inspect the repository and document findings.

- Establish the design system and application structure.

- Confirm authentication, database, migrations, storage, and environment configuration.

- Add baseline linting, type checks, and tests.

- Define authorization and content-classification rules.

### Phase 2 — Core Social MVP

- Registration, login, profiles, and settings.

- Follow/unfollow and block/mute.

- Post creation, image uploads, feeds, likes, replies, and reposts.

- Bookmarks and hashtags.

- Search and notifications.

- Responsive navigation and Explore.

### Phase 3 — Adult Platform Safety

- Age-gating and appropriate verification integration.

- Content classifications and sensitive-media blur.

- Adult-content preferences.

- After Dark.

- Adult-content reporting and server-side access controls.

### Phase 4 — Moderation

- Reporting queue and case history.

- Moderator dashboard and role permissions.

- Warnings, suspensions, and bans.

- Appeals.

- Audit logs.

- Anti-spam safeguards.

- Art-theft and AI-content reporting.

### Phase 5 — Prime

- Membership management and badge.

- Profile customization.

- Boosts.

- Membership settings and subscription lifecycle.

- Payment integration only after provider and compliance checks.

### Phase 6 — Closed Beta

Invite a limited number of trusted, verified 18+ furry creators. Test posting, media, feeds, hashtags, search, messaging, moderation, reports, adult-content controls, Prime, boosts, performance, accessibility, and security.

### Phase 7 — Public Launch

Focus on onboarding, moderation response, reliability, bug fixes, feedback, backups, monitoring, and operational readiness.

### Phase 8 — Later Enhancements

Consider creator subscriptions, tips, analytics, commission tools, creator shops, communities, groups, events, livestreaming, custom profile layouts, APIs, and mobile apps after the core platform is stable.

## 18. Testing and Acceptance Criteria

For each implemented feature:

1. Add or update automated tests.

2. Test authorization and unauthorized access.

3. Test invalid input and failure states.

4. Test persistence across reloads and sessions.

5. Test responsive layouts where relevant.

6. Run linting, type checks, tests, and production builds.

7. Fix regressions before moving on.

Specifically test:

- A blocked user cannot interact through alternate endpoints.

- Private bookmarks are not visible to other users.

- Adult media does not leak into restricted feeds or direct URLs.

- Users cannot grant themselves admin permissions.

- Duplicate interactions are safely rejected or idempotent.

- Reports and moderation actions persist and are auditable.

- Appeals can be submitted and reviewed.

- Prime-only features cannot be unlocked by changing client data.

- Deleted or inaccessible media cannot be retrieved through stale public links.

- Rate limits and upload validation are enforced server-side.

Do not claim a feature is complete unless it is implemented and verified. Distinguish unit tests, integration tests, and checks that require live external services.

## 19. Working Rules for Kilo

- Work directly in the existing repository.

- Make small, coherent, reviewable changes.

- Follow existing code conventions unless there is a justified improvement.

- Do not replace working files with simplified mock implementations.

- Do not disable security checks to make tests pass.

- Do not hardcode credentials, users, payment status, or production data.

- Do not silently ignore errors.

- Do not invent successful results from unrun tests.

- Do not run destructive commands or production migrations without authorization.

- Do not repeatedly ask the user to run commands that have already been run; inspect available logs and results first.

- If a required external service is not configured, implement a safe integration boundary, document the missing configuration, and continue with unrelated work.

- Keep `.env` secrets out of source control and provide a safe `.env.example`.

- Update documentation as implementation changes.

- Keep the application usable at every completed phase.

## 20. End-of-Phase Report

At the end of each phase, report:

- Features implemented.

- Important files created or changed.

- Database changes and migrations.

- Tests and build commands actually run.

- Exact results, including failures.

- Security considerations addressed.

- External services or credentials still required.

- Known bugs or incomplete features.

- The next phase to implement.

Do not stop after the initial audit or phase plan. Once the audit is documented, begin Phase 1 and continue into implementation. Work through the phases systematically, keeping the project stable and testable.

## Final Requirement

Use `AfterFur_Full_Platform_Plan.txt` as the source of truth for the product vision and planned features. Preserve its terminology and priorities. Where a technical or legal detail is unspecified, document the decision and its rationale instead of pretending it was specified.

**Build AfterFur as a real, secure, usable social platform—not just a design mockup.**

---
Alignment note: The TXT is the source of truth. Kilo must inspect the existing repository, follow development phases, build working features, avoid fabricated data, preserve working code and credentials, use Next.js/React/TypeScript with Supabase/PostgreSQL, implement RLS and server-side authorization, keep design-system consistency, accessibility and empty states, keep secrets out of client code, and run/report checks.
21. Current Project Status and Immediate Priorities (Updated 2026-10-26)
This section supplements the original master instructions. It does not replace the full platform plan or remove any requirements above.
21.1 Existing application — do not start over
The application already exists and is being developed in:
- Project directory: D:\Afterfur
- Development environment: Windows, VS Code, Kilo
- Local URL: http://localhost:3000
Continue from the existing codebase, routes, components, database schema, authentication, storage, and styling system. Do not treat the repository as empty, replace it with a starter template, or discard working features or user data.

The product source of truth is AfterFur_Full_Platform_Plan.txt. Read that file and this master instruction document together. Follow newer explicit instructions from the owner when they clarify the current task, while preserving the original product requirements.
21.2 Latest owner-reported manual checks
The owner reports that the following currently work:
- Clicking profile avatars, names, and usernames to open profiles.
- Opening a post detail page and navigating back.
- Like, repost, and bookmark interactions, including active states.
- The profile Media tab displaying a media gallery.
Known outstanding issue:
- Replying is still broken.
Kilo reported that the TypeScript typecheck passed, but its own live browser/end-to-end verification was not performed. Do not treat a passing typecheck as proof of working UI flows. These statuses are based on the owner's manual checks and must be regression-tested after UI changes.
21.3 Immediate priority: finish the UI/UX overhaul first
The current task is to redesign and polish the actual existing AfterFur application. Do not stop at another audit, implementation plan, typecheck, or verbal report. Make real code changes to the running application's components and styles.

Use X/Twitter as a usability and interaction reference, not as a pixel-for-pixel copy. Keep AfterFur's own creator-first furry-community identity and existing brand.

The overhaul should cover all applicable existing routes and components:
- Shared app shell, page widths, column proportions, navigation, active states and sidebars.
- Home, Explore and all existing feed modes.
- Post cards, author rows, action bars, post details and conversation layouts.
- Post composer, media attachments and upload states.
- Profiles, profile headers, tabs, follow controls and creator information.
- Media-only profile gallery for photos, GIFs and videos.
- Search, suggestions, results and hashtag pages.
- Notifications and bookmarks.
- Messages, if already implemented.
- Settings and account screens.
- Dropdowns, popovers, dialogs, modals and confirmation flows.
- Loading skeletons, empty states, errors and retry behaviour.
- Desktop, tablet and mobile responsiveness.
- Accessibility, keyboard navigation and reduced-motion behaviour.
Do not create fake production posts, users, statistics or interactions to make the interface look populated. Every visible control must work or be clearly marked as unavailable/not implemented.
21.4 Shared design system and visual quality
Use the project's existing framework and styling conventions. Create or refine reusable design tokens and components for:
- Colours and surface/backgrounds.
- Typography and readable line lengths.
- Spacing and alignment.
- Page widths and responsive columns.
- Borders, radii and shadows.
- Avatars and icons.
- Buttons, inputs, tabs and badges.
- Hover, focus, pressed, active, disabled and loading states.
- Dialogs, menus, toasts and errors.
The result should feel cohesive, polished and production-quality. Use restrained animations and transitions. Avoid excessive glow effects, random gradients, inconsistent spacing, oversized cards, excessive empty space, unintended coloured bands, clipped menus, layout shifts and horizontal overflow. Preserve AfterFur branding and theme while improving consistency.

Ensure icon-only controls have accessible names, keyboard focus is visible, contrast is readable, touch targets are usable, and reduced-motion preferences are respected.
21.5 Preserve functionality and original platform scope
Do not break or remove the working functionality listed in Section 21.2. Preserve authentication, existing routes, database data and relationships, media storage, permissions, and existing architecture unless a change is technically necessary and safe.

The redesign must continue to support the full product vision in AfterFur_Full_Platform_Plan.txt, including future adult-content controls, After Dark, creator tools, anti-AI policy, anti-art-theft reporting, human moderation, appeals, Prime, boosts, privacy and security. Do not silently remove planned features just because they are not implemented yet, and do not claim planned features already exist when they do not.

Use the authenticated session and canonical database relationships for user and post identity. Never hardcode a user's identity, production counts or post content. Enforce authorization on the server, not only in the UI.
21.6 Cross-platform consistency requirements
Across Home, Explore, Search, profiles, replies, notifications, bookmarks, media and post detail pages:
- Resolve the same post to its correct canonical author everywhere.
- Preserve the original author's identity on reposts and quote posts.
- Make user identity links navigate to the correct profile.
- Keep post links pointed at the correct post.
- Persist likes, reposts and bookmarks against the authenticated user.
- Keep private bookmarks private and enforce that rule server-side.
- Use consistent blue active states for like/repost/bookmark controls, compatible with the current theme (for example #3B82F6).
- Prevent nested action controls from triggering a parent post-card click handler.
- Use semantic links for navigation and buttons for actions.
- Provide loading, empty, failure and retry states.
21.7 Profile Media tab
The profile Media tab must remain a media-only gallery, not a list of full post cards.
- Use a responsive thumbnail grid, typically three columns on desktop.
- Support photos, animated GIFs and videos.
- Provide media-type filters where supported.
- Preserve useful image aspect ratios and show a play indicator for videos.
- Avoid duplicate thumbnails for multiple attachments.
- Only show media belonging to the selected profile.
- Open an appropriate media viewer or the original post when a thumbnail is selected.
- Include loading, empty and error states.
- Use actual database/storage content, not mocked production data.
21.8 Reply system — fix after the UI/UX overhaul
Replying is the known broken feature from the latest owner report. Do not let it block the current UI/UX work. Preserve and style its existing controls during the redesign, then repair the complete reply flow immediately afterward.

The fix must include:
- Replying to an original post.
- Replying directly to a comment or another reply.
- Correct root-post and direct-parent relationships.
- Authenticated author attribution.
- Server-side validation and authorization.
- Database persistence.
- Correct rendering in conversation detail and the author's Replies tab.
- Accurate counts without double-counting.
- Loading, disabled, success and failure states.
- Duplicate-submission prevention.
- Correct links to the original post and user profiles.
- Persistence after refresh and direct conversation navigation.
Do not count a visible button or opened composer as a completed feature. Trace the UI-to-server-to-database path and test the result.
21.9 Required implementation sequence
1. Read both AfterFur_Full_Platform_Plan.txt and this master instruction document.
2. Briefly inspect the existing shared layout and styling system; do not repeat the audit unnecessarily.
3. Implement the shared design system and application shell.
4. Redesign navigation, feed layout, post cards and interaction controls.
5. Redesign profile pages and the media gallery.
6. Redesign Search, Notifications, Bookmarks, composer, menus, dialogs and other existing pages.
7. Finish responsive layouts, accessibility and visual polish.
8. Run available type checks, linting, tests and production build.
9. Run the app and perform browser checks where possible; regression-test the working flows listed in Section 21.2.
10. Once the UI/UX overhaul is complete, fix the reply system end-to-end.
11. Verify replies and rerun relevant checks.
12. Report what was actually changed and tested, separating VERIFIED, FAILED and NOT TESTED.
If browser control is unavailable, continue implementing the code. State exactly what could not be verified and give the owner a short, specific manual checklist. Do not stop all work just because browser testing is unavailable.
21.10 Completion standard
The UI/UX task is not complete merely because TypeScript passes or an audit has been written. The actual pages and shared components must be redesigned, responsive behaviour addressed, and working interactions regression-tested where possible.

The reply task is not complete until a reply can be submitted, persisted, shown under the correct parent and still be present after refresh.

Keep the platform identity intact:

AFTERFUR — Social media, after dark.

An 18+ furry social platform built for creators and the community.
No AI-generated content. Real human moderation. Creator-focused. Community-driven.

AFTERFUR — ADDITIONAL UI/UX AND PLATFORM REQUIREMENTS

Please incorporate these requirements into the existing AfterFur Full Platform Plan and Kilo Master Instructions. Preserve all existing requirements.

### 1. Separate Settings from Edit Profile
Settings and Edit Profile are different pages with different purposes.

Edit Profile is for public-facing profile details such as display name, username, avatar, banner, bio, links and supported creator information.

Settings is for account management, security, privacy, notifications, content preferences, accessibility, display, language, subscriptions and other platform preferences.

Do not combine these pages into one form.

### 2. Settings interface
Use the supplied X Settings screenshot as a layout reference:
- A clear settings navigation panel.
- Search Settings field.
- A separate content panel for the selected category.
- Clear headings, descriptions, icons and navigation indicators.
- Consistent spacing, borders and active selection states.
- Responsive behaviour on mobile, where settings categories and detail pages should remain easy to navigate.

Implement settings categories appropriate to AfterFur:
- Your account.
- Security and account access.
- Privacy and safety.
- Notifications.
- Content preferences.
- Accessibility, display and languages.
- Monetization and creator tools.
- Premium.
- Moderation and safety tools, visible only to authorized roles.
- Help and legal resources.

Only expose settings that are implemented. Unimplemented options must not pretend to save changes.

### 3. Blocking and muting
Add Block and Mute actions to appropriate profile and post menus.

Implement persistent relationships, authorization and clear confirmation/feedback. Apply block and mute rules consistently across supported feeds, profiles, search, replies, notifications and messages.

Provide a place in Privacy and Safety settings to review and manage blocked and muted accounts, including unblock and unmute actions.

### 4. Reporting
Allow reports for supported content and accounts, including posts, replies and profiles.

Provide a reporting flow with reason selection, optional details, confirmation, secure persistence, duplicate/spam protections and clear feedback.

Create the necessary report-management workflow for moderators. Reports must not be publicly visible to the reported user or other ordinary users.

### 5. Moderator and Admin dashboards
Create separate protected interfaces for moderation and administration.

Moderator tools should support reviewing reports, viewing relevant content and context, tracking case status, recording decisions and taking only authorized actions.

Admin tools should support appropriately restricted account/role management, platform configuration, moderation oversight, audit logs and operational monitoring.

Enforce role-based access control on the server for every privileged operation. Hiding a link in the UI is not sufficient. Record security-sensitive moderation and admin actions in an audit log. Do not give every moderator full administrator access.

### 6. Follow the existing project and full plan
Before implementing, check the existing database schema, role system, routes, authentication and original TXT/MD requirements. Reuse existing infrastructure where possible and create safe migrations only when necessary.

Do not break existing features or hardcode sample data. Implement real functionality with proper validation, persistence, authorization, loading states, error states and tests.

Keep the current priority order:
1. Complete the existing UI/UX overhaul.
2. Verify that working functionality has not regressed.
3. Fix the known reply-system issue.
4. Implement the additional blocking, reporting, moderation and admin functionality in a safe, planned phase.

Update the project documents so these requirements remain part of the official AfterFur scope.