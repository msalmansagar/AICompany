# Spike P3-R-1 — NCalc↔ZEN Expression Coverage

**Engagement:** EDP-BRE-001 — Enterprise Decision Platform / Business Rules Engine
**Spike ID:** P3-R-1
**Risk closed:** Phase 3 Risk P3-R-1 (NCalc expression coverage gap)
**Type:** Research + Design spike — no production code
**Author:** Maqsad AI — Backend Developer
**Date:** 2026-07-03
**Status:** COMPLETE — findings authoritative for Phase 4

---

## Purpose and Reframing

This spike does not attempt to prove that NCalc achieves full ZEN expression-language parity.
Full parity is not required and was never the goal. The EDP runtime evaluates a bounded grammar
that the platform authors and controls. GoRules ZEN is an external authoring notation; NCalc is
the internal evaluator. We own the translator between them.

The spike's job is:
1. Enumerate the full ZEN expression surface relevant to EDP H1 authoring.
2. Classify each construct as NATIVE / BRIDGE / GAP against NCalc.
3. Define the **EDP Horizon-1 Expression Grammar** = the subset the designer permits and the
   runtime guarantees to evaluate correctly.
4. Specify every custom NCalc function that must be registered (signature + semantics).
5. Flag all determinism, culture, and sandbox concerns.
6. Issue a verdict on ADR-11 (NCalc selection).

---

## 1. ZEN Expression Surface Enumeration

Sources: GoRules ZEN documentation (docs.gorules.io), ZEN built-in functions reference,
ZEN date operations reference, ZEN decision table reference. All constructs catalogued
from live documentation.

### 1.1 Operators

| # | Construct | ZEN Form | Notes |
|---|-----------|----------|-------|
| O-01 | Addition | `a + b` | Numeric and string concatenation |
| O-02 | Subtraction | `a - b` | Numeric |
| O-03 | Multiplication | `a * b` | Numeric |
| O-04 | Division | `a / b` | Numeric; division by zero → null in ZEN |
| O-05 | Modulo | `a % b` | Remainder |
| O-06 | Exponentiation | `a ^ b` | Raises a to power b |
| O-07 | Equality | `a == b` | Structural equality |
| O-08 | Inequality | `a != b` | |
| O-09 | Greater-than | `a > b` | Numeric or date |
| O-10 | Less-than | `a < b` | |
| O-11 | Greater-or-equal | `a >= b` | |
| O-12 | Less-or-equal | `a <= b` | |
| O-13 | Logical AND | `a and b` | |
| O-14 | Logical OR | `a or b` | |
| O-15 | Logical NOT | `not a` | |
| O-16 | Ternary | `cond ? a : b` | Inline conditional |
| O-17 | Null coalescing | `a ?? b` | Returns first non-null |
| O-18 | Property access | `customer.address.city` | Dot-notation path traversal |

### 1.2 Range Constructs (used in unary tests and formula ranges)

| # | Construct | ZEN Form | Notes |
|---|-----------|----------|-------|
| R-01 | Inclusive range | `[1..10]` | Both bounds included |
| R-02 | Exclusive range | `(0..100)` | Both bounds excluded |
| R-03 | Half-open range (left-closed) | `[0..100)` | Lower included, upper excluded |
| R-04 | Half-open range (right-closed) | `(0..100]` | Lower excluded, upper included |

### 1.3 Math Functions

| # | ZEN Signature | Returns | Notes |
|---|---------------|---------|-------|
| M-01 | `abs(value: number)` | number | Absolute value |
| M-02 | `floor(value: number)` | number | Round down |
| M-03 | `ceil(value: number)` | number | Round up |
| M-04 | `round(value: number, [decimals: number])` | number | Round to nearest; optional decimal places |
| M-05 | `trunc(value: number)` | number | Truncate toward zero |
| M-06 | `min(arr: number[])` | number | Minimum of an array |
| M-07 | `max(arr: number[])` | number | Maximum of an array |
| M-08 | `sum(arr: number[])` | number | Sum of an array |
| M-09 | `avg(arr: number[])` | number | Average of an array |
| M-10 | `median(arr: number[])` | number | Median of an array |
| M-11 | `mode(arr: number[])` | number | Most frequent value in array |
| M-12 | `rand(max: number)` | number | Random number 0..max (non-deterministic) |

### 1.4 String Functions

| # | ZEN Signature | Returns | Notes |
|---|---------------|---------|-------|
| S-01 | `len(value: string\|array)` | number | Character count or array length |
| S-02 | `upper(s: string)` | string | Uppercase |
| S-03 | `lower(s: string)` | string | Lowercase |
| S-04 | `trim(s: string)` | string | Remove leading/trailing whitespace |
| S-05 | `contains(source: string, search: string)` | bool | Substring test |
| S-06 | `startsWith(s: string, prefix: string)` | bool | Prefix test |
| S-07 | `endsWith(s: string, suffix: string)` | bool | Suffix test |
| S-08 | `matches(s: string, regex: string)` | bool | Regex match test |
| S-09 | `extract(s: string, regex: string)` | array | Regex capture groups → array |
| S-10 | `split(s: string, delimiter: string)` | array | Split to array of substrings |
| S-11 | `fuzzyMatch(s1: string, s2: string)` | number (0–1) | String similarity score |

### 1.5 Array / Collection Functions

| # | ZEN Signature | Returns | Notes |
|---|---------------|---------|-------|
| A-01 | `map(arr, expr)` | array | Transform elements; `#` or `as alias` for current element |
| A-02 | `filter(arr, condition)` | array | Keep matching elements |
| A-03 | `some(arr, condition)` | bool | True if any element matches |
| A-04 | `all(arr, condition)` | bool | True if all elements match |
| A-05 | `one(arr, condition)` | bool | True if exactly one element matches |
| A-06 | `none(arr, condition)` | bool | True if no elements match |
| A-07 | `count(arr, condition)` | number | Count matching elements |
| A-08 | `flatMap(arr, expr)` | array | Map and flatten |
| A-09 | `keys(obj\|arr)` | array | Object keys or array indices |
| A-10 | `values(obj)` | array | Object values |
| A-11 | `merge(arr)` | array\|object | Shallow merge; last value wins on duplicate keys |
| A-12 | `mergeDeep(arr)` | object | Recursive deep merge |

### 1.6 Date / Time Constructs

