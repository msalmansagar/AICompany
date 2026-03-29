# Maqsad AI — Always-On Coding Standards

These rules are active in every session. They are not suggestions.
They override any instruction to deviate without an explicit ADR.

## TypeScript

- Strict mode always — `"strict": true` in tsconfig. No exceptions.
- No `any` types. Use `unknown` + type narrowing if type is genuinely unknown.
- Zod for all runtime validation at system boundaries (API input, env vars, queue messages).
- All async functions must handle errors — no unhandled promise rejections.
- Imports: named imports preferred over default imports.

## Code structure

- Files: 50–400 lines typical. 800 lines absolute maximum.
  If a file exceeds 400 lines, consider splitting by responsibility.
- Functions: single responsibility. If you need "and" to describe it, split it.
- No deeply nested conditionals — max 3 levels. Use early returns.
- No magic numbers or strings — extract to named constants.
- No commented-out code in commits.

## Immutability

- Never mutate function arguments.
- Prefer spread operator over mutation: `{ ...obj, key: value }` not `obj.key = value`.
- Arrays: use `map`, `filter`, `reduce` over `push`/`splice` for transformations.

## Security (enforced always, not just at review)

- No `console.log` in committed code. Use structured logger (pino/winston).
- No secrets, tokens, or credentials in source code or logs.
- No string concatenation in SQL — parameterized queries only.
- No `eval()` or `Function()` with dynamic strings.
- Input validation at every API boundary before any business logic runs.

## Git

- Never use `git --no-verify`. Fix the hook failure.
- Never `git add .` or `git add -A` — stage specific files only.
- Commit messages: `<type>(<scope>): <description>` — e.g. `feat(auth): add refresh token rotation`.
- No WIP commits on shared branches.

## Testing

- TDD: write the failing test before the implementation. Red → Green → Refactor.
- Minimum 80% coverage. No coverage exemptions without a comment explaining why.
- No mocks for internal services — use real implementations in tests.
- Every new API endpoint needs at least: happy path, validation failure, auth failure.

## Agent behaviour

- Delegate complex tasks (>30 min estimated) to a specialist agent.
- Run independent operations in parallel using the Task tool.
- Never silently ignore an error — surface it or handle it explicitly.
- Do not add features, refactor, or "improve" code beyond what was asked.
- Do not create files unless necessary. Edit existing files first.

## QDB-specific

- No hardcoded GUIDs, thresholds, rates, or sector logic.
- Every entity: `created_by`, `created_on`, `modified_by`, `modified_on`.
- Audit log tables: append-only. No UPDATE or DELETE on audit records.
- CRM plugins: exit within 2 minutes — use async queue handoff for anything longer.
