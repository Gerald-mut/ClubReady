# Phase 3.5: Club membership management

Goal: two users can belong to the same club; an unrelated user cannot read or modify its private records.

Design: invite codes (don't look up users by email; that leaks which emails are registered).

Database (new migration only; don't edit old ones):
- Table club_invites: id, club_id, role (club_admin|club_member), token_hash (store a hash, never the raw token), created_by, expires_at (default 7 days), max_uses/used_at, revoked_at.
- RLS: only admins of that club can create/list/revoke its invites. Nobody can read token_hash from the client.
- RPC create_club_invite(club_id, role): admin-only, returns the raw token once.
- RPC accept_club_invite(token): authenticated user joins with the invite's role. Single use, rejects expired/revoked, idempotent if already a member.
- RPC set_member_role(club_id, user_id, role) and remove_member(club_id, user_id): admin-only. Block demoting or removing the last admin.
- All functions: SET search_path, REVOKE EXECUTE from public/anon, GRANT to authenticated, no client-supplied trust of roles.
- Keep members unable to self-promote; no direct INSERT/UPDATE on club_members from the client.

UI (reuse existing components and design):
- Club Profile "Members" section: list members with roles (admins see controls; members read-only).
- Admin: "Invite" button, which generates a link/code to copy, with a role choice. Revoke invite. Promote/demote/remove with confirmation.
- "Join a club" page: paste a code or open /join/:token. Handle sign-in redirect (return to the invite after login/sign-up) without redirect loops.
- Loading, error and success states. Mobile-first.

Tests:
- SQL: two-user same-club access works; unrelated third user is denied; member cannot self-promote or create invites; expired, revoked and reused tokens fail; last-admin protection holds.
- Frontend: members list by role, invite flow, join flow, error states.