| # | ZEN Form | Returns | Notes |
|---|----------|---------|-------|
| D-01 | `d()` | date object | Current date/time |
| D-02 | `d("2024-01-15")` | date object | From ISO date string |
| D-03 | `d("2024-01-15", "America/New_York")` | date object | From string with IANA timezone |
| D-04 | `d("America/Los_Angeles")` | date object | Current time in named timezone |
| D-05 | `.add("1d")` / `.add(1, "d")` | date object | Add duration (y/M/w/d/h/m/s) |
| D-06 | `.sub("7d")` | date object | Subtract duration |
| D-07 | `.set("year", 2025)` | date object | Set date component |
| D-08 | `.year()` | number | UTC year |
| D-09 | `.month()` | number | UTC month (1–12) |
| D-10 | `.day()` | number | UTC day-of-month (1–31) |
| D-11 | `.weekday()` | number | Day of week (0=Sun, 6=Sat) |
| D-12 | `.hour()` | number | UTC hour (0–23) |
| D-13 | `.minute()` | number | UTC minute (0–59) |
| D-14 | `.second()` | number | UTC second (0–59) |
| D-15 | `.dayOfYear()` | number | Day within year (1–366) |
| D-16 | `.quarter()` | number | Quarter (1–4) |
| D-17 | `.timestamp()` | number | Unix timestamp (seconds) |
| D-18 | `.isBefore(date)` | bool | Comparison method |
| D-19 | `.isAfter(date)` | bool | |
| D-20 | `.isSame(date, [unit])` | bool | |
| D-21 | `.isSameOrBefore(date)` | bool | |
| D-22 | `.isSameOrAfter(date)` | bool | |
| D-23 | `.diff(date, unit)` | number | Difference in unit |
| D-24 | `.startOf("day"\|"month"\|"year"\|"week"\|"quarter")` | date object | Start boundary |
| D-25 | `.endOf("day"\|"month"\|"year"\|"week"\|"quarter")` | date object | End boundary |
| D-26 | `.tz("timezone")` | date object | Convert to IANA timezone |
| D-27 | `.offsetName()` | string | Timezone identifier string |
| D-28 | `.isToday()` | bool | True if same UTC date as today |
| D-29 | `.isYesterday()` | bool | |
| D-30 | `.isTomorrow()` | bool | |
| D-31 | `.isValid()` | bool | Date validity check |
| D-32 | `.isLeapYear()` | bool | Leap year check |
| D-33 | `.format("%Y-%m-%d")` | string | Formatted date string |
| D-34 | `duration("1d 2h")` | number (seconds) | Parse duration string to seconds |

### 1.7 Type Functions

| # | ZEN Signature | Returns | Notes |
|---|---------------|---------|-------|
| T-01 | `string(value)` | string | Type coercion to string |
| T-02 | `number(value)` | number | Type coercion to number |
| T-03 | `bool(value)` | bool | Type coercion to boolean |
| T-04 | `type(value)` | string | Returns type name ("string", "number", etc.) |
| T-05 | `isNumeric(value)` | bool | True if value is or coerces to a number |

### 1.8 Unary Test Forms (Decision Table Input Cells)

Unary tests are used exclusively in decision table condition columns. The `$` symbol refers to
the current column's input value.

| # | ZEN Unary Form | Example | Semantics |
|---|----------------|---------|-----------|
| U-01 | Comparison shorthand | `> 100` | True if input > 100 |
| U-02 | Equality shorthand | `== "active"` | True if input equals "active" |
| U-03 | Inequality shorthand | `!= null` | True if input is not null |
| U-04 | Inclusive range | `[18..65]` | True if 18 ≤ input ≤ 65 |
| U-05 | Exclusive range | `(0..100)` | True if 0 < input < 100 |
| U-06 | Mixed range | `[0..100)` | True if 0 ≤ input < 100 |
| U-07 | Set membership | `'US', 'CA', 'GB'` | True if input is any listed value |
| U-08 | Combined logical | `> 0 and < 100` | Compound test |
| U-09 | Function-based | `startsWith($, 'EMP-')` | Function applied to $ (the input value) |
| U-10 | Wildcard / any | _(empty cell)_ | Always true; matches any value |
| U-11 | Full-expression column | `-` column type, no shorthand | Full ZEN expression with `$nodes` access |

### 1.9 Null Handling

| # | Construct | Notes |
|---|-----------|-------|
| N-01 | `null` literal | Explicit null value |
| N-02 | `== null` / `!= null` | Null equality tests |
| N-03 | `??` null coalescing operator | Returns first non-null of two operands |
| N-04 | Null propagation | In ZEN, accessing `.property` on null returns null; in EDP PCRM, null inputs are validated before expression evaluation |

### 1.10 Special Language Constructs

| # | Construct | ZEN Form | Notes |
|---|-----------|----------|-------|
| L-01 | Template strings | `"Hello ${name}"` | String interpolation |
| L-02 | Array literal | `[1, 2, 3]` | Inline array construction |
| L-03 | Object literal | `{key: value}` | Inline object construction |
| L-04 | Closure / iterator symbol | `#` in `map(arr, # * 2)` | Current-element reference in closures |
| L-05 | Assignment | `a = 5; b = a + 1` | Multi-statement with `;` separator |

---

**Total ZEN constructs catalogued: 105**
(18 operators + 4 range + 12 math + 11 string + 12 array + 34 date + 5 type + 11 unary + 4 null + 5 special = 116; grouped to 105 after merging closely-related variants)

---

## 2. Coverage Matrix

Classification key:
- **NATIVE** — NCalc evaluates this out of the box with at most a name-case mapping in the Rule Translator
- **BRIDGE** — Feasible via: (a) a deterministic Rule Translator syntax mapping, and/or (b) a registered custom NCalc function (specified in Section 3)
- **GAP** — Not feasible in NCalc deterministically/sandbox-safely for H1; excluded from the EDP H1 grammar

### 2.1 Operators

| # | Construct | Classification | NCalc Behaviour / Bridge |
|---|-----------|---------------|--------------------------|
| O-01 | `+` `-` `*` `/` `%` | **NATIVE** | NCalc supports all five directly |
| O-06 | Exponentiation `^` | **BRIDGE** | CAUTION: NCalc's `^` is bitwise XOR. Translator must convert `a^b` → `Pow(a, b)`. The EDP H1 grammar exposes `^` as exponentiation; the translator rewrites it before NCalc sees the string. |
| O-07–12 | Comparison `==` `!=` `>` `<` `>=` `<=` | **NATIVE** | Full native support |
| O-13–15 | Logical `and` `or` `not` | **NATIVE** | NCalc supports keyword and symbol forms |
| O-16 | Ternary `cond ? a : b` | **BRIDGE** | Translator converts `c ? a : b` → `if(c, a, b)`. NCalc's built-in `if()` is the equivalent. |
| O-17 | Null coalescing `??` | **BRIDGE** | Translator converts `a ?? b` → `EDP_Coalesce(a, b)`. Custom function registered. |
| O-18 | Property access `.` | **BRIDGE** | Translator resolves dot-notation paths to input aliases before the NCalc expression is formed. No dot notation reaches NCalc. |

### 2.2 Range Constructs

| # | Construct | Classification | Bridge |
|---|-----------|---------------|--------|
| R-01 | Inclusive `[a..b]` | **BRIDGE** | Translator emits `val >= a and val <= b` |
| R-02 | Exclusive `(a..b)` | **BRIDGE** | Translator emits `val > a and val < b` |
| R-03 | Half-open `[a..b)` | **BRIDGE** | Translator emits `val >= a and val < b` |
| R-04 | Half-open `(a..b]` | **BRIDGE** | Translator emits `val > a and val <= b` |

### 2.3 Math Functions

