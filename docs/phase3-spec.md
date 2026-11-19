# ClubReady 254 — Phase 3: Authentication and Club Profile Management

You are a senior full-stack engineer working on **ClubReady 254**, a mobile-first, offline-first cloud platform that helps grassroots football clubs in Kenya maintain organisational records, document activities, and prepare evidence for funding and development opportunities.

## Project context

The application has four main screens:

1. Club Profile
2. PlayProof — Activity Recording
3. Opportunities & Readiness
4. Evidence Package

We are currently implementing **Phase 3: Authentication and Club Profile Management**.

Do not implement PlayProof, offline synchronisation, the opportunity requirements engine, or evidence-package generation yet.

### Technology stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Supabase Authentication
- Supabase PostgreSQL
- Supabase Storage
- Dexie.js / IndexedDB (reserved for the future offline-first module)

## Step 1 — Inspect the existing repository

Before modifying anything:

1. Inspect the existing project structure, package.json, routing, styling, components and configuration.
2. Identify functionality that already exists.
3. Determine which dependencies are missing.
4. Check whether Supabase has already been configured.
5. Present a brief implementation plan.

Important:
- Do not recreate the project.
- Do not overwrite existing functionality.
- Reuse existing components and design conventions.
- Keep changes limited to Phase 3.
- Do not execute destructive database operations.

## Step 2 — Implement Supabase authentication

Implement email/password authentication with:

- Sign-up page
- Sign-in page
- Sign-out
- Forgot-password page
- Reset-password page
- Session persistence
- Protected routes
- Loading and error states
- Email confirmation handling when enabled

Routing requirements:

- Unauthenticated users are redirected to sign-in when accessing protected pages.
- Authenticated users without a club are redirected to club setup.
- Authenticated users with a club are redirected to their club profile or dashboard.
- Avoid authentication redirect loops.
- Do not redirect users away from the password recovery flow.

Use the official Supabase JavaScript client and environment variables:

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Never expose service-role keys or database passwords in frontend code.

## Step 3 — Implement the agreed database model

Create version-controlled Supabase SQL migrations for the following tables.

### Table 1: clubs

Fields:

- id: UUID primary key
- name: TEXT, required
- county: TEXT, required
- sub_county: TEXT, optional
- year_established: INTEGER, optional
- description: TEXT, optional
- contact_email: TEXT, optional
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

Add reasonable validation constraints and automatically maintain updated_at.

### Table 2: club_members

Fields:

- club_id: UUID, foreign key to clubs
- user_id: UUID, foreign key to auth.users
- role: TEXT, restricted to club_admin or club_member
- joined_at: TIMESTAMPTZ

Use a composite primary key on (club_id, user_id).

A user may belong to multiple clubs, but the application can initially select the first available club or allow the user to select a club if multiple memberships exist.

### Table 3: evidence

Fields:

- id: UUID primary key
- club_id: UUID, foreign key to clubs
- uploaded_by: UUID, foreign key to auth.users
- document_type: TEXT
- file_name: TEXT
- storage_path: TEXT
- mime_type: TEXT
- file_size: BIGINT
- status: TEXT, default supplied
- expires_at: DATE, optional
- uploaded_at: TIMESTAMPTZ

Supported document categories:

- club_registration
- coach_qualification
- annual_work_programme
- safeguarding_policy
- governing_body_resolution
- financial_report
- other

All uploaded evidence must initially have the status "supplied". Do not automatically mark documents as verified.

Design the evidence table so that future migrations can associate evidence with PlayProof activities and opportunity requirements.

Do not implement those relationships yet.

## Step 4 — Database security

Enable Row Level Security on all three tables.

Implement secure policies ensuring:

- Authenticated club members can read their own club's permitted information.
- Club administrators can update their club's profile.
- Club administrators can upload and manage their club's evidence.
- Members cannot grant themselves administrator privileges.
- Users cannot access private records belonging to unrelated clubs.
- Users cannot change club_id or uploaded_by to impersonate another club or user.

Implement club creation through a secure PostgreSQL function or equivalent trusted server-side operation.

Club creation must atomically:

1. Create the club.
2. Add the authenticated creator to club_members.
3. Assign the creator the club_admin role.

