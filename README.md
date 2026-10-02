# Presupuestos: eight-model LLM benchmark

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
| Nan | Nan | [`nan/`](./nan/) |

Each model works from its own copy of `.ai/` and implements only inside its own directory. In the current tracked tree, every model directory contains its `.ai/` copy and `README.md`; no SvelteKit implementation files or project manifests are tracked yet.

## Fixed technical requirements

- **Framework:** SvelteKit with Svelte 5 runes, including `$state`, `$derived`, and `$effect`.
- **Styling:** Tailwind v4 configured in `app.css` with `@theme`. Do not add `tailwind.config.js`.
- **PDF:** Load jsPDF inside the export handler. A dynamic import is the safest; a top-level import requires SSR to be disabled.
- **Rounding:** Implement half-up rounding manually for critical values. Do not use `toFixed` or `Math.round` for critical rounding.
- **Currency:** Format with a period as the thousands separator and a comma as the decimal separator, always two decimals: `$ 4.143.420,00` (below 1,000 the pattern is `$ 39,42`). Any presentation API (custom formatter or `Intl`) is allowed only if the byte-exact contract is preserved.
- **Number input:** Accept a period or a comma as the decimal separator. Thousands separators (`1.234` with three decimals) are invalid.
- **Dates:** Use `es-UY` only for date display. It does not control currency or number output.
- **VAT:** Apply IVA 22% to the total subtotal, using manual half-up rounding to two decimals.
- **Session identity:** The random `PRES-XXXXXX` id must be generated on the client (or otherwise stable): the user must never see an id that is later replaced. Verify against the evaluator's real URL, including insecure HTTP.
- **Delivery gate:** The QA matrix (T-01..T-06 in `constitution.md`) must be green before delivery; one red blocks the delivery.

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
---

<a href="https://github.com/Gentleman-Programming/gentle-ai">
  <img width="220" src="https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png" alt="Built with Gentle-AI" />
</a>