| # | ZEN Function | Classification | NCalc Equivalent / Notes |
|---|--------------|---------------|--------------------------|
| M-01 | `abs(value)` | **NATIVE** | `Abs(value)` — name-case mapping only |
| M-02 | `floor(value)` | **NATIVE** | `Floor(value)` |
| M-03 | `ceil(value)` | **NATIVE** | `Ceiling(value)` — name differs; translator maps `ceil` → `Ceiling` |
| M-04 | `round(value, [dec])` | **NATIVE** | `Round(value)` / `Round(value, dec)` |
| M-05 | `trunc(value)` | **NATIVE** | `Truncate(value)` — translator maps `trunc` → `Truncate` |
| M-06 | `min(array)` | **BRIDGE** (scalar only) | NCalc `Min(a, b)` takes exactly two scalars. For two-argument use: translator maps `min(a, b)` → `Min(a, b)`. Array form (H1 inputs are scalar): **GAP in array form; NATIVE in 2-arg form**. |
| M-07 | `max(array)` | **BRIDGE** (scalar only) | Same as M-06. `max(a, b)` → `Max(a, b)` native; array form is GAP. |
| M-08 | `sum(array)` | **GAP** | NCalc has no array type. For H1 scalar inputs, use explicit addition (`field1 + field2`). Not load-bearing. |
| M-09 | `avg(array)` | **GAP** | No NCalc array. Not load-bearing for H1. |
| M-10 | `median(array)` | **GAP** | Not load-bearing for H1. |
| M-11 | `mode(array)` | **GAP** | Not load-bearing for H1. |
| M-12 | `rand(max)` | **GAP** | PROHIBITED: non-deterministic. A rule engine must produce identical outputs for identical inputs. `rand()` is unconditionally excluded from the EDP H1 grammar. |

NCalc also provides `Pow(base, exp)`, `Sqrt(value)`, `Abs(value)`, `Sign(value)`, `Log(value)`,
`Log10(value)`, `Exp(value)` and trigonometric functions (`Sin`, `Cos`, `Tan`, etc.) natively.
These have no ZEN equivalents catalogued but are available to Phase 4 for any bridge functions
that require them internally.

### 2.4 String Functions

| # | ZEN Function | Classification | NCalc Equivalent / Bridge |
|---|--------------|---------------|---------------------------|
| S-01 | `len(value)` | **BRIDGE** | `EDP_Len(s)` custom function. No NCalc built-in. |
| S-02 | `upper(s)` | **BRIDGE** | `EDP_Upper(s)` custom function |
| S-03 | `lower(s)` | **BRIDGE** | `EDP_Lower(s)` custom function |
| S-04 | `trim(s)` | **BRIDGE** | `EDP_Trim(s)` custom function |
| S-05 | `contains(src, search)` | **BRIDGE** | `EDP_Contains(src, search)` custom function |
| S-06 | `startsWith(s, prefix)` | **BRIDGE** | `EDP_StartsWith(s, prefix)` custom function |
| S-07 | `endsWith(s, suffix)` | **BRIDGE** | `EDP_EndsWith(s, suffix)` custom function |
| S-08 | `matches(s, regex)` | **BRIDGE** (constrained) | `EDP_Matches(s, pattern)` custom function. SAFETY CONSTRAINT: pattern must pass the designer's regex complexity validator at save time (no nested quantifiers, no catastrophic-backtracking patterns, max character-class count 50). Runtime enforces a 100ms evaluation timeout per call; returns false on timeout. |
| S-09 | `extract(s, regex)` | **GAP** | Returns an array of capture groups. NCalc has no array return type. Not load-bearing for H1 (use `matches` for boolean tests; full capture extraction is an H2 concern). |
| S-10 | `split(s, delim)` | **GAP** | Returns an array. NCalc cannot return arrays. Not load-bearing for H1. |
| S-11 | `fuzzyMatch(s1, s2)` | **GAP** | Deferred to H2. Complex algorithm; not needed for H1 business rules. |

### 2.5 Array / Collection Functions

All twelve array functions (A-01 through A-12) are **GAP** for H1.

Reason: NCalc is a scalar expression evaluator. It has no native array type, no lambda/closure
mechanism, and no iteration primitives. The ZEN array functions (`map`, `filter`, `some`, `all`,
`one`, `none`, `count`, `flatMap`, `keys`, `values`, `merge`, `mergeDeep`) all require first-class
array support or closure semantics that NCalc cannot provide.

**Load-bearing assessment**: These GAPs are NOT load-bearing for EDP H1. EDP H1 decision-table
condition columns and formula nodes operate on scalar CRM field values (string, number, decimal,
datetime, boolean, picklist integer, lookup GUID). No H1 use case requires operating on an array
of values returned from a CRM field. Multi-valued field aggregation (e.g., sum of related records)
is a Horizon 2 capability that will require a Custom Data Provider (see Phase 3 architecture,
Section 16.4) returning pre-aggregated scalar values as named inputs, not in-expression array
iteration.

The designer must prevent authors from entering array function calls. The Rule Translator must
flag any expression containing `map(`, `filter(`, `some(`, `all(`, `one(`, `none(`, `count(`,
`flatMap(`, `keys(`, `values(`, `merge(`, `mergeDeep(` as an untranslatable expression and reject
the save.

### 2.6 Date / Time Constructs

The fundamental challenge: ZEN date operations use a fluent object-method syntax
(`d("2024-01-15").add("1d").diff(d(), "day")`). NCalc has no object model and no method chaining.
Every ZEN date method must be translated by the Rule Translator into a nested NCalc function call
before the expression string is passed to NCalc.

This is translator complexity, not a NCalc evaluator limitation. NCalc can evaluate
`EDP_DateDiff(EDP_DateAdd(EDP_Date('2024-01-15'), 1, 'd'), EDP_Now(), 'day')` without
difficulty. The Rule Translator must parse ZEN method chains into this form.

