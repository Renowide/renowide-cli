/**
 * Canvas Kit v2 expression grammar — canonical TypeScript implementation.
 *
 * MUST produce identical results to the Python mirror at
 * `backend/app/services/canvas/expression.py`. A parity fixture suite
 * lives at `test/expression-parity.test.ts` and is run in CI against
 * the Python implementation.
 *
 * Used by:
 *   - every renderer at runtime (JSON → React elements)
 *   - the CLI's `canvas validate` command (pre-deploy check)
 *   - the Renowide backend proxy at ingest time
 *
 * Grammar:
 *   expression := ternary
 *   ternary    := or ('?' expression ':' expression)?
 *   or         := and ('||' and)*
 *   and        := eq ('&&' eq)*
 *   eq         := cmp (('==='|'!=='|'=='|'!=') cmp)*
 *   cmp        := add (('<'|'<='|'>'|'>=') add)*
 *   add        := mul (('+'|'-') mul)*
 *   mul        := unary (('*'|'/'|'%') unary)*
 *   unary      := ('!'|'-')? postfix
 *   postfix    := primary ('.' ident | '[' expression ']' | '.' ident '(' args ')')*
 *   primary    := num | str | bool | null | ident | '(' expression ')'
 *
 * No `new`, no `eval`, no mutation, no ternary nesting beyond safe precedence.
 * Expressions are capped at 200 characters upstream of the parser.
 */

export const MAX_EXPR_LEN = 200;

// ─── Tokens ─────────────────────────────────────────────────────────────────

type TokenKind =
  | "num"
  | "str"
  | "bool"
  | "null"
  | "ident"
  | "dot"
  | "lbrack"
  | "rbrack"
  | "lparen"
  | "rparen"
  | "comma"
  | "op"
  | "question"
  | "colon"
  | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

const OP_TOKENS = [
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<",
  ">",
  "!",
  "+",
  "-",
  "*",
  "/",
  "%",
] as const;

const IDENT_START = /[a-zA-Z_]/;
const IDENT_REST = /[a-zA-Z0-9_]/;
const DIGIT = /[0-9]/;
const WS = new Set([" ", "\t", "\n", "\r"]);

function tokenise(src: string): Token[] {
  if (src.length > MAX_EXPR_LEN) {
    throw new Error(`expression exceeds ${MAX_EXPR_LEN} characters`);
  }
  const out: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i]!;
    if (WS.has(c)) {
      i++;
      continue;
    }

    if (c === '"') {
      const start = i;
      i++;
      const parts: string[] = [];
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < n) {
          const esc = src[i + 1]!;
          parts.push(esc === "n" ? "\n" : esc === "t" ? "\t" : esc);
          i += 2;
        } else {
          parts.push(src[i]!);
          i++;
        }
      }
      if (i >= n || src[i] !== '"') {
        throw new Error(`unterminated string at position ${start}`);
      }
      i++;
      out.push({ kind: "str", value: parts.join(""), pos: start });
      continue;
    }

    if (
      DIGIT.test(c) ||
      (c === "." && i + 1 < n && DIGIT.test(src[i + 1]!))
    ) {
      const start = i;
      while (i < n && (DIGIT.test(src[i]!) || src[i] === ".")) i++;
      out.push({ kind: "num", value: src.slice(start, i), pos: start });
      continue;
    }

    if (IDENT_START.test(c)) {
      const start = i;
      while (i < n && IDENT_REST.test(src[i]!)) i++;
      const ident = src.slice(start, i);
      if (ident === "true" || ident === "false") {
        out.push({ kind: "bool", value: ident, pos: start });
      } else if (ident === "null") {
        out.push({ kind: "null", value: ident, pos: start });
      } else {
        out.push({ kind: "ident", value: ident, pos: start });
      }
      continue;
    }

    const singles: Record<string, TokenKind> = {
      ".": "dot",
      "[": "lbrack",
      "]": "rbrack",
      "(": "lparen",
      ")": "rparen",
      ",": "comma",
      "?": "question",
      ":": "colon",
    };
    if (c in singles) {
      out.push({ kind: singles[c]!, value: c, pos: i });
      i++;
      continue;
    }

    let matched: string | null = null;
    for (const op of OP_TOKENS) {
      if (src.startsWith(op, i)) {
        matched = op;
        break;
      }
    }
    if (matched !== null) {
      out.push({ kind: "op", value: matched, pos: i });
      i += matched.length;
      continue;
    }

    throw new Error(`unexpected character at position ${i}: ${JSON.stringify(c)}`);
  }

  out.push({ kind: "eof", value: "", pos: n });
  return out;
}

// ─── AST ────────────────────────────────────────────────────────────────────

