/**
 * A tiny, sandboxed arithmetic expression evaluator for grading `formula` nodes.
 *
 * SECURITY: coordinators author these expressions and they are evaluated ON THE SERVER for
 * every student. `eval` / `new Function` are therefore off the table entirely - either would
 * hand anyone who can edit a grading scheme arbitrary code execution inside the API process
 * (access to `process.env`, the Mongo connection, the filesystem). This parser only ever
 * produces numbers: it tokenizes, converts to RPN via shunting-yard, and walks the stack.
 * There is no property access, no function reference, no way out.
 *
 * Supported: + - * / % ^, unary minus, parentheses, comparisons (< <= > >= == !=),
 * variables, and the whitelisted functions below. Nothing else parses.
 */

type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma';

interface Token {
  type: TokenType;
  value: string;
}

/** Whitelisted functions, with their exact arity. */
const FUNCTIONS: Record<string, { arity: number | 'variadic'; fn: (...args: number[]) => number }> = {
  min: { arity: 'variadic', fn: (...a) => Math.min(...a) },
  max: { arity: 'variadic', fn: (...a) => Math.max(...a) },
  abs: { arity: 1, fn: (a) => Math.abs(a) },
  floor: { arity: 1, fn: (a) => Math.floor(a) },
  ceil: { arity: 1, fn: (a) => Math.ceil(a) },
  sqrt: { arity: 1, fn: (a) => Math.sqrt(a) },
  // round(x) and round(x, dp) - the 2-arg form matches the xlsx ROUND() the department's
  // existing gradebooks use everywhere.
  round: {
    arity: 'variadic',
    fn: (a, dp = 0) => {
      const f = Math.pow(10, dp);
      return Math.round(a * f) / f;
    },
  },
  clamp: { arity: 3, fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
  // Non-zero is truthy, mirroring the spreadsheet IF() these schemes are transcribed from.
  if: { arity: 3, fn: (c, a, b) => (c !== 0 ? a : b) },
};

const BINARY_OPS: Record<string, { prec: number; rightAssoc?: boolean; fn: (a: number, b: number) => number }> = {
  '==': { prec: 1, fn: (a, b) => (a === b ? 1 : 0) },
  '!=': { prec: 1, fn: (a, b) => (a !== b ? 1 : 0) },
  '<': { prec: 2, fn: (a, b) => (a < b ? 1 : 0) },
  '<=': { prec: 2, fn: (a, b) => (a <= b ? 1 : 0) },
  '>': { prec: 2, fn: (a, b) => (a > b ? 1 : 0) },
  '>=': { prec: 2, fn: (a, b) => (a >= b ? 1 : 0) },
  '+': { prec: 3, fn: (a, b) => a + b },
  '-': { prec: 3, fn: (a, b) => a - b },
  '*': { prec: 4, fn: (a, b) => a * b },
  // Division and modulo by zero yield 0 rather than Infinity/NaN. A scheme that divides by
  // a rubric max of 0 (an unconfigured component) should score the student 0, not poison
  // every downstream node with NaN.
  '/': { prec: 4, fn: (a, b) => (b === 0 ? 0 : a / b) },
  '%': { prec: 4, fn: (a, b) => (b === 0 ? 0 : a % b) },
  '^': { prec: 5, rightAssoc: true, fn: (a, b) => Math.pow(a, b) },
};

// Unary minus gets its own internal symbol so it never collides with binary '-'.
const UNARY_MINUS = 'u-';

export class ExpressionError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const raw = input.slice(i, j);
      if (!/^\d*\.?\d+$/.test(raw)) {
        throw new ExpressionError(`Invalid number "${raw}"`);
      }
      tokens.push({ type: 'number', value: raw });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j += 1;
      tokens.push({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }

    // Two-character operators must be tried before single-character ones, or "<=" would
    // tokenize as "<" followed by an unexpected "=".
    const two = input.slice(i, i + 2);
    if (['<=', '>=', '==', '!='].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
      i += 1;
      continue;
    }
    if (ch in BINARY_OPS) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${ch}"`);
  }

  return tokens;
}

interface RpnItem {
  kind: 'number' | 'var' | 'op' | 'unary' | 'func';
  value: string;
  argc?: number;
}