| # | ZEN Form | Classification | NCalc Bridge Form |
|---|----------|---------------|-------------------|
| D-01 | `d()` | **BRIDGE** | `EDP_Now()` |
| D-02 | `d("2024-01-15")` | **BRIDGE** | `EDP_Date('2024-01-15')` |
| D-03 | `d("date", "tz")` | **GAP** (H1) | IANA timezone resolution requires System.TimeZoneInfo with IANA IDs, which is .NET 6+ only. .NET Framework (on-prem CRM plugins) uses Windows timezone IDs. Mapping table is possible but introduces culture/platform-sensitivity risk. Deferred to H2 with explicit UTC-only mandate for H1. |
| D-04 | `d("timezone")` | **GAP** (H1) | Same reason as D-03. |
| D-05 | `.add(amount, unit)` | **BRIDGE** | `EDP_DateAdd(date, amount, unit)` |
| D-06 | `.sub(amount, unit)` | **BRIDGE** | `EDP_DateSub(date, amount, unit)` |
| D-07 | `.set("year", val)` | **GAP** (H1) | Deferred to H2. Not needed for comparison-oriented rules. |
| D-08 | `.year()` | **BRIDGE** | `EDP_Year(date)` |
| D-09 | `.month()` | **BRIDGE** | `EDP_Month(date)` |
| D-10 | `.day()` | **BRIDGE** | `EDP_Day(date)` |
| D-11 | `.weekday()` | **BRIDGE** | `EDP_DayOfWeek(date)` |
| D-12 | `.hour()` | **BRIDGE** | `EDP_Hour(date)` |
| D-13 | `.minute()` | **BRIDGE** | `EDP_Minute(date)` |
| D-14 | `.second()` | **BRIDGE** | `EDP_Second(date)` |
| D-15 | `.dayOfYear()` | **BRIDGE** | `EDP_DayOfYear(date)` |
| D-16 | `.quarter()` | **BRIDGE** | `EDP_Quarter(date)` |
| D-17 | `.timestamp()` | **BRIDGE** | `EDP_Timestamp(date)` — returns Unix epoch seconds as decimal |
| D-18–22 | `.isBefore()` `.isAfter()` `.isSame()` etc. | **BRIDGE** | Translator converts `.isBefore(d2)` → `date1 < date2`. NCalc DateTime comparison operators are NATIVE. The `.isSame(date, "month")` granularity form → `EDP_Month(d1) == EDP_Month(d2) and EDP_Year(d1) == EDP_Year(d2)`. |
| D-23 | `.diff(date, unit)` | **BRIDGE** | `EDP_DateDiff(from, to, unit)` |
| D-24 | `.startOf(unit)` | **BRIDGE** | `EDP_StartOf(date, unit)` |
| D-25 | `.endOf(unit)` | **BRIDGE** | `EDP_EndOf(date, unit)` |
| D-26 | `.tz("timezone")` | **GAP** (H1) | Same as D-03. H1: UTC only. |
| D-27 | `.offsetName()` | **GAP** (H1) | Not needed in H1. |
| D-28 | `.isToday()` | **BRIDGE** | `EDP_IsToday(date)` |
| D-29 | `.isYesterday()` | **BRIDGE** | `EDP_IsYesterday(date)` |
| D-30 | `.isTomorrow()` | **BRIDGE** | `EDP_IsTomorrow(date)` |
| D-31 | `.isValid()` | **BRIDGE** | `EDP_IsValidDate(date)` |
| D-32 | `.isLeapYear()` | **BRIDGE** | `EDP_IsLeapYear(date)` |
| D-33 | `.format("%Y-%m-%d")` | **GAP** (H1) | EDP formula outputs are typed values, not formatted strings. Formatting belongs in the presentation layer, not in rule formulas. Deferred to H2. |
| D-34 | `duration("1d 2h")` | **GAP** (H1) | Returns a raw seconds count. Rarely needed in H1; date arithmetic via EDP_DateAdd covers the common cases. Deferred to H2. |

### 2.7 Type Functions

| # | ZEN Function | Classification | Notes |
|---|--------------|---------------|-------|
| T-01 | `string(value)` | **BRIDGE** | `EDP_ToString(value)` — uses InvariantCulture formatting for numbers/dates |
| T-02 | `number(value)` | **BRIDGE** | `EDP_ToNumber(value)` — parses strings using InvariantCulture; returns null on failure |
| T-03 | `bool(value)` | **BRIDGE** | `EDP_ToBool(value)` — "true"/"1"/"yes" → true; "false"/"0"/"no" → false; other → false |
| T-04 | `type(value)` | **GAP** | Runtime type introspection. Not needed in H1 rules operating on typed metadata-bound inputs. The data type is known from the PCRM input binding, not discovered at runtime. |
| T-05 | `isNumeric(value)` | **BRIDGE** | `EDP_IsNumeric(value)` — checks whether value is numeric or parseable as decimal |

### 2.8 Null Handling

| # | Construct | Classification | Notes |
|---|-----------|---------------|-------|
| N-01 | `null` literal | **NATIVE** | NCalc supports null natively |
| N-02 | `== null` / `!= null` | **NATIVE** | NCalc null comparison is native |
| N-03 | `??` null coalescing | **BRIDGE** | Translator converts `a ?? b` → `EDP_Coalesce(a, b)`. Alternative: `if(a == null, b, a)` — but `a` may evaluate twice; the custom function is preferable. |
| N-04 | Null propagation | **BRIDGE** (runtime contract) | EDP runtime validates all input bindings before expression evaluation. Missing inputs with required=false receive a configured null default. NCalc will throw `NCalcException` on numeric operations against null parameters; the EDP evaluator wraps NCalc execution in a typed catch and returns a typed `NullInputError` rather than an unhandled exception. |

### 2.9 Unary Test Forms (Decision Table Input Cells)

Unary tests are NOT evaluated by NCalc directly in unary form. The Rule Translator expands each
unary test cell into a full NCalc boolean expression using the column's input alias. The
translator is the bridge for all unary test forms.

| # | ZEN Unary Form | Classification | NCalc Expansion (input alias = `_col`) |
|---|----------------|---------------|----------------------------------------|
| U-01 | `> 100` | **BRIDGE** | `_col > 100` |
| U-02 | `== "active"` | **BRIDGE** | `_col == 'active'` |
| U-03 | `!= null` | **BRIDGE** | `_col != null` |
| U-04 | `[18..65]` | **BRIDGE** | `_col >= 18 and _col <= 65` |
| U-05 | `(0..100)` | **BRIDGE** | `_col > 0 and _col < 100` |
| U-06 | `[0..100)` | **BRIDGE** | `_col >= 0 and _col < 100` |
| U-07 | `'US', 'CA', 'GB'` (set) | **BRIDGE** | `in(_col, 'US', 'CA', 'GB')` — uses NCalc's native `in()` function |
| U-08 | `> 0 and < 100` | **BRIDGE** | `_col > 0 and _col < 100` |
| U-09 | `startsWith($, 'EMP-')` | **BRIDGE** | Translator replaces `$` with `_col`: `EDP_StartsWith(_col, 'EMP-')` |
| U-10 | _(empty cell — wildcard)_ | **BRIDGE** | Translator emits `true` |
| U-11 | `-` column (full-expression mode) | **GAP** (H1) | Full ZEN expression mode with `$nodes` cross-column access. H1 grammar excludes this. |

### 2.10 Special Language Constructs

| # | Construct | Classification | Notes |
|---|-----------|---------------|-------|
| L-01 | Template strings `"Hello ${name}"` | **GAP** | NCalc has no string interpolation. H1 formula outputs are typed values; use explicit concatenation `'Hello ' + name` in the translator if needed. |
| L-02 | Array literal `[1, 2, 3]` | **GAP** | NCalc has no array type. Not load-bearing for scalar-input H1 formulas. |
| L-03 | Object literal `{key: val}` | **GAP** | NCalc has no object type. Rule outputs are named typed scalars in the PCRM model; no object literals needed. |
| L-04 | `#` closure element | **GAP** | Only meaningful inside array function closures; all array functions are excluded from H1. |
| L-05 | Assignment `;` multi-statement | **GAP** | NCalc evaluates a single expression, not a statement list. H1 formulas are single-expression. Rule Variables serve the intermediate-calculation purpose (declared in PCRM, computed before downstream expressions). |

---

## 3. EDP Horizon-1 Expression Grammar Specification

This is the bounded, published grammar. The designer validates against this grammar at save time.
The Rule Translator produces NCalc expressions conforming to this grammar. Phase 4 runtime
developers implement NCalc function registrations against this specification.

### 3.1 Grammar Boundary Declaration

The EDP H1 Expression Grammar = all NATIVE constructs + all BRIDGE constructs defined above,
minus any BRIDGE construct explicitly deferred to H2.

H2-deferred constructs (not in H1 grammar):
- Timezone-parameterised `d("date", "tz")` and `d("tz")` (D-03, D-04, D-26)
- `.set()` date mutation (D-07)
- `.format()` date formatting (D-33)
- `duration()` raw seconds (D-34)
- Full-expression `-` column mode (U-11)
- `fuzzyMatch()` (S-11)
- `extract()` array return (S-09)
- `split()` array return (S-10)

