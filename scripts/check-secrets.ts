import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk_live)_[A-Za-z0-9_]{20,}\b/,
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/,
  /(?:FLOW_CLIENT_SECRET|OIDC_CLIENT_SECRET|NEXTAUTH_SECRET|DATABASE_URL)\s*=\s*["']?[A-Za-z0-9+/]{16,}/,
];
const problems: string[] = [];
for (const f of files) {
  if (/^\.env(?:\.|$)/.test(f) && f !== ".env.example")
    problems.push(f + ": env file tracked");
  const text = await readFile(f, "utf8");
  if (patterns.some((p) => p.test(text)))
    problems.push(f + ": possible secret");
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `Basic secret scan passed for ${files.length} tracked/staged files. This is a heuristic scan, not a guarantee.`,
);
