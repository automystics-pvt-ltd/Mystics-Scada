/**
 * Safe formula engine for derived device parameters.
 *
 * Uses a hand-written recursive descent parser + evaluator — NO JavaScript
 * eval() or Function() calls. Supports:
 *   - Number literals (int and float)
 *   - Identifier references (param keys)
 *   - Math.* function calls from a strict allowlist
 *   - Operators: +, -, *, /, **, % (with standard precedence)
 *   - Unary minus
 *   - Parentheses
 *
 * Any reference to an unknown identifier, or to Math.* functions not on the
 * allowlist, returns null (not an error — enables graceful degradation).
 *
 * Example:
 *   evaluateFormula("ac_voltage * ac_current / 1000", { ac_voltage: 240, ac_current: 5 })
 *   // → 1.2
 */

type ParamMap = Record<string, number | string | boolean | null>;

// ── Allowlisted Math functions ────────────────────────────────────────────────

const MATH_ALLOWLIST: Record<string, (...args: number[]) => number> = {
  abs:   Math.abs,
  ceil:  Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt:  Math.sqrt,
  cbrt:  Math.cbrt,
  log:   Math.log,
  log2:  Math.log2,
  log10: Math.log10,
  exp:   Math.exp,
  pow:   Math.pow,
  min:   Math.min,
  max:   Math.max,
  sign:  Math.sign,
  trunc: Math.trunc,
  sin:   Math.sin,
  cos:   Math.cos,
  tan:   Math.tan,
  atan:  Math.atan,
  atan2: Math.atan2,
  PI:    () => Math.PI,
  E:     () => Math.E,
};

// ── Tokeniser ────────────────────────────────────────────────────────────────

type TokenKind =
  | "num"       // 3.14
  | "ident"     // some_param or Math
  | "dot"       // .
  | "lparen"    // (
  | "rparen"    // )
  | "comma"     // ,
  | "plus"      // +
  | "minus"     // -
  | "star"      // *
  | "starstar"  // **
  | "slash"     // /
  | "percent"   // %
  | "eof";

interface Token { kind: TokenKind; value: string; pos: number; }

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch >= "0" && ch <= "9" || (ch === "." && src[i + 1] !== undefined && src[i + 1]! >= "0" && src[i + 1]! <= "9")) {
      let num = "";
      while (i < src.length && (src[i]! >= "0" && src[i]! <= "9" || src[i] === ".")) num += src[i++];
      tokens.push({ kind: "num", value: num, pos: i });
    } else if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let ident = "";
      while (i < src.length && ((src[i]! >= "a" && src[i]! <= "z") || (src[i]! >= "A" && src[i]! <= "Z") || (src[i]! >= "0" && src[i]! <= "9") || src[i] === "_")) ident += src[i++];
      tokens.push({ kind: "ident", value: ident, pos: i });
    } else if (ch === "*" && src[i + 1] === "*") { tokens.push({ kind: "starstar", value: "**", pos: i }); i += 2; }
    else if (ch === "*") { tokens.push({ kind: "star",    value: "*", pos: i++ }); }
    else if (ch === "+") { tokens.push({ kind: "plus",    value: "+", pos: i++ }); }
    else if (ch === "-") { tokens.push({ kind: "minus",   value: "-", pos: i++ }); }
    else if (ch === "/") { tokens.push({ kind: "slash",   value: "/", pos: i++ }); }
    else if (ch === "%") { tokens.push({ kind: "percent", value: "%", pos: i++ }); }
    else if (ch === "(") { tokens.push({ kind: "lparen",  value: "(", pos: i++ }); }
    else if (ch === ")") { tokens.push({ kind: "rparen",  value: ")", pos: i++ }); }
    else if (ch === ",") { tokens.push({ kind: "comma",   value: ",", pos: i++ }); }
    else if (ch === ".") { tokens.push({ kind: "dot",     value: ".", pos: i++ }); }
    else { throw new Error(`Unexpected character '${ch}' at position ${i}`); }
  }
  tokens.push({ kind: "eof", value: "", pos: i });
  return tokens;
}

// ── Parser / evaluator — recursive descent ───────────────────────────────────

class Evaluator {
  private tokens: Token[];
  private pos = 0;
  private params: ParamMap;

  constructor(tokens: Token[], params: ParamMap) {
    this.tokens = tokens;
    this.params = params;
  }

