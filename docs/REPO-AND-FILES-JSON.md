# Repository and files.json model

## Catalog model

The NoteBooks-Framework Supabase catalog is the source of truth for enabled repositories, branches, stream assignments, and file metadata. Its private admin dashboard manages live catalog changes. This repository's `GITHUB-REPOSITORIES.md` is a reference snapshot and is not a live control plane.

Each entry includes:

- name
- stream
- repo
- branch
- root
- enabled
- priority
- pages
- empty
- LFS
- optional `fallback` (`github-tree`) for repositories without `files.json`

The Framework generates public repository and per-stream indexes from the catalog. These JSON documents are derived and can be rebuilt; they are not edited as the source of truth.

## Manifest generation

An enabled repository publishes a `files.json` manifest with relative paths and Git blob SHAs. A signed notification queues a sync that compares file records in Supabase and rebuilds the affected stream index.

Raw and media routes verify that a requested file is part of the catalog before serving it. Repository membership and the file SHA are validated by the server; generated tree entries expose only the paths and metadata required by the reader.

See [the signed update contract](CONTENT-UPDATE-CONTRACT.md) for the workflow request, authentication, and processing path.
