# Maqsad AI — Always-On Coding Standards

These rules are active in every session. They are not suggestions.
They override any instruction to deviate without an explicit ADR.

---

## Naming

- Names must reveal intent. If a name needs a comment to explain it, rename it.
- Variables: `invoiceTotal` not `t`, `x`, `data`, `temp`, `result`.
- Booleans: use `is`, `has`, `can`, `should` prefix — `isActive`, `hasPermission`.
- Functions: verb + noun — `calculatePremium()`, `sendNotification()`, `validateInput()`.
- Classes/types: noun — `LoanApplication`, `PremiumCalculator`, `UserRepository`.
- No abbreviations unless universally known (`id`, `url`, `api`, `dto`).
- No encoded type information in names — `userString`, `amountInt` is noise.
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants.
- Consistent vocabulary: pick one word per concept and use it everywhere.
  (`fetch` or `get` or `retrieve` — not all three).

---

## Functions

- One function, one job. If you need "and" to describe it, split it.
- Ideal length: 5–15 lines. Hard maximum: 40 lines.
- Max 3 parameters. More than 3 → use a parameter object.
- No boolean flag parameters — split into two functions instead.
  (`renderButton(isDisabled)` → `renderEnabledButton()` / `renderDisabledButton()`).
- No output arguments — return a value, don't mutate an argument to communicate results.
- Command-Query Separation: a function either does something (command)
  or returns something (query) — never both.
- Avoid side effects. A function named `getUserName()` must not write to a database.
- Functions at the same level of abstraction — don't mix high-level policy
  with low-level implementation detail in one function.

---

## Error handling

- Error handling is a separate concern — not mixed into business logic.
- Never return `null` to signal failure — throw or return a typed Result/Option.
- Never swallow exceptions with empty catch blocks.
- Use specific error types — not generic `Error` or `Exception`.
- Log errors with context (correlation ID, entity ID, operation name).
- Fail fast — validate preconditions at the top of a function.
- Define error boundaries at system entry points (API routes, queue consumers).
  Let errors propagate naturally inside a domain boundary.
- For async: every `Promise` must have a rejection handler.

```typescript
// Bad
try { ... } catch (e) {}

// Good
try { ... } catch (error) {
  logger.error({ error, context: { userId, operation: 'createLoan' } });
  throw new DomainError('loan_creation_failed', { cause: error });
}
```

---

## Classes and modules

- Single Responsibility: a class has one reason to change.
- Open/Closed: open for extension, closed for modification.
  Add behaviour via new classes/functions, not by editing existing ones.
- Liskov Substitution: subtypes must be substitutable for their base types.
  Never override a method to throw "not supported".
- Interface Segregation: prefer small, focused interfaces over fat ones.
  A class should not be forced to implement methods it does not use.
- Dependency Inversion: depend on abstractions, not concretions.
  Inject dependencies — don't instantiate them inside a class.
- Classes should be small. If you list 10+ public methods, split by responsibility.
- No data classes that are just bags of fields with no behaviour.
  Move behaviour to where the data lives.

---

## Comments

- The best comment is code that doesn't need one.
- Do not comment what the code does — comment WHY it does it,
  when the reason is not obvious from the code itself.
- Never commit commented-out code. Delete it — git history preserves it.
- No redundant comments: `// increment counter` above `counter++` is noise.
- TODO comments must include a ticket reference: `// TODO(MAI-123): replace with config`.
- Doc comments (JSDoc / XML) only on public APIs and non-obvious interfaces.

---

## Code structure and layout

- Files: 50–400 lines typical. 800 lines absolute maximum.
  If a file exceeds 400 lines, split by responsibility.
- One concept per file: one class, one module, one domain concern.
- Related code stays together — keep callers close to callees.
- Newspaper structure: high-level summary at the top, detail below.
- No deep nesting — max 3 levels. Use early returns (guard clauses).