  private peek(): Token { return this.tokens[this.pos] ?? { kind: "eof", value: "", pos: 0 }; }
  private consume(): Token { return this.tokens[this.pos++] ?? { kind: "eof", value: "", pos: 0 }; }
  private expect(kind: TokenKind): Token {
    const t = this.consume();
    if (t.kind !== kind) throw new Error(`Expected ${kind} but got ${t.kind}`);
    return t;
  }

  /** Top level: additive expression */
  evaluate(): number {
    const v = this.parseAdditive();
    if (this.peek().kind !== "eof") throw new Error("Unexpected token after expression");
    return v;
  }

  /** additive = multiplicative (('+' | '-') multiplicative)* */
  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    while (this.peek().kind === "plus" || this.peek().kind === "minus") {
      const op = this.consume().kind;
      const right = this.parseMultiplicative();
      left = op === "plus" ? left + right : left - right;
    }
    return left;
  }

  /** multiplicative = power (('*' | '/' | '%') power)* */
  private parseMultiplicative(): number {
    let left = this.parsePower();
    while (this.peek().kind === "star" || this.peek().kind === "slash" || this.peek().kind === "percent") {
      const op = this.consume().kind;
      const right = this.parsePower();
      if (op === "star")    left = left * right;
      else if (op === "slash") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else { left = left % right; }
    }
    return left;
  }

  /** power = unary ('**' unary)* (right-associative via recursion) */
  private parsePower(): number {
    const base = this.parseUnary();
    if (this.peek().kind === "starstar") {
      this.consume();
      const exp = this.parsePower(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  /** unary = '-' unary | primary */
  private parseUnary(): number {
    if (this.peek().kind === "minus") { this.consume(); return -this.parsePower(); }
    return this.parsePrimary();
  }

  /** primary = number | '(' expr ')' | ident | 'Math' '.' fnName '(' args ')' */
  private parsePrimary(): number {
    const t = this.peek();

    if (t.kind === "num") {
      this.consume();
      return parseFloat(t.value);
    }

    if (t.kind === "lparen") {
      this.consume();
      const v = this.parseAdditive();
      this.expect("rparen");
      return v;
    }

    if (t.kind === "ident") {
      this.consume();

      // Math.fn(…) call
      if (t.value === "Math" && this.peek().kind === "dot") {
        this.consume(); // consume dot
        const fnTok = this.expect("ident");
        const fn = MATH_ALLOWLIST[fnTok.value];
        if (!fn) throw new Error(`Math.${fnTok.value} is not allowed`);
        this.expect("lparen");
        const args: number[] = [];
        if (this.peek().kind !== "rparen") {
          args.push(this.parseAdditive());
          while (this.peek().kind === "comma") { this.consume(); args.push(this.parseAdditive()); }
        }
        this.expect("rparen");
        return fn(...args);
      }

      // Named Math constants (PI, E) without parens
      if (t.value === "PI") return Math.PI;
      if (t.value === "E")  return Math.E;

      // Param lookup
      const val = this.params[t.value];
      if (typeof val === "number") return val;
      if (typeof val === "boolean") return val ? 1 : 0;
      if (typeof val === "string") {
        const num = parseFloat(val);
        if (!isNaN(num)) return num;
      }
      // Unknown or null param — return 0 (safe default, won't throw)
      throw new Error(`Unknown parameter: ${t.value}`);
    }

    throw new Error(`Unexpected token: ${t.kind} ('${t.value}')`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a formula expression with the given params as variables.
 * Returns `null` if the expression errors or produces a non-finite result.
 */
export function evaluateFormula(formula: string, params: ParamMap): number | null {
  if (!formula?.trim()) return null;
  try {
    const tokens = tokenize(formula.trim());
    const evaluator = new Evaluator(tokens, params);
    const result = evaluator.evaluate();
    if (!isFinite(result) || isNaN(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Apply all formula-based fields in `fieldMap` to the given params map.
 * Returns a new params object with derived values merged in.
 */
export function applyFormulas(
  params: ParamMap,
  fieldMap: Array<{ key: string; formula?: string }>,
): ParamMap {
  if (!fieldMap.some((f) => f.formula)) return params;
  const result = { ...params };
  for (const field of fieldMap) {
    if (!field.formula) continue;
    const value = evaluateFormula(field.formula, result);
    if (value !== null) result[field.key] = value;
  }
  return result;
}