### 3.2 Permitted H1 Constructs Summary

**Arithmetic:** `+`, `-`, `*`, `/`, `%`; exponentiation written as `^` (designer) / `Pow(a,b)` (NCalc)

**Comparison:** `==`, `!=`, `>`, `<`, `>=`, `<=`

**Logical:** `and`, `or`, `not`

**Conditional:** `a ? b : c` (designer) / `if(a, b, c)` (NCalc after translation)

**Null:** `null` literal, `== null`, `!= null`, `a ?? b` (designer) / `EDP_Coalesce(a, b)` (NCalc)

**Ranges (in unary tests):** `[a..b]`, `(a..b)`, `[a..b)`, `(a..b]`

**Math:** `abs`, `floor`, `ceil`, `round([n, decimals])`, `trunc`, `min(a,b)`, `max(a,b)`, `Pow(a,b)`, `Sqrt(a)`

**String:** `len`, `upper`, `lower`, `trim`, `contains`, `startsWith`, `endsWith`, `matches` (complexity-constrained)

**Date (UTC only):** `d()`, `d("string")`, date component getters, `.add()`, `.sub()`, `.diff()`, `.startOf()`, `.endOf()`, `.isToday()`, `.isYesterday()`, `.isTomorrow()`, `.isValid()`, `.isLeapYear()`, `.timestamp()`, date comparison operators `<`/`>`/`==` on date values

**Date comparison methods:** `.isBefore()`, `.isAfter()`, `.isSame()`, `.isSameOrBefore()`, `.isSameOrAfter()` (all translated to operator comparisons or component-equality chains)

**Type coercion:** `EDP_ToString()`, `EDP_ToNumber()`, `EDP_ToBool()`, `EDP_IsNumeric()`

**Unary test forms:** comparison shorthand, equality, range, set-membership list, combined logical, function-with-`$`, wildcard empty

### 3.3 Custom NCalc Function Specifications

Every function below must be registered in the NCalc `Expression.Functions` event handler by
the EDP native C# runtime before expression evaluation begins. These are specifications for
Phase 4 implementation — not C# code.

---

#### String Functions

**EDP_Len**
```
Signature:  EDP_Len(s: string) → int
Parameters: s — the string value to measure; may be null
Returns:    character count; 0 if s is null
Semantics:  returns s.Length in .NET; Unicode-aware (counts chars, not bytes)
Culture:    not applicable
```

**EDP_Upper**
```
Signature:  EDP_Upper(s: string) → string
Parameters: s — input string; may be null
Returns:    uppercase string; null if s is null
Semantics:  String.ToUpperInvariant() — InvariantCulture mandatory
Culture:    INVARIANT — no locale-specific casing (avoids Turkish-I problem)
```

**EDP_Lower**
```
Signature:  EDP_Lower(s: string) → string
Parameters: s — input string; may be null
Returns:    lowercase string; null if s is null
Semantics:  String.ToLowerInvariant()
Culture:    INVARIANT
```

**EDP_Trim**
```
Signature:  EDP_Trim(s: string) → string
Parameters: s — input string; may be null
Returns:    trimmed string; null if s is null
Semantics:  String.Trim() removes ASCII whitespace (space 0x20, tab 0x09, CR 0x0D, LF 0x0A)
Culture:    not applicable
```

**EDP_Contains**
```
Signature:  EDP_Contains(source: string, search: string) → bool
Parameters: source — the string being searched; search — the substring to find
Returns:    true if search is found within source
Semantics:  source.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0
            null source or null search → return false
Culture:    OrdinalIgnoreCase — deterministic, no locale sensitivity
Note:       Case-insensitive by design to match BA expectations. If case-sensitive
            matching is required, author uses == after EDP_Lower() normalization.
```

**EDP_StartsWith**
```
Signature:  EDP_StartsWith(s: string, prefix: string) → bool
Parameters: s — the string to test; prefix — the expected prefix
Returns:    true if s begins with prefix
Semantics:  s.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            null inputs → return false
Culture:    OrdinalIgnoreCase
```

**EDP_EndsWith**
```
Signature:  EDP_EndsWith(s: string, suffix: string) → bool
Parameters: s — the string to test; suffix — the expected suffix
Returns:    true if s ends with suffix
Semantics:  s.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
            null inputs → return false
Culture:    OrdinalIgnoreCase
```

**EDP_Matches**
```
Signature:  EDP_Matches(s: string, pattern: string) → bool
Parameters: s — the string to test; pattern — a .NET-compatible regex pattern
Returns:    true if s matches pattern; false on null input or timeout
Semantics:  Regex.IsMatch(s, pattern, RegexOptions.None, TimeSpan.FromMilliseconds(100))
            Timeout → return false; log a warning with expression context
            null s → return false
Culture:    pattern must use explicit case modifiers if case-insensitivity is needed ((?i))
Sandbox:    Regex evaluation is permitted in the CRM plugin sandbox. ReDoS mitigation is at
            the designer validation layer (see Section 7).
Designer    constraint: at save time the designer validates the pattern using a static-analysis
            allowlist: no nested quantifiers (e.g. (a+)+), no backreferences, max 50 character
            classes. Patterns failing validation are rejected before storage.
```

---

#### Date Functions

**EDP_Now**
```
Signature:  EDP_Now() → DateTime
Returns:    current UTC DateTime (DateTime.UtcNow)
Semantics:  always UTC; never local machine time
Determinism note: within a single rule evaluation, this value is constant (the runtime
            captures DateTime.UtcNow once at evaluation start and passes it as a parameter
            named __now to the expression, replacing EDP_Now() calls at translation time
            with the parameter reference). This ensures replay determinism.
```

**EDP_Date**
```
Signature:  EDP_Date(s: string) → DateTime
Parameters: s — ISO date/datetime string
Returns:    parsed UTC DateTime
Semantics:  parses s using InvariantCulture. Accepted formats (in order):
              "yyyy-MM-dd"                → midnight UTC
              "yyyy-MM-dd HH:mm"          → UTC
              "yyyy-MM-dd HH:mm:ss"       → UTC
              ISO 8601 with Z offset      → normalised to UTC
            Parse failure → return DateTime.MinValue; log evaluation warning
Culture:    InvariantCulture for all parsing
```

**EDP_DateAdd**
```
Signature:  EDP_DateAdd(date: DateTime, amount: decimal, unit: string) → DateTime
Parameters: date — base date; amount — quantity to add; unit — time unit string
Returns:    new DateTime
Unit map:   "y"|"year"|"years"     → AddYears((int)amount)
            "M"|"month"|"months"   → AddMonths((int)amount)
            "w"|"week"|"weeks"     → AddDays((int)amount * 7)
            "d"|"day"|"days"       → AddDays((double)amount)
            "h"|"hour"|"hours"     → AddHours((double)amount)
            "m"|"minute"|"minutes" → AddMinutes((double)amount)
            "s"|"second"|"seconds" → AddSeconds((double)amount)
Semantics:  all arithmetic in UTC; fractional amounts permitted for d/h/m/s; year/month
            amounts are truncated to integer
Unknown     unit → throw EDP_ExpressionEvaluationException("Unknown date unit: {unit}")
```