function toRpn(tokens: Token[]): RpnItem[] {
  const output: RpnItem[] = [];
  const stack: Array<{ kind: 'op' | 'unary' | 'func' | 'paren'; value: string }> = [];
  const argCounts: number[] = [];
  // Tracks whether the previous token could END an expression. If it could not, a '-' here
  // must be unary (e.g. "-3", "2 * -3") rather than binary.
  let prevCanEnd = false;

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];

    if (token.type === 'number') {
      output.push({ kind: 'number', value: token.value });
      prevCanEnd = true;
      continue;
    }

    if (token.type === 'ident') {
      const next = tokens[idx + 1];
      if (next && next.type === 'lparen') {
        const name = token.value.toLowerCase();
        if (!(name in FUNCTIONS)) {
          throw new ExpressionError(`Unknown function "${token.value}"`);
        }
        stack.push({ kind: 'func', value: name });
        argCounts.push(0);
      } else {
        output.push({ kind: 'var', value: token.value });
        prevCanEnd = true;
      }
      continue;
    }

    if (token.type === 'comma') {
      while (stack.length && stack[stack.length - 1].kind !== 'paren') {
        const top = stack.pop()!;
        output.push({ kind: top.kind as RpnItem['kind'], value: top.value });
      }
      if (!stack.length) throw new ExpressionError('Misplaced comma');
      if (argCounts.length) argCounts[argCounts.length - 1] += 1;
      prevCanEnd = false;
      continue;
    }

    if (token.type === 'op') {
      if (token.value === '-' && !prevCanEnd) {
        stack.push({ kind: 'unary', value: UNARY_MINUS });
        prevCanEnd = false;
        continue;
      }
      const op = BINARY_OPS[token.value];
      if (!op) throw new ExpressionError(`Unknown operator "${token.value}"`);
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.kind === 'paren' || top.kind === 'func') break;
        if (top.kind === 'unary') {
          output.push({ kind: 'unary', value: stack.pop()!.value });
          continue;
        }
        const topOp = BINARY_OPS[top.value];
        const higher = topOp.prec > op.prec || (topOp.prec === op.prec && !op.rightAssoc);
        if (!higher) break;
        output.push({ kind: 'op', value: stack.pop()!.value });
      }
      stack.push({ kind: 'op', value: token.value });
      prevCanEnd = false;
      continue;
    }

    if (token.type === 'lparen') {
      stack.push({ kind: 'paren', value: '(' });
      prevCanEnd = false;
      continue;
    }

    if (token.type === 'rparen') {
      while (stack.length && stack[stack.length - 1].kind !== 'paren') {
        const top = stack.pop()!;
        output.push({ kind: top.kind as RpnItem['kind'], value: top.value });
      }
      if (!stack.length) throw new ExpressionError('Unbalanced parentheses');
      stack.pop(); // the '('
      if (stack.length && stack[stack.length - 1].kind === 'func') {
        const fn = stack.pop()!;
        // An empty arg list "f()" has no commas and no preceding value, so argc stays 0.
        const commas = argCounts.pop() ?? 0;
        const argc = tokens[idx - 1]?.type === 'lparen' ? 0 : commas + 1;
        output.push({ kind: 'func', value: fn.value, argc });
      }
      prevCanEnd = true;
      continue;
    }
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.kind === 'paren') throw new ExpressionError('Unbalanced parentheses');
    output.push({ kind: top.kind as RpnItem['kind'], value: top.value });
  }

  return output;
}

function evalRpn(rpn: RpnItem[], variables: Record<string, number>): number {
  const stack: number[] = [];

  for (const item of rpn) {
    if (item.kind === 'number') {
      stack.push(parseFloat(item.value));
      continue;
    }

    if (item.kind === 'var') {
      // hasOwnProperty, NOT a plain `variables[name]` lookup. A bare index walks the
      // prototype chain, so "constructor", "__proto__", "toString" etc. resolve to
      // Object.prototype members instead of throwing - they land on the value stack as
      // functions, and the Number.isFinite guard at the end quietly turns the whole
      // expression into 0. A typo'd or hostile variable name must fail loudly.
      if (!Object.prototype.hasOwnProperty.call(variables, item.value)) {
        throw new ExpressionError(`Unknown variable "${item.value}"`);
      }
      const value = variables[item.value];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ExpressionError(`Variable "${item.value}" is not a finite number`);
      }
      stack.push(value);
      continue;
    }

    if (item.kind === 'unary') {
      const a = stack.pop();
      if (a === undefined) throw new ExpressionError('Malformed expression');
      stack.push(-a);
      continue;
    }

    if (item.kind === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new ExpressionError('Malformed expression');
      stack.push(BINARY_OPS[item.value].fn(a, b));
      continue;
    }

    if (item.kind === 'func') {
      const spec = FUNCTIONS[item.value];
      const argc = item.argc ?? 0;
      if (spec.arity !== 'variadic' && spec.arity !== argc) {
        throw new ExpressionError(`${item.value}() takes ${spec.arity} argument(s), got ${argc}`);
      }
      const args: number[] = [];
      for (let i = 0; i < argc; i += 1) {
        const v = stack.pop();
        if (v === undefined) throw new ExpressionError('Malformed expression');
        args.unshift(v);
      }
      stack.push(spec.fn(...args));
      continue;
    }
  }

  if (stack.length !== 1) throw new ExpressionError('Malformed expression');
  const result = stack[0];
  return Number.isFinite(result) ? result : 0;
}

