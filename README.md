# Presupuestos: seven-model LLM benchmark

One budget calculator, one specification, and one set of constraints. Seven models implement the same application independently in separate directories, without seeing one another's work.

This is not a ranking. The benchmark compares qualitative implementation decisions made from the same canonical input.

## Canonical benchmark input

The three canonical inputs are in [`.ai/`](./.ai/) and are identical for all seven models:

| File | Defines |
| --- | --- |
| [`.ai/constitution.md`](./.ai/constitution.md) | The fixed stack, implementation principles, and prohibited anti-patterns |
| [`.ai/specs/app-presupuestos.yaml`](./.ai/specs/app-presupuestos.yaml) | Goals, constraints, and exact `Given/When/Then` scenarios |
| [`.ai/plans/app-presupuestos.yaml`](./.ai/plans/app-presupuestos.yaml) | Ordered tasks, dependencies, and deterministic test data |

[`.ai/KICKSTART.md`](./.ai/KICKSTART.md) is the entry point. It defines the required reading order and the exact VAT scenario values.

The canonical `.ai` content remains in Spanish by benchmark design. It is the shared source input, not documentation that implementations should translate.

## Models

| Model | Vendor | Directory |
| --- | --- | --- |
| Claude | Anthropic | [`claude/`](./claude/) |
| Codex / GPT | OpenAI | [`codex/`](./codex/) |
| DeepSeek | DeepSeek | [`deepseek/`](./deepseek/) |
| GLM | Zhipu | [`glm/`](./glm/) |
| Kimi | Moonshot | [`kimi/`](./kimi/) |
| MiMo | Xiaomi | [`mimo/`](./mimo/) |
| MiniMax | MiniMax | [`minimax/`](./minimax/) |

Each model works from its own copy of `.ai/` and implements only inside its own directory. In the current tracked tree, every model directory contains its `.ai/` copy and `README.md`; no SvelteKit implementation files or project manifests are tracked yet.

## Fixed technical requirements

- **Framework:** SvelteKit with Svelte 5 runes, including `$state`, `$derived`, and `$effect`.
- **Styling:** Tailwind v4 configured in `app.css` with `@theme`. Do not add `tailwind.config.js`.
- **PDF:** Load jsPDF dynamically inside the export handler. A top-level import can break prerendering.
- **Rounding:** Implement half-up rounding manually for critical values. Do not use `toFixed` or `Math.round` for critical rounding.
- **Currency:** Use a custom formatter. `Intl.NumberFormat` is forbidden. The exact format is `$ ` followed by an integer, a period, and exactly two decimals: `$ 1234.50`.
- **Number input:** Use a period as the decimal separator. Comma-decimal input is invalid.
- **Dates:** Use `es-UY` only for date display. It does not control currency or number output.
- **VAT:** Apply IVA 22% to the total subtotal, using manual half-up rounding to two decimals.

The prohibited anti-patterns in [`.ai/constitution.md`](./.ai/constitution.md) are benchmark requirements, not suggestions.

## Run an implementation

When a model directory contains an implementation, run it from that directory:

```bash
cd claude
pnpm install
pnpm dev               # http://localhost:5173
```

Each implementation is independent. Model directories do not share `node_modules` or configuration. To compare two implementations locally, use separate ports:

```bash
pnpm dev --port 5174
```

## What the benchmark examines

The benchmark does not determine which model is best. It examines whether implementations:

- Follow the required anti-pattern restrictions.
- Interpret the `Given/When/Then` scenarios correctly.
- Use Svelte 5 runes instead of legacy stores.
- Implement manual half-up rounding and the canonical currency format.
- Dynamically import jsPDF rather than importing it at the top level.
- Make different file naming and component-organization decisions.

## Contribute

To add a model or improve an existing implementation, follow [the contribution guide](./CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](./LICENSE).
