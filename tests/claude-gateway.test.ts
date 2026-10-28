import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ルール：Claude の AI を使ったら、必ず使用量（1日の予算）を消費する。
// そのため、Claude SDK を呼ぶのは lib/claude.ts（meter が必須の createMessage）だけにし、
// AI を使う処理（エージェント・おすすめ）を呼ぶ API は必ず withAiBudget で包む。

const root = path.resolve(import.meta.dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? files(rel) : /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
const source = [...files("app"), ...files("lib"), ...files("components")];

describe("Claude を使ったら必ず使用量を消費する", () => {
  it("Claude SDK を実際に呼べる import は lib/claude.ts だけ（型だけの import は可）", () => {
    const offenders = source.filter((f) => {
      const code = readFileSync(path.join(root, f), "utf8");
      return /^import\s+(?!type\b)[^;]*from\s+["']@anthropic-ai\/sdk/m.test(code) && f !== path.join("lib", "claude.ts");
    });
    expect(offenders).toEqual([]);
  });

  it("AI を使う処理を呼ぶ API は、すべて withAiBudget で予算を通している", () => {
    const aiModules = /from\s+["']@\/lib\/(agent|ai-suggest|quote|claude)["']/;
    const routes = source.filter((f) => f.startsWith("app") && aiModules.test(readFileSync(path.join(root, f), "utf8")));
    expect(routes.length).toBeGreaterThan(0);
    for (const f of routes) {
      expect(readFileSync(path.join(root, f), "utf8"), f).toMatch(/withAiBudget\(/);
    }
  });
});
