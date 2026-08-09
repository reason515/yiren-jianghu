/**
 * 安全数值表达式引擎（DC-046）。
 * 白名单运算与函数；禁止属性访问、赋值、字符串与任意调用。
 */

export type ExprAst =
  | { kind: "num"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "-" | "!"; arg: ExprAst }
  | { kind: "binary"; op: BinaryOp; left: ExprAst; right: ExprAst }
  | { kind: "ternary"; cond: ExprAst; then: ExprAst; else: ExprAst }
  | { kind: "call"; name: string; args: ExprAst[] };

type BinaryOp =
  "+" | "-" | "*" | "/" | "%" | "^" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&&" | "||";

type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "qmark" }
  | { type: "colon" }
  | { type: "eof" };

const FUNCS = new Set(["floor", "ceil", "round", "min", "max", "abs", "pow"]);

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprError";
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ExprError(`非法数字：${raw}`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j]!)) j += 1;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/%^<>!".includes(c)) {
      tokens.push({ type: "op", value: c });
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i += 1;
      continue;
    }
    if (c === "?") {
      tokens.push({ type: "qmark" });
      i += 1;
      continue;
    }
    if (c === ":") {
      tokens.push({ type: "colon" });
      i += 1;
      continue;
    }
    throw new ExprError(`非法字符：${c}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: "eof" };
  }

  private advance(): Token {
    const t = this.peek();
    if (t.type !== "eof") this.pos += 1;
    return t;
  }

  private expectOp(value: string): void {
    const t = this.advance();
    if (t.type !== "op" || t.value !== value) throw new ExprError(`期望运算符 ${value}`);
  }

  parse(): ExprAst {
    const ast = this.parseTernary();
    if (this.peek().type !== "eof") throw new ExprError("表达式末尾有多余内容");
    return ast;
  }

  private parseTernary(): ExprAst {
    const cond = this.parseOr();
    if (this.peek().type === "qmark") {
      this.advance();
      const then = this.parseTernary();
      if (this.peek().type !== "colon") throw new ExprError("三元表达式缺少 ':'");
      this.advance();
      const elseAst = this.parseTernary();
      return { kind: "ternary", cond, then, else: elseAst };
    }
    return cond;
  }

  private parseOr(): ExprAst {
    let left = this.parseAnd();
    while (this.peek().type === "op" && (this.peek() as { value: string }).value === "||") {
      this.advance();
      left = { kind: "binary", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ExprAst {
    let left = this.parseEquality();
    while (this.peek().type === "op" && (this.peek() as { value: string }).value === "&&") {
      this.advance();
      left = { kind: "binary", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExprAst {
    let left = this.parseCompare();
    while (
      this.peek().type === "op" &&
      ["==", "!="].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.advance() as { value: BinaryOp }).value;
      left = { kind: "binary", op, left, right: this.parseCompare() };
    }
    return left;
  }

  private parseCompare(): ExprAst {
    let left = this.parseAdd();
    while (
      this.peek().type === "op" &&
      ["<", "<=", ">", ">="].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.advance() as { value: BinaryOp }).value;
      left = { kind: "binary", op, left, right: this.parseAdd() };
    }
    return left;
  }

  private parseAdd(): ExprAst {
    let left = this.parseMul();
    while (
      this.peek().type === "op" &&
      ["+", "-"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.advance() as { value: BinaryOp }).value;
      left = { kind: "binary", op, left, right: this.parseMul() };
    }
    return left;
  }

  private parseMul(): ExprAst {
    let left = this.parsePow();
    while (
      this.peek().type === "op" &&
      ["*", "/", "%"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.advance() as { value: BinaryOp }).value;
      left = { kind: "binary", op, left, right: this.parsePow() };
    }
    return left;
  }

  private parsePow(): ExprAst {
    let left = this.parseUnary();
    if (this.peek().type === "op" && (this.peek() as { value: string }).value === "^") {
      this.advance();
      // 右结合
      left = { kind: "binary", op: "^", left, right: this.parsePow() };
    }
    return left;
  }

  private parseUnary(): ExprAst {
    if (
      this.peek().type === "op" &&
      ["-", "!"].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.advance() as { value: "-" | "!" }).value;
      return { kind: "unary", op, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprAst {
    const t = this.peek();
    if (t.type === "num") {
      this.advance();
      return { kind: "num", value: t.value };
    }
    if (t.type === "ident") {
      this.advance();
      if (this.peek().type === "lparen") {
        if (!FUNCS.has(t.value)) throw new ExprError(`未允许的函数：${t.value}`);
        this.advance();
        const args: ExprAst[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseTernary());
          while (this.peek().type === "comma") {
            this.advance();
            args.push(this.parseTernary());
          }
        }
        if (this.peek().type !== "rparen") throw new ExprError("函数调用缺少 ')'");
        this.advance();
        return { kind: "call", name: t.value, args };
      }
      return { kind: "ident", name: t.value };
    }
    if (t.type === "lparen") {
      this.advance();
      const inner = this.parseTernary();
      if (this.peek().type !== "rparen") throw new ExprError("缺少 ')'");
      this.advance();
      return inner;
    }
    throw new ExprError("期望数字、标识符或 '('");
  }
}

export function compileExpr(source: string): ExprAst {
  const trimmed = source.trim();
  if (!trimmed) throw new ExprError("空表达式");
  return new Parser(tokenize(trimmed)).parse();
}

function truthy(n: number): boolean {
  return n !== 0;
}

export function evalAst(ast: ExprAst, bindings: Record<string, number>): number {
  switch (ast.kind) {
    case "num":
      return ast.value;
    case "ident": {
      if (!(ast.name in bindings)) throw new ExprError(`未知变量：${ast.name}`);
      const v = bindings[ast.name]!;
      if (!Number.isFinite(v)) throw new ExprError(`变量 ${ast.name} 非有限数`);
      return v;
    }
    case "unary": {
      const a = evalAst(ast.arg, bindings);
      if (ast.op === "-") return -a;
      return truthy(a) ? 0 : 1;
    }
    case "binary": {
      const op = ast.op;
      if (op === "&&") {
        const l = evalAst(ast.left, bindings);
        return truthy(l) ? (truthy(evalAst(ast.right, bindings)) ? 1 : 0) : 0;
      }
      if (op === "||") {
        const l = evalAst(ast.left, bindings);
        return truthy(l) ? 1 : truthy(evalAst(ast.right, bindings)) ? 1 : 0;
      }
      const left = evalAst(ast.left, bindings);
      const right = evalAst(ast.right, bindings);
      switch (op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) throw new ExprError("除以零");
          return left / right;
        case "%":
          if (right === 0) throw new ExprError("取模零");
          return left % right;
        case "^":
          return left ** right;
        case "<":
          return left < right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case ">":
          return left > right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
        case "==":
          return left === right ? 1 : 0;
        case "!=":
          return left !== right ? 1 : 0;
        default:
          throw new ExprError(`未知运算符`);
      }
    }
    case "ternary":
      return truthy(evalAst(ast.cond, bindings))
        ? evalAst(ast.then, bindings)
        : evalAst(ast.else, bindings);
    case "call": {
      const args = ast.args.map((a) => evalAst(a, bindings));
      switch (ast.name) {
        case "floor":
          if (args.length !== 1) throw new ExprError("floor 需要 1 个参数");
          return Math.floor(args[0]!);
        case "ceil":
          if (args.length !== 1) throw new ExprError("ceil 需要 1 个参数");
          return Math.ceil(args[0]!);
        case "round":
          if (args.length !== 1) throw new ExprError("round 需要 1 个参数");
          return Math.round(args[0]!);
        case "abs":
          if (args.length !== 1) throw new ExprError("abs 需要 1 个参数");
          return Math.abs(args[0]!);
        case "min":
          if (args.length < 1) throw new ExprError("min 至少 1 个参数");
          return Math.min(...args);
        case "max":
          if (args.length < 1) throw new ExprError("max 至少 1 个参数");
          return Math.max(...args);
        case "pow":
          if (args.length !== 2) throw new ExprError("pow 需要 2 个参数");
          return args[0]! ** args[1]!;
        default:
          throw new ExprError(`未允许的函数：${ast.name}`);
      }
    }
    default:
      throw new ExprError("未知 AST");
  }
}

/** 收集表达式中引用的标识符（不含函数名）。 */
export function collectIdents(ast: ExprAst): Set<string> {
  const out = new Set<string>();
  const walk = (node: ExprAst): void => {
    switch (node.kind) {
      case "num":
        return;
      case "ident":
        out.add(node.name);
        return;
      case "unary":
        walk(node.arg);
        return;
      case "binary":
        walk(node.left);
        walk(node.right);
        return;
      case "ternary":
        walk(node.cond);
        walk(node.then);
        walk(node.else);
        return;
      case "call":
        for (const a of node.args) walk(a);
        return;
    }
  };
  walk(ast);
  return out;
}

export function evalExpr(source: string, bindings: Record<string, number>): number {
  return evalAst(compileExpr(source), bindings);
}
