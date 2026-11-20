# NoteBooks Developers

Public documentation for contributors and readers of the NoteBooks platform. This repository is served through the native **Developers** destination in NoteBooks-Framework.

## Documentation

### Architecture

- [System architecture](architecture/ARCHITECTURE.md)
- [Database and repository catalog](architecture/DATABASE.md)
- [AI chat implementation](architecture/AI-PROJECT.md)
- [Admin operations and recovery](architecture/ADMIN-OPERATIONS.md)
- [Signed content update contract](architecture/CONTENT-UPDATE-CONTRACT.md)

### APIs and repository configuration

- [Content API overview](api/API.md)
- [v1 endpoint reference](api/APIv1.md)
- [API client skill](api/SKILL.md)
- [GitHub repository reference snapshot](docs/GITHUB-REPOSITORIES.md)
- [Project roadmap](docs/PLAN.md)

### Rendering and research

- [Renderer fixtures and Desmos DSL references](desmos-dsl/README.md)
- [Desmos implementation audit](desmos-dsl/AUDIT.md)
- [MDX compiler proposal](research-and-development/mdx-compiler.md)

### Policies and licensing

- [Public policies](policies/README.md)
- [License scope](policies/LICENSE-STATUS.md)
- [GNU GPL v3.0 license text](LICENSE.md)

### AI-assisted development

- [Claude context index](https://github.com/fsr-official/NoteBooks-Developers/blob/main/.claude/CONTEXT.md)
- [Claude Code skills](https://github.com/fsr-official/NoteBooks-Developers/tree/main/.claude/skills)

## Publishing

The Framework reads this repository through its Supabase-backed catalog. A push to `main` regenerates `files.json` and sends a signed update notification. The notification queues a synchronization; it does not deploy the website. See the [content update contract](architecture/CONTENT-UPDATE-CONTRACT.md).

Original documentation and code in this repository is licensed under [GNU GPL v3.0 only](LICENSE.md). Third-party works and learning materials remain under their own terms; the vendored `find-skills` guide retains its upstream MIT license.
