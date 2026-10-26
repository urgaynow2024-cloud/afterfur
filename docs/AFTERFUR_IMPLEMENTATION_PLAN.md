# AFTERFUR IMPLEMENTATION PLAN

## Phase A — Repository Audit

### Stack
- Next.js 16.4.3 (App Router, webpack build)
- React 19, TypeScript
- Tailwind CSS 4 (PostCSS)
- Supabase (client: `src/lib/supabase/client.ts`)
- Auth: `src/components/AuthProvider.tsx`

### Routes
Home `/`, Explore `/explore`, Search `/search`, Notifications `/notifications`, Messages `/messages`, Bookmarks `/bookmarks`, After Dark `/after-dark`, Profile `/profile`, Settings `/settings`, Sign In `/signin`, Sign Up `/signup`, Forgot/Reset password, Privacy/Terms/Guidelines/Safety, Post detail `/posts/[id]`.

### Components
- `Shell.tsx`: layout, nav, PageHeader, EmptyState. Uses `usePathname` (wrapped in Suspense).
- `AuthProvider.tsx`: session/user context.
- `PostCard.tsx`: feed card.

### Supabase data flow (client)
- Posts: `supabase.from("posts")` select/insert.
- Replies: `replies` table insert/select by `post_id`.
- Profiles: `profiles` table.
- Auth: `supabase.auth`.

### Status (initial)
- Auth/profile mapping: PARTIAL (needs server verification)
- Posts/replies/likes/reposts/bookmarks/follows/media/notifications: to be traced in code.

### X feature comparison (initial)
| X capability | AfterFur equivalent | Status | Work needed |
|---|---|---|---|
| Home feed | `/` feed | PARTIAL | real follows-based feed |
| Post detail | `/posts/[id]` | PARTIAL | reply fix |
| Likes/reposts/bookmarks | PostCard actions | PARTIAL | persistence verified |
| Profiles | `/profile` | PARTIAL | tabs/media |
| Search/Explore | `/search`,`/explore` | PARTIAL | real data |
| Notifications | `/notifications` | PARTIAL | real events |
| Messages | `/messages` | PARTIAL | real DMs |
| Settings | `/settings` | PARTIAL | categories |

### Next steps
- Implement shared design system tokens in `globals.css`/Shell.
- Fix reply system after UI/UX.
- Add server-side authorization and RLS review.