/** Parses once so a scheme can be validated at save time rather than at grading time. */
export function compileExpression(expression: string): (vars: Record<string, number>) => number {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new ExpressionError('Expression is empty');
  }
  if (expression.length > 500) {
    throw new ExpressionError('Expression is too long (max 500 characters)');
  }
  const rpn = toRpn(tokenize(expression));
  return (vars) => evalRpn(rpn, vars);
}

/** Variable names an expression reads, so the editor can show which inputs it needs. */
export function expressionVariables(expression: string): string[] {
  const names = new Set<string>();
  for (const item of toRpn(tokenize(expression))) {
    if (item.kind === 'var') names.add(item.value);
  }
  return [...names];
}

export function evaluateExpression(expression: string, variables: Record<string, number>): number {
  return compileExpression(expression)(variables);
}

/** The function names the editor offers as autocomplete hints. */
export const SUPPORTED_FUNCTIONS = Object.keys(FUNCTIONS);

/** A parsed expression as a tree, for the formula <-> blocks converters (lib/formulaBlocks.ts). */
export type ExprAst =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'neg'; arg: ExprAst }
  | { kind: 'bin'; op: string; left: ExprAst; right: ExprAst }
  | { kind: 'fn'; name: string; args: ExprAst[] };

/** Parses with the same tokenizer and rules as compileExpression, then folds the RPN into a tree. */
export function expressionToAst(expression: string): ExprAst {
  compileExpression(expression); // same validation, same errors
  const stack: ExprAst[] = [];
  for (const item of toRpn(tokenize(expression))) {
    if (item.kind === 'number') stack.push({ kind: 'num', value: parseFloat(item.value) });
    else if (item.kind === 'var') stack.push({ kind: 'var', name: item.value });
    else if (item.kind === 'unary') {
      const arg = stack.pop();
      if (!arg) throw new ExpressionError('Malformed expression');
      stack.push({ kind: 'neg', arg });
    } else if (item.kind === 'op') {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) throw new ExpressionError('Malformed expression');
      stack.push({ kind: 'bin', op: item.value, left, right });
    } else if (item.kind === 'func') {
      const argc = item.argc ?? 0;
      const args = stack.splice(stack.length - argc, argc);
      if (args.length !== argc) throw new ExpressionError('Malformed expression');
      stack.push({ kind: 'fn', name: item.value, args });
    }
  }
  if (stack.length !== 1) throw new ExpressionError('Malformed expression');
  return stack[0];
}

const PRINT_PREC: Record<string, number> = { '==': 1, '!=': 1, '<': 2, '<=': 2, '>': 2, '>=': 2, '+': 3, '-': 3, '*': 4, '/': 4, '%': 4, '^': 5 };

/** Prints a tree back to an expression, with only the parentheses it needs. */
export function astToExpression(ast: ExprAst): string {
  const num = (v: number) => String(Math.round(v * 1e10) / 1e10);
  const go = (node: ExprAst, parentPrec: number, rightSide: boolean): string => {
    switch (node.kind) {
      case 'num':
        return node.value < 0 ? `(${num(node.value)})` : num(node.value);
      case 'var':
        return node.name;
      case 'neg':
        return `-${go(node.arg, 6, false)}`;
      case 'fn':
        return `${node.name}(${node.args.map((a) => go(a, 0, false)).join(', ')})`;
      case 'bin': {
        const prec = PRINT_PREC[node.op];
        const text = `${go(node.left, prec, false)} ${node.op} ${go(node.right, prec, true)}`;
        // Same precedence: left-associative ops need brackets on the right (a - (b - c)); the
        // right-associative power needs them on the left ((a ^ b) ^ c).
        const needs =
          prec < parentPrec || (prec === parentPrec && (node.op === '^' ? !rightSide : rightSide));
        return needs ? `(${text})` : text;
      }
    }
  };
  return go(ast, 0, false);
}
