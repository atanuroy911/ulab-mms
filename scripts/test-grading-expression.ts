import { evaluateExpression, expressionVariables, ExpressionError } from '../lib/gradingExpression';

const cases: Array<[string, Record<string, number>, number]> = [
  ['1 + 2 * 3', {}, 7],
  ['(1 + 2) * 3', {}, 9],
  ['-3 + 5', {}, 2],
  ['2 * -3', {}, -6],
  ['2 ^ 3 ^ 2', {}, 512],
  ['10 / 0', {}, 0],
  ['round(3.14159, 2)', {}, 3.14],
  ['round(2.5)', {}, 3],
  ['min(3, 1, 2)', {}, 1],
  ['max(3, 1, 2)', {}, 3],
  ['clamp(50, 0, 45)', {}, 45],
  ['if(1 > 0, 10, 20)', {}, 10],
  ['if(1 < 0, 10, 20)', {}, 20],
  ['abs(-5)', {}, 5],
  ['sup * 0.6 + evalr * 0.4', { sup: 30, evalr: 20 }, 26],
  // The real CSE4098A report component: 60/40 supervisor/evaluator blend, scaled to 40 pts
  ['round(40 * (0.6 * sup / 33 + 0.4 * ev / 33), 2)', { sup: 30, ev: 27 }, 34.91],
  ['a + b + c', { a: 1, b: 2, c: 3 }, 6],
  ['100 * 3 / 4', {}, 75],
  ['5 >= 5', {}, 1],
  ['5 != 5', {}, 0],
];

let pass = 0;
let fail = 0;

for (const [expr, vars, expected] of cases) {
  try {
    const got = evaluateExpression(expr, vars);
    if (Math.abs(got - expected) < 1e-9) {
      pass += 1;
    } else {
      fail += 1;
      console.log(`FAIL  ${expr}  => ${got}, expected ${expected}`);
    }
  } catch (err) {
    fail += 1;
    console.log(`THROW ${expr}  => ${(err as Error).message}`);
  }
}

// Everything below must be REJECTED. These are the injection attempts the sandbox exists
// to stop - if any of them evaluates instead of throwing, the parser is not safe.
const mustThrow = [
  'process.env.MONGODB_URI',
  'constructor',
  'this.constructor("return 1")()',
  '__proto__',
  'require("fs")',
  'globalThis',
  '1; console.log(1)',
  'a[0]',
  '1 + ',
  '(1 + 2',
  '1 + 2)',
  'unknownFn(3)',
  '"string"',
  '1 & 2',
  '`x`',
];

for (const expr of mustThrow) {
  try {
    const got = evaluateExpression(expr, {});
    fail += 1;
    console.log(`NOT REJECTED  ${expr}  => ${got}`);
  } catch (err) {
    if (err instanceof ExpressionError) {
      pass += 1;
    } else {
      fail += 1;
      console.log(`WRONG ERROR TYPE  ${expr}  => ${(err as Error).message}`);
    }
  }
}

// Unknown variables must throw rather than silently reading as 0, so a typo in a formula
// surfaces at save time instead of quietly zeroing a component for every student.
try {
  evaluateExpression('typo_var + 1', { real_var: 5 });
  fail += 1;
  console.log('NOT REJECTED  unknown variable');
} catch {
  pass += 1;
}

console.log('vars of "a*2 + b":', expressionVariables('a*2 + b'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
