# NoteBooks Developers

Public documentation for contributors and curious readers of the NoteBooks platform. Browse this repository from the native **Developers** destination in NoteBooks-Framework.

## Navigation

- [Architecture](architecture/README.md)
- [Database model](DATABASE.md)
- [AI implementation](AI.md)
- [Policies and licensing](policies/README.md)
- [Content API](api/README.md)
- [Renderer test subjects](test-subjects/README.md)
- [Research and development](research-and-development/README.md)
- [Desmos 2D DSL reference](DESMOS-2D.md)
- [Desmos 3D DSL reference](DESMOS-3D.md)
- [Update workflow contract](docs/CONTENT-UPDATE-CONTRACT.md)
- [Project roadmap](PLAN.md)
- [Maintainer operations](ADMIN-OPERATIONS.md)
- [GNU GPL v3.0 license](LICENSE.md)

## Publishing

Documentation is sourced from this repository and indexed from the Supabase-backed catalog by NoteBooks-Framework. A push to `main` regenerates `files.json` and sends a signed update notification. The notification queues a sync; it does not deploy the website.

See [the update contract](docs/CONTENT-UPDATE-CONTRACT.md) for workflow behavior. Original material in this repository is licensed under [GNU GPL v3.0 only](LICENSE.md); third-party material remains under its own terms.
