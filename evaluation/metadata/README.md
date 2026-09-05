# Evaluation metadata

Store only reviewed, de-identified, versionable manifests here. The canonical TypeScript schema is defined by `@project-bridge/benchmark`. It separates serializable sample metadata from locally resolved audio bytes and requires audio checksums, transcript annotation provenance, consent, licensing, and retention-policy references.

The `private/` directory and files matching `*.private.*` are ignored by Git for consent records, identity mappings, or other sensitive local metadata. That ignore rule is a backstop, not permission to place sensitive data in the repository. No sample manifest is included because language pairs, vertical, and collection protocol remain open.
