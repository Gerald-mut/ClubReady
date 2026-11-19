# Phase 6: Opportunities catalogue

Goal: the same club can compare its existing information against at least two different sets of published requirements. No scraping, no readiness engine yet, no PDF export.

Database (new migration only):
- opportunities: id, title, organiser, description, source_url, application_method, application_url, deadline (nullable), status (open|closed|historical), review_date, is_demonstration (bool, true for closed examples), created_at.
- opportunity_requirements: id, opportunity_id FK, version int, requirement_type (document|activity|club_info|other), document_type (nullable, matches evidence categories), description, min_count (nullable), source_note, is_current.
- application_tracking: id, club_id, opportunity_id, status (not_started|preparing|submitted|outcome_received), notes, updated_by, updated_at; unique(club_id, opportunity_id).
- RLS: opportunities and requirements readable by any authenticated user, writable by nobody from the client (seed via migration/seed file only). application_tracking: club members read; club admins write for their own club only. No recursive policies.
- Seed file: at least 3 real documented opportunities with source URL and review date. Closed ones clearly labelled historical/demonstration. Mark anything you could not verify, don't invent requirements.

UI (reuse existing design):
- Opportunities list with status badges and a clear "Demonstration only" label where relevant.
- Detail page: requirements with their source link and review date, plus an application tracking status control for admins.
- A simple side-by-side view: the club's current evidence (by document_type) and activity counts versus each requirement, shown as "supplied / not supplied" only. Do not label anything verified or eligible.

Tests: SQL (read-only for clients, cross-club tracking isolation, admin-only writes), frontend (list, detail, tracking updates, permissions).