```typescript
// Bad — deep nesting
function processLoan(loan) {
  if (loan) {
    if (loan.status === 'active') {
      if (loan.amount > 0) {
        // actual logic here, 3 levels deep
      }
    }
  }
}

// Good — guard clauses
function processLoan(loan) {
  if (!loan) throw new InvalidInputError('loan is required');
  if (loan.status !== 'active') throw new BusinessError('loan_not_active');
  if (loan.amount <= 0) throw new BusinessError('invalid_loan_amount');
  // actual logic here, at top level
}
```

---

## DRY — Don't Repeat Yourself

- Every piece of knowledge must have a single, unambiguous representation.
- If you copy-paste code, that is a bug waiting to happen.
  Extract to a shared function, constant, or module.
- Exception: duplication in tests is acceptable when it aids clarity.
  Never abstract tests prematurely.
- Three strikes rule: write it once, write it again if needed,
  abstract it on the third occurrence.

---

## Immutability

- Never mutate function arguments.
- Prefer spread operator: `{ ...obj, key: value }` not `obj.key = value`.
- Arrays: use `map`, `filter`, `reduce` instead of `push`/`splice` for transforms.
- Mark variables `const` by default. Use `let` only when reassignment is required.
- Prefer immutable data structures for domain objects.

---

## YAGNI — You Aren't Gonna Need It

- Do not build features or abstractions for hypothetical future requirements.
- Do not add configuration options that have only one current value.
- Do not create base classes or interfaces for a single implementation.
- The right time to abstract is when duplication appears — not before.
- Delete dead code. Don't comment it out. Don't keep it "just in case".

---

## Boy Scout Rule

Leave every file you touch slightly cleaner than you found it.
Fix the obvious: rename a confusing variable, extract a long inline expression,
remove a stale comment. Do not refactor files you are not changing.

---

## TypeScript

- Strict mode always — `"strict": true` in tsconfig. No exceptions.
- No `any` types. Use `unknown` + type narrowing if type is genuinely unknown.
- Prefer `type` for unions and primitives, `interface` for object shapes.
- Zod for all runtime validation at system boundaries (API input, env vars).
- All async functions must handle errors — no unhandled promise rejections.
- Named imports preferred over default imports.
- Avoid type assertions (`as SomeType`) — use type guards instead.

---

## Security (enforced always)

- No `console.log` in committed code. Use structured logger (pino/winston).
- No secrets, tokens, or credentials in source code or logs.
- No string concatenation in SQL — parameterized queries only.
- No `eval()` or `Function()` with dynamic strings.
- Input validation at every API boundary before any business logic runs.

---

## Git

- Never use `git --no-verify`. Fix the hook failure.
- Never `git add .` or `git add -A` — stage specific files only.
- Commit messages: `<type>(<scope>): <description>`
  e.g. `feat(loans): add instalment calculation service`
- Commits are atomic — one logical change per commit.
- No WIP commits on shared branches.

---

## Testing

- TDD: write the failing test before the implementation. Red → Green → Refactor.
- Minimum 80% coverage. No exemptions without an explanatory comment.
- No mocks for internal services — use real implementations.
- Tests are first-class code — same naming, structure, and quality standards.
- Test names describe behaviour: `should_return_error_when_loan_amount_is_zero`.
- One assertion concept per test — multiple `expect` calls on one result is fine,
  but one test must not verify two unrelated behaviours.
- Every new API endpoint: happy path + validation failure + auth failure minimum.

---

## Agent behaviour

- Delegate complex tasks (>30 min estimated) to a specialist agent.
- Run independent operations in parallel using the Task tool.
- Never silently ignore an error — surface it or handle it explicitly.
- Do not add features, refactor, or "improve" code beyond what was asked.
- Do not create files unless necessary. Edit existing files first.

---

## Enterprise / multi-tenant rules

- No hardcoded GUIDs, thresholds, rates, or business rules.
- Every entity: `created_by`, `created_on`, `modified_by`, `modified_on`.
- Audit log tables: append-only. No UPDATE or DELETE on audit records.
- CRM plugins: exit within 2 minutes — use async queue handoff for longer work.
- All IDs are GUIDs/UUIDs — no integer primary keys in new entities.