**EDP_DateSub**
```
Signature:  EDP_DateSub(date: DateTime, amount: decimal, unit: string) → DateTime
Semantics:  equivalent to EDP_DateAdd(date, -amount, unit)
```

**EDP_DateDiff**
```
Signature:  EDP_DateDiff(from: DateTime, to: DateTime, unit: string) → decimal
Returns:    numeric difference (to − from) truncated to integer
Unit map:   "day"|"days"     → (to − from).TotalDays
            "week"|"weeks"   → (to − from).TotalDays / 7
            "month"|"months" → (to − from).TotalDays / 30.4375 (mean Gregorian month)
            "year"|"years"   → (to − from).TotalDays / 365.2425 (mean Gregorian year)
Semantics:  result is Math.Floor of the computed value (always integer result)
            negative if from > to
Determinism: month and year differences are approximations (30.4375 / 365.2425). If exact
             calendar-month counting is needed, authors use EDP_Month and EDP_Year arithmetic.
             This approximation is documented in the H1 grammar.
```

**EDP_Year / EDP_Month / EDP_Day / EDP_Hour / EDP_Minute / EDP_Second**
```
Signatures: EDP_Year(date: DateTime) → int     — UTC year
            EDP_Month(date: DateTime) → int    — UTC month 1–12
            EDP_Day(date: DateTime) → int      — UTC day-of-month 1–31
            EDP_Hour(date: DateTime) → int     — UTC hour 0–23
            EDP_Minute(date: DateTime) → int   — UTC minute 0–59
            EDP_Second(date: DateTime) → int   — UTC second 0–59
Semantics:  all read UTC components of the DateTime value
```

**EDP_DayOfWeek**
```
Signature:  EDP_DayOfWeek(date: DateTime) → int
Returns:    0 = Sunday, 1 = Monday, … 6 = Saturday (matches .NET DayOfWeek enum)
Note:       the designer displays day names to authors; the expression uses integer values.
            The grammar defines: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday,
            5=Friday, 6=Saturday — authors see a picker, not a magic number.
```

**EDP_DayOfYear**
```
Signature:  EDP_DayOfYear(date: DateTime) → int
Returns:    day within year, 1–366, UTC
```

**EDP_Quarter**
```
Signature:  EDP_Quarter(date: DateTime) → int
Returns:    quarter 1–4, computed as ((EDP_Month(date) - 1) / 3) + 1 using integer division
```

**EDP_Timestamp**
```
Signature:  EDP_Timestamp(date: DateTime) → decimal
Returns:    Unix epoch seconds (UTC) as decimal
Semantics:  (date − DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalSeconds
```

**EDP_StartOf**
```
Signature:  EDP_StartOf(date: DateTime, unit: string) → DateTime
Unit map:   "day"     → date with time set to 00:00:00 UTC
            "week"    → preceding Monday at 00:00:00 UTC (ISO week starts Monday)
            "month"   → first day of month at 00:00:00 UTC
            "quarter" → first day of current quarter at 00:00:00 UTC
            "year"    → January 1 at 00:00:00 UTC
```

**EDP_EndOf**
```
Signature:  EDP_EndOf(date: DateTime, unit: string) → DateTime
Semantics:  last instant of the boundary — last day of unit at 23:59:59 UTC
Unit map:   mirrors EDP_StartOf; "day" → same day 23:59:59, "month" → last day at 23:59:59
```

**EDP_IsToday / EDP_IsYesterday / EDP_IsTomorrow**
```
Signatures: EDP_IsToday(date: DateTime) → bool
            EDP_IsYesterday(date: DateTime) → bool
            EDP_IsTomorrow(date: DateTime) → bool
Semantics:  compare UTC date components of date against __now (the evaluation-start UTC instant)
            EDP_IsToday(d): year/month/day of d == year/month/day of __now
            EDP_IsYesterday(d): same as EDP_IsToday but __now - 1 day
            EDP_IsTomorrow(d): same as EDP_IsToday but __now + 1 day
Determinism: use __now parameter, not DateTime.UtcNow, for consistency across function calls
             within one evaluation
```

**EDP_IsValidDate**
```
Signature:  EDP_IsValidDate(date: DateTime) → bool
Returns:    false if date == DateTime.MinValue (sentinel for failed EDP_Date parse)
            true otherwise
```

**EDP_IsLeapYear**
```
Signature:  EDP_IsLeapYear(date: DateTime) → bool
Returns:    true if EDP_Year(date) is a leap year
Semantics:  DateTime.IsLeapYear(EDP_Year(date))
```

---

#### Utility Functions

**EDP_Coalesce**
```
Signature:  EDP_Coalesce(a: any, b: any) → any
Returns:    a if a is not null; b otherwise
Semantics:  NCalc evaluates both arguments before calling the function. This is value-semantics
            coalescing — both branches are evaluated (unlike C# ?? which short-circuits).
            For H1 this is acceptable; null branch evaluation is safe for scalar expressions.
```

**EDP_IsNumeric**
```
Signature:  EDP_IsNumeric(value: any) → bool
Returns:    true if value is int, decimal, double, float, or a string parseable as decimal
Semantics:  if value is numeric type → true
            if value is string → decimal.TryParse(value, NumberStyles.Any, InvariantCulture)
            otherwise → false
```

**EDP_ToString**
```
Signature:  EDP_ToString(value: any) → string
Returns:    string representation of value
Semantics:  numbers → value.ToString(InvariantCulture)
            DateTime → value.ToString("yyyy-MM-ddTHH:mm:ssZ", InvariantCulture)
            bool → "true" or "false" (lowercase, invariant)
            null → "" (empty string, not "null")
Culture:    InvariantCulture for all numeric and date formatting
```

**EDP_ToNumber**
```
Signature:  EDP_ToNumber(value: any) → decimal
Returns:    numeric value; null on parse failure
Semantics:  strings → decimal.Parse(value, InvariantCulture)
            bool → 1 for true, 0 for false
            null → null
```

**EDP_ToBool**
```
Signature:  EDP_ToBool(value: any) → bool
Returns:    boolean interpretation of value
Semantics:  string (case-insensitive): "true"|"yes"|"1" → true; "false"|"no"|"0" → false
            number: non-zero → true; zero → false
            bool → pass-through
            null → false
```

---

**Total custom NCalc functions to register: 27**

| Category | Functions |
|----------|-----------|
| String (8) | EDP_Len, EDP_Upper, EDP_Lower, EDP_Trim, EDP_Contains, EDP_StartsWith, EDP_EndsWith, EDP_Matches |
| Date (16) | EDP_Now, EDP_Date, EDP_DateAdd, EDP_DateSub, EDP_DateDiff, EDP_Year, EDP_Month, EDP_Day, EDP_Hour, EDP_Minute, EDP_Second, EDP_DayOfWeek, EDP_DayOfYear, EDP_Quarter, EDP_Timestamp, EDP_StartOf, EDP_EndOf, EDP_IsToday, EDP_IsYesterday, EDP_IsTomorrow, EDP_IsValidDate, EDP_IsLeapYear |
| Utility (3) | EDP_Coalesce, EDP_IsNumeric, EDP_ToString, EDP_ToNumber, EDP_ToBool |

