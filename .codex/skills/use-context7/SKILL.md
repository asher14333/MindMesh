---
name: use-context7
description: Use Context7 to fetch authoritative, up-to-date library, framework, SDK, CLI, and API documentation before answering or editing code that depends on external tools. Trigger when the task involves library or API documentation, code generation from framework docs, installation, setup, configuration, migrations, or resolving version-specific behavior.
---

# use-context7

Use Context7 whenever the task depends on external library or API behavior.

## Workflow

1. Identify the external dependency names and versions from the user request and the repo.
2. Resolve the library with Context7 before answering or changing code unless the user already provided a Context7 library ID.
3. Query the docs for the exact task: API usage, setup, configuration, migration, CLI commands, or version-specific patterns.
4. Adapt the documented pattern to the local codebase instead of copying examples blindly.
5. Mention the library ID or version used when it materially affects the answer or implementation.

## Rules

- Default to Context7 even when the user does not explicitly ask for documentation lookup.
- Prefer exact library matches, official sources, and version-specific docs when the version is known.
- Use Context7 before proposing install commands, config files, framework setup, or generated code that relies on third-party APIs.
- Skip Context7 only when the task is purely internal to the repo, the external behavior is not relevant, or the user explicitly tells you not to use it.
- If Context7 cannot resolve the library, say so briefly and then fall back to the best available primary source.
