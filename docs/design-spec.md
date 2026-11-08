ClubReady 254 — Design Specification
Source of truth
Reproduce the original interactive example #4 shown in the conversation. This is a restrained visual restyling, not a new concept. The only intentional visual change from that example is replacing its green accent with muted orange. Do not follow the earlier bright-orange/Shakhtar redesign instructions.

Design tokens
--color-ink: #111111 — headings, body emphasis, black feature card, primary action surfaces
--color-white: #FFFFFF — page and card backgrounds
--color-canvas: #F4F4F2 — secondary statistic cards and quiet backgrounds
--color-muted: #777777 — supporting descriptions and inactive states
--color-accent: #C45A16 — small PLAYPROOF/section labels, View all text links, selected navigation indicator, focused input border
--color-border: #E5E5E5 — subtle borders/dividers
--color-on-dark: #FFFFFF — text on black feature card
--color-on-dark-muted: #D0D0D0 — supporting text on black feature card
For smaller orange text, verify WCAG AA contrast; darken the accent where necessary without increasing its visual prominence.
Never use orange as a filled button background, card background, hero background, large title color, or decorative flourish. Avoid gradients, pitch graphics, loud icons and unnecessary shadows. The design is 90% monochrome.

Layout — exact reference structure
Compact top bar: black shield/logo tile + clubready wordmark on left; profile icon on right. Do not show the signed-in email and sync message as large permanent header rows.
Club overview: small uppercase accent eyebrow, bold Test Club. heading, muted location/established line.
Two side-by-side light grey stat cards with bold black numbers and muted captions.
Black PlayProof feature card: small orange PLAYPROOF eyebrow, white heading Every match tells a story., grey supporting copy, neutral white or black-and-white action treatment matching original #4. Not an orange-filled CTA.
Opportunities preview: black heading, small muted-orange View all link, simple bordered white opportunity card with metadata.
Mobile bottom navigation: Home, PlayProof, Explore, Club; icons and labels; active accent orange only where original green indicated selection, inactive grey. On desktop, use a responsive equivalent without wrapping the navigation.
Screens
Sign in / create account / password reset: separate public/auth shell; centered narrow form; no authenticated bottom nav; full-width aligned fields, labels above, clear errors; monochrome primary button.
Home: club overview, stat cards, black PlayProof feature, opportunity preview.
PlayProof: simple heading and short intro, full-width consistent controls; activity type, title, date, location, participants, notes, images; keep local save, sync and offline indicators usable. Group related inputs without making the page visually heavy.
Explore: quiet search/filter row, simple opportunity cards; retain verified status, historical/demo labels, deadlines, eligibility, how to apply, original source links. Do not imply historical calls are open.
Club: overview, role, established date, contact/about, then list rows for members, invitations, documents, evidence package; preserve role-based actions.
Invitations / documents / evidence: use consistent card and form components, clear empty states, file validation and status feedback.
Component rules
Use one spacing scale based on 4px/8px; page padding ~16–20px mobile; consistent vertical gaps.
Inputs/selects/date fields: 100% width, approximately 48–52px minimum height, aligned labels, same border and radius.
Buttons: consistent sizes, primarily black-filled or neutral; never orange-filled.
Rounded cards: subtle borders, little/no shadow, restrained radius.
Typography: clean sans-serif, bold headings, readable body, consistent line height; avoid oversized body copy.
All tap targets >=44px, clear keyboard focus, readable contrast, no horizontal overflow at 360px/390px/430px.
Implementation constraints
Inspect existing framework and components first. Reuse the project's current styling approach where sensible. Centralize tokens and reusable primitives. Preserve existing routes, API contracts, permissions, data, offline persistence, sync, and file uploads. Do not change backend/database or introduce fake production data. Run build/tests and check mobile/desktop responsiveness.

Acceptance criteria
The finished app visually matches interactive example #4, except muted orange replaces green in small accent elements. Black PlayProof card, white/grey backgrounds, neutral buttons, compact header, clean aligned forms, and bottom navigation are retained. No bright orange surfaces or extra sports-themed graphics.

Draggable item chatgpt-project-conversation:g-p-6aef465628cc819187b63c3bec5c8afb:6af04d49-663c-83ea-8b4f-30ec850e7b0f was dropped.



⋮⋮⋮⋮⋮⋮⋮⋮