export type AstNode =
  | { kind: "lit"; value: unknown }
  | { kind: "ref"; path: string[] }
  | { kind: "index"; target: AstNode; index: AstNode }
  | { kind: "unary"; op: "!" | "-"; arg: AstNode }
  | { kind: "binary"; op: string; left: AstNode; right: AstNode }
  | { kind: "ternary"; cond: AstNode; then: AstNode; else: AstNode }
  | { kind: "call"; target: AstNode; method: string; args: AstNode[] };

// ─── Parser ─────────────────────────────────────────────────────────────────

const BINOP_PREC: Record<string, number> = {
  "*": 14,
  "/": 14,
  "%": 14,
  "+": 13,
  "-": 13,
  "<": 11,
  "<=": 11,
  ">": 11,
  ">=": 11,
  "===": 10,
  "!==": 10,
  "==": 10,
  "!=": 10,
  "&&": 6,
  "||": 5,
};

const WHITELIST_METHODS: Record<string, { arity: number; on: "string" | "array" | "any" }> =
  {
    toLowerCase: { arity: 0, on: "string" },
    toUpperCase: { arity: 0, on: "string" },
    trim: { arity: 0, on: "string" },
    startsWith: { arity: 1, on: "string" },
    endsWith: { arity: 1, on: "string" },
    includes: { arity: 1, on: "any" },
    join: { arity: 1, on: "array" },
  };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    const e = this.parseExpression(0);
    if (this.peek().kind !== "eof") {
      const t = this.peek();
      throw new Error(`unexpected trailing input at position ${t.pos}`);
    }
    return e;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    const t = this.tokens[this.pos]!;
    this.pos++;
    return t;
  }

  private expect(kind: TokenKind, value?: string): Token {
    const t = this.peek();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new Error(
        `expected ${value ?? kind} at position ${t.pos}, got ${t.kind}(${JSON.stringify(t.value)})`,
      );
    }
    return this.next();
  }

  private parseExpression(minPrec: number): AstNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.kind === "question") {
        if (minPrec > 4) break;
        this.next();
        const thenBranch = this.parseExpression(0);
        this.expect("colon");
        const elseBranch = this.parseExpression(4);
        left = { kind: "ternary", cond: left, then: thenBranch, else: elseBranch };
        continue;
      }
      if (t.kind !== "op" || !(t.value in BINOP_PREC)) break;
      const prec = BINOP_PREC[t.value]!;
      if (prec < minPrec) break;
      this.next();
      const right = this.parseExpression(prec + 1);
      left = { kind: "binary", op: t.value, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t.kind === "op" && (t.value === "!" || t.value === "-")) {
      this.next();
      return { kind: "unary", op: t.value as "!" | "-", arg: this.parseUnary() };
    }
    return this.parsePostfix(this.parsePrimary());
  }

  private parsePrimary(): AstNode {
    const t = this.peek();
    if (t.kind === "num") {
      this.next();
      return { kind: "lit", value: t.value.includes(".") ? parseFloat(t.value) : parseInt(t.value, 10) };
    }
    if (t.kind === "str") {
      this.next();
      return { kind: "lit", value: t.value };
    }
    if (t.kind === "bool") {
      this.next();
      return { kind: "lit", value: t.value === "true" };
    }
    if (t.kind === "null") {
      this.next();
      return { kind: "lit", value: null };
    }
    if (t.kind === "lparen") {
      this.next();
      const e = this.parseExpression(0);
      this.expect("rparen");
      return e;
    }
    if (t.kind === "ident") {
      this.next();
      return { kind: "ref", path: [t.value] };
    }
    throw new Error(
      `unexpected token ${t.kind}(${JSON.stringify(t.value)}) at position ${t.pos}`,
    );
  }

  private parsePostfix(node: AstNode): AstNode {
    for (;;) {
      const t = this.peek();
      if (t.kind === "dot") {
        this.next();
        const ident = this.expect("ident").value;
        const after = this.peek();
        if (after.kind === "lparen") {
          this.next();
          const args: AstNode[] = [];
          if (this.peek().kind !== "rparen") {
            args.push(this.parseExpression(0));
            while (this.peek().kind === "comma") {
              this.next();
              args.push(this.parseExpression(0));
            }
          }
          this.expect("rparen");
          const spec = WHITELIST_METHODS[ident];
          if (!spec) throw new Error(`method .${ident}() is not in the whitelist`);
          if (args.length !== spec.arity) {
            throw new Error(
              `method .${ident}() takes ${spec.arity} args, got ${args.length}`,
            );
          }
          node = { kind: "call", target: node, method: ident, args };
        } else {
          if (node.kind === "ref") {
            node = { kind: "ref", path: [...node.path, ident] };
          } else {
            node = { kind: "index", target: node, index: { kind: "lit", value: ident } };
          }
        }
        continue;
      }
      if (t.kind === "lbrack") {
        this.next();
        const idx = this.parseExpression(0);
        this.expect("rbrack");
        node = { kind: "index", target: node, index: idx };
        continue;
      }
      break;
    }
    return node;
  }
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

