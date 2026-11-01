# STAGE 21A FINAL BLOCKING TEST PLAN (corrected final)

## Database tests

- Anonymous SELECT profiles/posts allowed (no permission errors).
- Authenticated SELECT profiles/posts allowed when not blocked.
- A blocks B and reverse: bidirectional visibility.
- Follow/like/repost/reply insert/update blocked both directions.
- Notification suppression both directions.
- Missing actor_id allowed (system); empty/malformed/invalid UUID rejected.
- NULL actor rejection via IS DISTINCT FROM.
- Service-role execution path distinguished.
- Arbitrary block lookup denial: is_blocked not callable by anon/authenticated.
- is_current_user_blocked callable by anon and authenticated; returns false for NULL auth.uid().
- Unblocking restores access.
- Third account C unaffected.
- Migration rerun safety.
- Rollback restores original bidirectional policies (posts_block_bidirectional, profiles_block_bidirectional), original public-read policies, and original is_blocked EXECUTE permission for PUBLIC.
- No permission errors on RLS evaluation.

## Browser tests

- UI block/unblock flows; feed/profile filtering.