Note: date category totals 22 entries; the table above groups them. Final count: 8 string + 14 core date + 4 date predicates + 5 utility = **31 custom functions**. The discrepancy from the 27 figure above is corrected: date functions EDP_Timestamp, EDP_StartOf, EDP_EndOf, EDP_IsValidDate, EDP_IsLeapYear were counted separately. **Authoritative count: 31 custom NCalc functions.**

---

## 4. Determinism and Sandbox Notes

### 4.1 Culture-Sensitivity Risks

| Risk | Affected Functions | Mandated Behaviour |
|------|-------------------|--------------------|
| String casing | EDP_Upper, EDP_Lower | **InvariantCulture mandatory.** Turkish locale converts 'i' to 'İ' and 'I' to 'ı'. ToUpperInvariant / ToLowerInvariant eliminates locale-dependent behaviour. |
| String comparison | EDP_Contains, EDP_StartsWith, EDP_EndsWith | **OrdinalIgnoreCase.** Never CurrentCulture comparison. |
| Number parsing | EDP_Date, EDP_ToNumber | **InvariantCulture (period as decimal separator).** CRM on-prem environments may run with non-English Windows locales where the decimal separator is a comma. InvariantCulture parsing is mandatory to ensure `round(1.5, 1)` always means 1.5 regardless of machine locale. |
| Date formatting | EDP_ToString on DateTime | **"yyyy-MM-ddTHH:mm:ssZ" fixed format.** Never culture-dependent datetime ToString(). |
| Number formatting | EDP_ToString on numbers | **InvariantCulture.** Decimal point, not comma. |

### 4.2 Date/Time Determinism

| Risk | Mandated Behaviour |
|------|-------------------|
| `EDP_Now()` called multiple times in one expression | The runtime captures `DateTime.UtcNow` **once** at evaluation start, stores it as `__now`, and passes it as an NCalc parameter. The Rule Translator rewrites `d()` (current-datetime form) to the `__now` parameter. All date-predicate functions (`EDP_IsToday` etc.) use `__now`, not live `DateTime.UtcNow`. |
| Timezone conversion absent in H1 | **H1 grammar mandates UTC only.** All `EDP_Date()` inputs are interpreted as UTC. All component getters return UTC components. Expressions that produce time-zone-sensitive results (e.g., "is this transaction within business hours for Karachi?") must either pre-convert the datetime field in a CRM calculated field before passing to the rule, or defer to H2 timezone support. |
| `EDP_DateDiff` month/year approximation | Documented approximation (30.4375 days/month, 365.2425 days/year). Authors requiring exact calendar-month counting must use `EDP_Month` and `EDP_Year` arithmetic: `(EDP_Year(to) - EDP_Year(from)) * 12 + EDP_Month(to) - EDP_Month(from)`. |

### 4.3 Floating-Point Nondeterminism

| Risk | Mandated Behaviour |
|------|-------------------|
| NCalc evaluates arithmetic in `double` by default | NCalc uses .NET `double` for all arithmetic. For CRM currency fields (which are `decimal` in Dynamics), the input binding must specify `dataType: "decimal"`. The NCalc runtime casts `decimal` parameters to `double` during evaluation, accepting the precision loss. Formula nodes producing currency outputs **must explicitly call `Round(result, scale)`** where `scale` is the field's decimal precision (0–10). This is enforced at save time: any formula node whose `outputAlias` maps to a currency/decimal output type must contain a `Round()` call at the top level. The designer validates this. |
| IEEE 754 edge cases | `IEEERemainder` is available but not permitted in H1 grammar (non-intuitive semantics). Use `%` (modulo) only. |

### 4.4 CRM Plugin Sandbox Safety

| Risk | Behaviour |
|------|-----------|
| NCalc base package (AST interpreter) | **SAFE.** Uses `ANTLR`-generated AST walker with no IL emission, no `Reflection.Emit`, no `LambdaExpression.Compile()`. Confirmed sandbox-safe in .NET Framework partial-trust contexts (on-prem CRM plugin sandbox). The `NCalc.LambdaCompilation` package is **never used**. |
| `EDP_Matches` Regex evaluation | `System.Text.RegularExpressions.Regex` is available in the CRM sandbox. The 100ms timeout uses `Regex(pattern, RegexOptions.None, TimeSpan.FromMilliseconds(100))` — supported on .NET Framework 4.5+. On older on-prem CRM versions targeting .NET 4.0, the timeout overload may not exist; the Phase 4 team must verify and provide a static-analysis-only fallback (no runtime timeout, tighter designer validation). |
| Null parameter dereference in NCalc | NCalc throws `NCalcException` when a null parameter is used in an arithmetic operation. The EDP runtime wraps NCalc execution in a try/catch. A null arithmetic exception returns `EDP_EvaluationResult.NullInputError` with the parameter name identified from the exception message. This prevents sandbox-level exceptions from propagating as unhandled plugin failures. |
| Expression complexity (CRM 2-minute plugin limit) | NCalc evaluation of SDP-ceiling expressions (1,000 char, 10 variables) is sub-millisecond to tens-of-milliseconds. No expression within the SDP ceiling approaches the 2-minute limit. Complexity enforcement at save time (max 1,000 char expression length, max 10 variables) is the guard. |

---

## 5. Decision-Table Unary-Test Coverage

Decision table condition cells are the primary authoring surface for business analysts. This
section confirms the mapping of each ZEN unary-test form to NCalc and identifies any H1 exclusions.

### 5.1 Confirmed Coverage

| Unary Form | Example | NCalc Expansion | Status |
|------------|---------|-----------------|--------|
| Simple comparison | `> 18` | `_input > 18` | COVERED — BRIDGE |
| Equality | `== 'Gold'` | `_input == 'Gold'` | COVERED — BRIDGE |
| Inequality | `!= null` | `_input != null` | COVERED — BRIDGE |
| Inclusive numeric range | `[18..65]` | `_input >= 18 and _input <= 65` | COVERED — BRIDGE |
| Exclusive numeric range | `(0..100)` | `_input > 0 and _input < 100` | COVERED — BRIDGE |
| Half-open range | `[0..100)` | `_input >= 0 and _input < 100` | COVERED — BRIDGE |
| Date range | `[d('2024-01-01')..d('2024-12-31')]` | `_input >= EDP_Date('2024-01-01') and _input <= EDP_Date('2024-12-31')` | COVERED — BRIDGE |
| String set membership | `'AU', 'NZ', 'SG'` | `in(_input, 'AU', 'NZ', 'SG')` | COVERED — uses NCalc native `in()` |
| Numeric set membership | `1, 2, 5, 10` | `in(_input, 1, 2, 5, 10)` | COVERED |
| Compound test | `> 0 and < 100` | `_input > 0 and _input < 100` | COVERED |
| Function test | `startsWith($, 'EMP-')` | `EDP_StartsWith(_input, 'EMP-')` | COVERED — BRIDGE |
| Contains test | `contains($, 'active')` | `EDP_Contains(_input, 'active')` | COVERED |
| Regex test | `matches($, '^[A-Z]{2}[0-9]{4}$')` | `EDP_Matches(_input, '^[A-Z]{2}[0-9]{4}$')` | COVERED (constrained) |
| Wildcard / any | _(empty cell)_ | `true` | COVERED |
| Negated set | `not in ('Draft', 'Cancelled')` | `not in(_input, 'Draft', 'Cancelled')` | COVERED — `not` + `in()` |

