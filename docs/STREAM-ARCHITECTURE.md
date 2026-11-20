# Stream architecture

## Stream model

Each workspace is keyed by a stream slug. The current library includes lower-secondary, science, commerce, humanities, and developer streams.

The browser shell is route-driven. Routes such as `/science`, `/commerce`, `/humanities`, and `/developers` use the shared library workspace and load the matching public tree generated from the Supabase catalog.

## Stream responsibilities

- Science: subject content repositories and study libraries
- Commerce: commerce subject repositories and optionally empty configured workspace roots
- Humanities: humanities repositories and related curriculum material
- Developers: architecture references, public policies, API documentation, renderer test subjects, and parser research from `fsr-official/NoteBooks-Developers`

## Ordering and prioritization

The stream UI sorts folders before files and keeps pinned entries at the top. In the subject workspaces, entries matching NCERT-* are intentionally pinned at the top. This is a presentation rule, not a content rule.

The Developers stream is a first-class destination in the top navigation and landing page. Like the subject streams, it is backed by repository/file rows in Supabase; the developer tree is a derived public index, not a local filesystem mount.
