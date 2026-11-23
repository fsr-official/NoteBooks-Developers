# Responsive, Accessibility, and Web-Performance Audit

**Date:** 2026-11-22  
**Scope:** Local source and a local desktop/mobile browser pass for
`NoteBooks-Framework`.

## U-01 — P2 — Stream-page mobile layout pushes theme controls ahead of content

**Evidence**

- The workspace DOM places the side rail before the main panel:
  `NoteBooks-Framework/src/components/notebook-workspace.tsx:748-749, 814`.
- Only `.home-layout` gets an explicit mobile `order` swap:
  `NoteBooks-Framework/src/app/notebooks.css:371-374`.
- Theme groups are open by default:
  `NoteBooks-Framework/src/components/notebook-workspace.tsx:779`.

**Impact**

At ≤760px, stream/library users encounter a large theme panel before the library
heading, search controls, and file browser.

**Reproduction**

Open `/science` or `/commerce` at 390px width. Scroll to the library content;
the theme rail appears before or between it based on route layout.

**Fix**

Move/collapse the rail below or behind the content on non-home routes, or render
a compact mobile theme control outside the document flow.

**Confidence:** High.

## U-02 — P2 — AI drawers do not manage dialog focus

**Evidence**

- React chapter reader uses `role="dialog" aria-modal="true"`:
  `NoteBooks-Framework/src/components/chapter-bundle/chapter-reader.tsx:370-375`.
- Precompiled reader uses the same semantics:
  `NoteBooks-Framework/src/components/precompiled-html-reader/reader.tsx:278-283`.
- Escape handlers close the drawers but do not move or restore focus:
  `chapter-reader.tsx:226-233`,
  `precompiled-html-reader/reader.tsx:221-228`.

**Impact**

Keyboard focus can remain outside the dialog and continue to background controls,
violating the interaction implied by `aria-modal`.

**Reproduction**

Open “Ask AI” with a keyboard, press Tab repeatedly, and confirm whether focus
can reach controls behind the drawer.

**Fix**

Move focus to the close control or heading on open, trap focus while open,
restore focus to the trigger on close, and synchronize `aria-expanded`.

**Confidence:** High.

## P-01 — P2 — Reader and math dependencies may be eagerly connected to workspace routes

**Evidence**

- `MarkdownReader` is statically imported by the workspace:
  `NoteBooks-Framework/src/components/notebook-workspace.tsx:9`.
- Workspace styles import Markdown and KaTeX CSS:
  `NoteBooks-Framework/src/app/workspace-styles.ts:1-2`.
- Workspace styles are imported by broad routes, including home and login.

**Impact**

Home, account, login, and stream routes may pay for reader CSS/dependencies that
are not used until a file is opened.

**Fix**

Dynamic-import the reader only for `readerFile`, load math CSS only when an
equation or compiled page requires it, and split reader/page-route styles.

**Confidence:** Static dependency confirmed; transfer/CPU impact was not measured.

## P-02 — P2 — Image preview bypasses responsive optimization

**Evidence**

- Preview uses `next/image` with fixed dimensions and `unoptimized`:
  `NoteBooks-Framework/src/components/notebook-workspace.tsx:1162-1168`.

**Impact**

Large source images may be transferred instead of viewport-sized derivatives.

**Reproduction**

Open a large image in the library and inspect the `/api/media` response size and
image dimensions.

**Fix**

Remove `unoptimized` or provide a responsive size-aware media endpoint with
appropriate derivatives and cache headers.

**Confidence:** High that optimization is bypassed; actual cost depends on source
size.

## P-03 — P3 — Some reader typing animations ignore reduced-motion

**Evidence**

- Typing/caret/dot animations are present in
  `NoteBooks-Framework/src/app/reader-redesign.css:775, 819, 821`.
- The reduced-motion rule only disables selected transitions:
  `NoteBooks-Framework/src/app/reader-redesign.css:956-959`.

**Impact**

Users requesting reduced motion may still see animated chat status.

**Fix**

Disable typing, caret, pulse, and dot animations under
`prefers-reduced-motion: reduce`; retain static status text.

**Confidence:** High.

## P-04 — P2 — Mobile navigation is wide and overflow is only handled by horizontal scrolling

**Evidence**

- At ≤760px the top navigation uses `overflow-x: auto`:
  `NoteBooks-Framework/src/app/notebooks.css:362-369`.
- Local 390px browser pass found Science and later nav items outside the viewport
  until horizontal scrolling.

**Impact**

Important controls are discoverable only through horizontal scrolling rather
than a compact menu or prioritized navigation.

**Fix**

Use a mobile menu or reduce/prioritize nav items to keep primary destinations
visible and reachable.

**Confidence:** Browser-confirmed.

## Browser-check evidence

- Desktop viewport: 1440×900; no console errors.
- Mobile viewport: 390×844; no console errors.
- An earlier mobile pass reported no document-level horizontal overflow. That
  observation is superseded by the `/science` follow-up below.
- Full-page home screenshots were captured locally but are not production evidence.

## Browser follow-up — `/science` overflow at 390px

**Reported:** 2026-11-23 live browser pass; exact capture timestamp was not
supplied.

A later mobile pass found document-level horizontal overflow:

- `documentClientWidth=375`; `documentScrollWidth=479`.
- `.main-panel` was 375px wide with `scrollWidth=478`.
- Its `.workspace-layout` had `scrollWidth=472`.
- The top navigation is a separate horizontal scroll container: width 223px,
  `scrollWidth=664`, and `overflow-x:auto`. Its independently scrollable
  contents are not the same as the document-level overflow.

This contradicts the earlier no-document-overflow result above. Source
inspection found a plausible contributor in
`NoteBooks-Framework/src/app/notebooks.css`: `.library-view::before` is
decorative and has `width: 360px; right: -120px`. Its approximate excess is
consistent with the observed overflow, but this pseudo-element was not
independently isolated in the DOM, so it is a candidate rather than a proven
root cause.

No code was changed. The issue has not been independently reproduced at 320px,
and the decorative pseudo-element has not been verified as the cause.