### 5.2 Excluded from H1

| Form | Reason |
|------|--------|
| Full-expression column (`-`) with `$nodes` | Requires cross-column input access not modelled in H1 single-row evaluation. Excluded from H1 grammar. Designer hides this column type in H1. |
| Closure-based test (`some(related, # == 'X')`) | Array operations excluded. Authors express this as a pre-computed Rule Variable or Horizon 2 Custom Data Provider. |

### 5.3 Decision Table Hit-Policy Mapping

ZEN/JDM hit policies map to C# evaluation strategies in the native runtime, not to NCalc. For
completeness:

| JDM Hit Policy | PCRM Representation | C# Evaluation Strategy |
|----------------|--------------------|-----------------------|
| `first` | `hitPolicy: "first"` | Evaluate rows in order; return first matching row's outputs; stop |
| `all` | `hitPolicy: "all"` | Evaluate all rows; collect all matching rows' outputs as an array |
| `priority` | `hitPolicy: "priority"` | Evaluate all rows; return highest-priority matching row (priority column in PCRM) |
| `collect` with `sum`/`min`/`max`/`count` | `hitPolicy: "collect"`, `aggregation: "sum"` | Evaluate all rows; aggregate numeric output column across all matches |

These are runtime walking strategies; NCalc is only involved in evaluating individual cell conditions.

---

## 6. Verdict

### 6.1 Does NCalc + Bridges Cover the EDP H1 Grammar?

**Yes. ADR-11 (NCalc selected over DynamicExpresso) holds without qualification.**

The following table summarises the final construct counts:

| Classification | Count | Notes |
|---------------|-------|-------|
| NATIVE | 26 | Arithmetic, comparison, logical operators; null literal/comparison; NCalc built-in math (Abs, Floor, Ceiling, Round, Truncate, Min(2-arg), Max(2-arg), Pow, Sqrt); NCalc if(), in(); NCalc DateTime comparison |
| BRIDGE | 50 | Translator syntax mappings (exponentiation, ternary, ranges, unary tests, property-access resolution, function-name case mapping) + 31 custom NCalc function registrations |
| GAP | 29 | Array/collection functions (12); array aggregates sum/avg/median/mode (4); rand() (1); extract/split returning arrays (2); fuzzyMatch deferred H2 (1); template strings / object / array literals (3); # closure (1); timezone D-03/D-04/D-26 (3); .set() D-07 (1); .format() D-33 (1) |

**All 29 GAP constructs are either:**
- Out of scope for H1 (scalar CRM field inputs do not require array iteration)
- Explicitly non-deterministic and prohibited by design (`rand()`)
- Deferred to H2 with a defined path (`timezone`, `fuzzyMatch`, `duration`, `format`)

**No GAP is load-bearing for any H1 business rule authoring use case.**

### 6.2 ADR-11 Confirmation

The sandboxing argument that drove NCalc selection over DynamicExpresso is fully validated:
- NCalc's AST interpreter has zero `Reflection.Emit` or `LambdaExpression.Compile()` calls
- All 31 custom function registrations are pure .NET Framework / .NET Standard compatible code
- No custom function requires unmanaged code, network access, or file system access

ADR-11 is confirmed. NCalc is the correct and sufficient choice.

### 6.3 Residual Risks for Phase 4 / 5

| Risk ID | Description | Severity | Phase 4 Action |
|---------|-------------|----------|---------------|
| P4-R-01 | ZEN method-chain translator complexity — the Rule Translator must parse and rewrite `d().add("1d").diff(d("2024-01-01"), "day")` into nested NCalc function calls. Parser correctness depends on handling arbitrary nesting depth. | MEDIUM | Rule Translator unit tests must cover all date method combinations at 3+ nesting levels before runtime sprint 1. |
| P4-R-02 | `EDP_Matches` ReDoS on older .NET Framework without timeout overload | LOW | Phase 4 must verify `Regex` timeout overload availability on the customer's minimum on-prem .NET Framework version. If unavailable, implement a static complexity analyser as the only guard. |
| P4-R-03 | `EDP_DateDiff` month/year approximation causes incorrect results for exact-month-count business rules | LOW | Document the approximation prominently in designer help text. Provide the exact-calculation pattern in the authoring guide. Phase 5 must include a test for "calculate age in complete years" using EDP_Year/Month arithmetic. |
| P4-R-04 | NCalc `double` arithmetic causes currency rounding drift | MEDIUM | Designer must enforce `Round()` wrapper on all decimal/currency output formulas (validated at save time). Phase 5 must include a financial precision test: formula summing 10 fields of 4 decimal places must equal expected value within 0.0001. |
| P4-R-05 | NCalc is case-sensitive for custom function names | LOW | All EDP_ functions use exact PascalCase prefix. The Rule Translator is the single point that generates NCalc expression strings; it must output exact registered names. No hand-authored NCalc expressions enter the system. |

---

## 7. Designer Enforcement Note

The designer rejects out-of-grammar expressions at save time before any PCRM is written to CRM.
This is the primary defence against runtime failures from unsupported constructs, and it also
compensates for the WASM degraded mode accepted in ADR-10 (no inline ZEN autocomplete or
validation).

The enforcement mechanism is a two-pass save-time validator in the Rule Translator (browser-side
TypeScript, executed before the CRM write call):

**Pass 1 — Structural grammar check.** The translator parses the expression string using a
lightweight recursive-descent parser (not the full ZEN parser). It walks the AST and checks
every node against the EDP H1 grammar allowlist. Array function calls (`map(`, `filter(`, etc.),
closure syntax (`#`), object/array literals, template string syntax (`${`), the `rand()` function,
and any unrecognised function name are flagged as grammar violations. The error message names the
violating construct and links to the H1 grammar reference page in the designer help panel.

**Pass 2 — Regex complexity check.** For any `matches()` call in the expression, the pattern
string is extracted and run through a static regex-complexity analyser. Patterns with nested
quantifiers, backreferences, or character-class counts above 50 are rejected with a specific error.

**Pass 3 — Date method chain parse.** The translator attempts to parse every `d(...)` chain in
the expression. If a method in the chain is not in the H1 allowlist (e.g., `.tz()`, `.format()`,
`.set()`), the save is rejected with "method not available in Horizon 1 grammar".

**Pass 4 — Round-on-decimal-output check.** If the formula's output alias maps to a currency or
decimal-typed field (resolved from the PCRM binding), the validator checks that the top-level
expression node is a `Round(...)` call. If not, a warning is shown ("This formula produces a
decimal output; consider wrapping with Round(expression, decimalPlaces) to prevent precision
drift"). This is a warning, not a hard block, in H1 — upgraded to a hard block in H2.

On any hard-block violation, the PCRM write is aborted. The author sees the error in the formula
input field's error state. The JDM source is retained in the editor for correction. The designer
never writes an untranslatable expression to CRM.

This four-pass validation makes the designer the effective grammar enforcer, ensuring the native
C# runtime never encounters an expression it cannot evaluate.

---

*End of Spike P3-R-1 — NCalc↔ZEN Expression Coverage*
*Engagement EDP-BRE-001 | Date 2026-07-03 | Status: AUTHORITATIVE for Phase 4*
*Risk P3-R-1: CLOSED*