Do not trust client-supplied roles.

Avoid recursive RLS policies and insecure SECURITY DEFINER functions. Explicitly set safe search paths and restrict function execution privileges where appropriate.

Include security tests for two unrelated clubs.

## Step 5 — Build the club setup interface

Create a responsive mobile-first club onboarding form with:

- Club name (required)
- County (required)
- Sub-county (optional)
- Year established (optional)
- Description (optional)
- Contact email (optional)

Requirements:

- A coach can create a club after signing in.
- Creating a club does not require registration documents.
- Validate required fields.
- Prevent duplicate submissions.
- Show loading, success and error states.
- Redirect to the club profile after successful creation.

## Step 6 — Build club profile management

Create a Club Profile screen displaying:

- Club name
- County and sub-county
- Year established
- Description
- Contact email
- Club documents
- Current user's membership role

Allow club administrators to edit club information.

Club members should have read-only access to administrator-controlled information.

Ensure the layout works well on mobile devices.

### Design direction

Use a clean, modern, professional interface:

- White background
- Simple typography
- Clear visual hierarchy
- Minimal cards and borders
- Accessible form inputs
- Responsive layouts
- Consistent navigation
- No excessive gradients, animations or decorative elements

Preserve the existing project's design system where one already exists.

## Step 7 — Implement document management

Use a private Supabase Storage bucket named:

club-evidence

Supported formats:

- PDF
- JPEG
- PNG

Maximum file size:

5 MB per file.

Implement:

1. Document upload.
2. Document type selection.
3. File validation.
4. Upload loading and error states.
5. Evidence metadata creation.
6. Document listing.
7. Secure document viewing and downloading.
8. Document deletion with confirmation.

Storage requirements:

- Store files under club-scoped paths.
- Use generated unique filenames to prevent collisions.
- Restrict upload, read and delete operations through appropriate Storage policies.
- Use short-lived signed URLs for private documents.
- Handle failures between uploading the file and saving its metadata.
- Do not make evidence files publicly accessible.
- Do not claim uploaded documents have been independently verified.

If the bucket cannot be created automatically, provide exact manual setup instructions.

## Step 8 — Code structure

Use modular, maintainable code.

Suggested organisation:

src/
- pages/auth/
- pages/club/
- components/auth/
- components/club/
- components/documents/
- hooks/
- services/
- types/

supabase/
- migrations/
- functions/
- tests/

Adapt this structure to the existing repository rather than forcing unnecessary restructuring.

Create reusable authentication and club-membership hooks or contexts where appropriate.

## Step 9 — Testing

Add or update tests for:

- Sign-up and sign-in
- Authentication session restoration
- Protected routes
- Club onboarding
- Club profile editing
- Role-based permissions
- Cross-club access denial
- Document upload validation
- Private document access
- Document deletion
- Password reset
- Authentication errors

Run the existing build, lint and test commands.

Fix any failures introduced by your implementation.

If integration tests require credentials or a running Supabase instance that is unavailable, do not invent successful results. Clearly document the tests that could not run.

## Step 10 — Documentation

Update README.md with:

- Installation instructions
- Environment variables
- Supabase configuration
- Database migration instructions
- Storage bucket configuration
- Authentication setup
- Local development commands
- Testing instructions
- Deployment considerations

Create or update .env.example with placeholder values.

Ensure secrets are not committed to Git.

## Final deliverables

When finished, provide:

1. Summary of implemented features.
2. List of files created or modified.
3. Database migrations added.
4. Security policies implemented.
5. Tests executed and their actual results.
6. Manual Supabase configuration still required.
7. Known limitations and recommended next steps.

## Important implementation rules

- Inspect the existing codebase before changing anything.
- Present the implementation plan before editing.
- Do not replace existing working functionality.
- Do not implement future phases.
- Do not add unnecessary services or dependencies.
- Prefer existing project conventions.
- Ensure all private data is protected by server-enforced permissions.
- Never put privileged Supabase credentials in frontend code.
- If a required external configuration is missing, implement what can be completed safely and explain what remains.
- Do not claim functionality works unless it has been tested.

**Begin by inspecting the repository and showing the implementation plan. Wait for my approval before making code changes.**