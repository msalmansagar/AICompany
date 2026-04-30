# Dependencies — CRM Visual Workflow Designer

## Adopted Libraries

| Library | Version | Stars | Licence | Decision |
|---|---|---|---|---|
| `@xyflow/react` | 12.10.2 | 24,000+ | MIT | ADOPT |

### @xyflow/react

- **Repo:** https://github.com/xyflow/xyflow
- **npm:** `@xyflow/react`
- **Licence:** MIT — unrestricted commercial use, no mandatory attribution, no subscription
- **Adopted by:** github-researcher agent, 2026-04-30
- **Rationale:** Dominant open-source node-graph editor for React. Only library meeting all criteria: 1000+ stars threshold (24k+), active maintenance, MIT licence, TypeScript-first, embeddable as a React component, zero non-React runtime dependencies (critical for single-file HTML web resource deployment).
- **Attribution:** Use `proOptions={{ hideAttribution: true }}` — MIT-permitted, no Pro subscription required
- **Vite note:** Import `@xyflow/react/dist/style.css` in `main.tsx`; Vite inlines it via `assetsInlineLimit`