export type StateTree = Record<string, unknown>;

function jsTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  return true;
}

function callMethod(target: unknown, method: string, args: unknown[]): unknown {
  if (method === "toLowerCase" && typeof target === "string") return target.toLowerCase();
  if (method === "toUpperCase" && typeof target === "string") return target.toUpperCase();
  if (method === "trim" && typeof target === "string") return target.trim();
  if (method === "startsWith" && typeof target === "string") {
    return target.startsWith(String(args[0]));
  }
  if (method === "endsWith" && typeof target === "string") {
    return target.endsWith(String(args[0]));
  }
  if (method === "includes") {
    if (typeof target === "string") return target.includes(String(args[0]));
    if (Array.isArray(target)) return target.includes(args[0]);
  }
  if (method === "join" && Array.isArray(target)) {
    return target.map((x) => (x === null || x === undefined ? "" : String(x))).join(String(args[0]));
  }
  throw new Error(`method .${method}() not valid on ${typeof target}`);
}

export function evaluate(ast: AstNode, state: StateTree): unknown {
  switch (ast.kind) {
    case "lit":
      return ast.value;
    case "ref": {
      let cur: unknown = state;
      for (const seg of ast.path) {
        if (cur === null || cur === undefined) return null;
        if (seg === "length" && (typeof cur === "string" || Array.isArray(cur))) {
          cur = cur.length;
        } else if (typeof cur === "object") {
          cur = (cur as Record<string, unknown>)[seg];
        } else {
          cur = undefined;
        }
      }
      return cur === undefined ? null : cur;
    }
    case "index": {
      const target = evaluate(ast.target, state);
      const idx = evaluate(ast.index, state);
      if (target === null || target === undefined) return null;
      try {
        if (Array.isArray(target) || typeof target === "string") {
          const i = typeof idx === "number" ? idx : Number(idx);
          if (!Number.isFinite(i)) return null;
          return (target as string | unknown[])[i] ?? null;
        }
        if (typeof target === "object") {
          return (target as Record<string, unknown>)[String(idx)] ?? null;
        }
        return null;
      } catch {
        return null;
      }
    }
    case "unary": {
      const v = evaluate(ast.arg, state);
      if (ast.op === "!") return !jsTruthy(v);
      if (ast.op === "-") return -(typeof v === "number" ? v : 0);
      throw new Error(`bad unary op ${ast.op}`);
    }
    case "binary": {
      const left = evaluate(ast.left, state);
      const right = evaluate(ast.right, state);
      const op = ast.op;
      if (op === "===") return left === right;
      if (op === "!==") return left !== right;
      // eslint-disable-next-line eqeqeq
      if (op === "==") return left == right;
      // eslint-disable-next-line eqeqeq
      if (op === "!=") return left != right;
      if (op === "&&") return jsTruthy(left) ? right : left;
      if (op === "||") return jsTruthy(left) ? left : right;
      const l = typeof left === "number" ? left : 0;
      const r = typeof right === "number" ? right : 0;
      if (op === "<") return (left as never) < (right as never);
      if (op === ">") return (left as never) > (right as never);
      if (op === "<=") return (left as never) <= (right as never);
      if (op === ">=") return (left as never) >= (right as never);
      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          return `${left ?? ""}${right ?? ""}`;
        }
        return l + r;
      }
      if (op === "-") return l - r;
      if (op === "*") return l * r;
      if (op === "/") return r === 0 ? Infinity : l / r;
      if (op === "%") return r === 0 ? 0 : l % r;
      throw new Error(`bad binary op ${op}`);
    }
    case "ternary":
      return jsTruthy(evaluate(ast.cond, state))
        ? evaluate(ast.then, state)
        : evaluate(ast.else, state);
    case "call": {
      const target = evaluate(ast.target, state);
      const args = ast.args.map((a) => evaluate(a, state));
      return callMethod(target, ast.method, args);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function parseExpression(src: string): AstNode {
  return new Parser(tokenise(src)).parse();
}

export function evalExpression(src: string, state: StateTree): unknown {
  return evaluate(parseExpression(src), state);
}

export function evalBoolean(src: string, state: StateTree): boolean {
  return jsTruthy(evalExpression(src, state));
}

/** Parse-only — throws on invalid syntax. Safe for ingest-time validation. */
export function validateExpression(src: string): void {
  parseExpression(src);
}

// ─── Template interpolation ─────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function interpolate(template: string, state: StateTree): string {
  return template.replace(TEMPLATE_RE, (_, expr: string) => {
    const v = evalExpression(expr, state);
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  });
}

export function extractExpressions(template: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(TEMPLATE_RE.source, "g");
  while ((m = re.exec(template)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}
