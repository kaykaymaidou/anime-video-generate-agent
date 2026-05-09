/** httpx/json 路径上与 Python strip_surrogates 对齐：移除孤立的 surrogate 代理对半区 */
export function stripSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDFFF]/g, "");
}

/**
 * 从文本中提取首个平衡的 JSON 对象或数组（忽略字符串内的括号）。
 * 解决模型在合法 JSON 后又输出解释文字导致的 parse 失败。
 */
export function extractFirstBalancedJson(s: string): string | null {
  const t = s.trim();
  const iObj = t.indexOf("{");
  const iArr = t.indexOf("[");
  let start = -1;
  if (iObj >= 0 && (iArr < 0 || iObj <= iArr)) start = iObj;
  else if (iArr >= 0) start = iArr;
  else return null;

  const pair: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < t.length; i += 1) {
    const c = t[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(pair[c]);
      continue;
    }
    if (c === "}" || c === "]") {
      if (stack.length === 0 || stack[stack.length - 1] !== c) return null;
      stack.pop();
      if (stack.length === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

/** 模型未开 json 模式时常见 markdown 代码块或前后废话；用于兜底解析 */
export function parseJsonLoose<T = Record<string, unknown>>(content: string): T {
  let t = stripSurrogates(content.trim());
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) t = fence[1].trim();

  const balanced = extractFirstBalancedJson(t);
  if (balanced) {
    return JSON.parse(balanced) as T;
  }

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(t.slice(start, end + 1)) as T;
  }
  return JSON.parse(t) as T;
}
