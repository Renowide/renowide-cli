# Expressions

Canvas Kit v2 ships a small, safe expression grammar used by:

* `when` / `else` (conditional rendering)
* `disabled_when`, `open_when`, `next_enabled_when` (boolean guards)
* String interpolation in any `props` string (`{{form.email}}`)

The grammar is **not** JavaScript — there are no loops, no assignments,
no function calls beyond a tiny whitelist. It cannot mutate state and
cannot make network requests. The canonical implementation is in
[`@renowide/types/expression`](../../packages/types/src/expression.ts),
which is a one-for-one port of
`backend/app/services/canvas/expression.py`.

## Tokens

```
identifier → [A-Za-z_][A-Za-z0-9_]*
number     → 0 | [1-9][0-9]*(\.[0-9]+)?
string     → '…' | "…"
bool       → true | false
null       → null | undefined
paren      → ( )
bracket    → [ ]
comma      → ,
dot        → .
op (unary) → ! -
op (binary)→ && || == != >= <= > < + - * / %
```

## Grammar (BNF, informal)

```
expr      → or
or        → and ('||' and)*
and       → cmp ('&&' cmp)*
cmp       → add (('==' | '!=' | '<' | '<=' | '>' | '>=') add)*
add       → mul (('+' | '-') mul)*
mul       → unary (('*' | '/' | '%') unary)*
unary     → ('!' | '-') unary | primary
primary   → literal | path | '(' expr ')'
path      → identifier ('.' identifier | '[' expr ']' | '.' method '(' args? ')' )*
method    → 'length' | 'toLowerCase' | 'toUpperCase' | 'includes' | 'startsWith' | 'endsWith' | 'trim'
literal   → string | number | bool | null | array | object
array     → '[' (expr (',' expr)*)? ']'
object    → '{' (identifier ':' expr (',' identifier ':' expr)*)? '}'
```

### Whitelisted methods

Only these methods can be called on values:

* Strings: `.length`, `.toLowerCase()`, `.toUpperCase()`, `.includes(s)`,
  `.startsWith(s)`, `.endsWith(s)`, `.trim()`.
* Arrays: `.length`, `.includes(x)`.
* Objects: none.

Calling anything else (`form.constructor`, `custom.items.map(…)`, …) is
a parser error, caught by `renowide canvas validate` and by the backend
proxy.

## Interpolation

Any string prop with `{{ … }}` gets its content evaluated and
stringified:

```json
{ "type": "markdown", "props": { "source": "Hi **{{auth.buyer_id}}**" } }
```

Multiple expressions per string are allowed:

```
"Welcome {{form.first_name}}, you're about to hire {{meta.agent_slug}}"
```

If the expression throws (e.g. nested `undefined`), the renderer
substitutes an empty string and logs a warning in dev mode.

## Truthiness

Boolean guards follow JavaScript semantics:

* `undefined`, `null`, `""`, `0`, `false`, `[]`, `{}` are falsy.
* Anything else is truthy.

Use `!!` if you want a strict boolean cast (`"!!form.agree"`).

## Examples

```js
// Show a block only if agreed + either free tier or paid one
"form.agree && (form.tier == 'free' || form.tier == 'paid')"

// Disable until the repo URL looks plausible
"!form.repo || !form.repo.startsWith('https://gitlab.com/')"

// Open a modal when there's at least one issue
"custom.issues.length > 0"

// Next button in wizard step
"form.token.length > 20"
```

## Common mistakes

* ❌ `form.agree === true` — use `==`; we don't support triple-equals.
* ❌ `custom.items.filter(…)` — `filter` is not whitelisted. Do the
  filtering in an `action_button` handler and write the result into
  `custom`.
* ❌ `{{form.token}}` inside `action_button.props.payload` — payloads
  are JSON, not strings. Use `payload_from: "{ token: form.token }"`.
* ❌ Multiline expressions — everything in `{{…}}` / `when` /
  `disabled_when` is a single expression, no `;` separators.
