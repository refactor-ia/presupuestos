# Contributing to the Benchmark

There are two ways to contribute: **add a new model** or **improve an existing one**. The workflow differs substantially between them, so they are documented separately.

## Required workflow for every contribution

1. Search open and closed issues for duplicates. Add context to an existing issue when appropriate.
2. Open an issue before any work, including documentation and typos. Every PR requires a prior issue, with no exceptions.
3. Wait for the `status:approved` label before starting work.
4. Assign yourself and comment on the issue with your plan.
5. Fork the repository, then create a branch from `upstream/main` in your personal fork.
6. Implement and verify the change.
7. Open a focused PR from your fork to `upstream/main` and include `Closes #N` when the work is complete.

If scope or requirements are unclear, ask in the issue before starting work. If you stop work, comment with the current state, relevant evidence, and remaining work, then unassign yourself.

## Add a new model

This is the main contribution: add an LLM that is not yet in the benchmark.

1. Open an issue using the "New model" template to reserve the model and prevent duplicate work. Follow the required workflow above before implementation.
2. In your personal fork, create a branch: `feat/<model>` (for example, `feat/gemini`).
3. Create the model directory at the repository root: `my-model/`.
4. Copy the canonical `.ai/` directory into it:
   ```bash
   cp -r .ai my-model/
   ```
5. Do not modify the canonical files in the root `.ai/` directory. They are the shared benchmark source of truth. Changing them makes the other implementations no longer comparable.
6. Give the model `KICKSTART.md`, the constitution, the spec, and the plan. It must implement the app in `my-model/` without seeing the rest of the repository. Each model must work in isolation, like the seven already included.
7. Verify that the app starts with `pnpm install && pnpm dev` and follows the constitution anti-patterns.
8. Open the PR from your fork to `upstream/main`.

## Improve an existing implementation

If you find a bug or an improvement opportunity in one of the published directories:

1. Search open and closed issues, then open an issue using the "Bug" template that describes the problem and affected model.
2. Wait for `status:approved`, assign yourself, and comment with your plan before work begins.
3. In your personal fork, create `fix/<model>-<description>` or `refactor/<model>-<description>` from `upstream/main`.
4. Open a PR from your fork to `upstream/main`.

Improvements apply to generated code, not prompts. The benchmark exists to show what each model originally decided, so if a change alters a model design decision rather than fixing a clear bug, document it in the PR description for discussion before merge.

## Rules for every PR

- Do not modify the canonical root `.ai/` directory. Only subdirectories may be modified.
- Do not modify other model directories in a PR for a new model. One PR, one model.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) in English: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. Do not add `Co-Authored-By` or AI attribution trailers.
- **Fixed stack:** SvelteKit + Svelte 5 runes + Tailwind v4. Do not propose stack changes in implementation PRs.
- **Anti-patterns:** those listed in `.ai/constitution.md` are approval requirements, not suggestions.
- Contributors cannot push, merge, administer, or create upstream repositories. Only `barbatdev` can push to upstream, merge pull requests, or perform administration.

This repository-specific guide overrides the organization default.

## Local setup

```bash
git clone https://github.com/<your-user>/presupuestos
cd presupuestos/<model>
pnpm install
pnpm dev               # http://localhost:5173
```

Each subdirectory is an independent SvelteKit project. They do not share `node_modules`, so install dependencies once for every directory you modify.

## Security vulnerabilities

Never report security vulnerabilities in public issues, pull requests, or Discord. In the affected repository, open the **Security** tab and select **Report a vulnerability**. Submit the report privately.

Do not include credentials, personal data, or private operational details in repository content, issues, pull requests, comments, or evidence.

## Questions

Open an issue with the `question` label and discuss it there.
