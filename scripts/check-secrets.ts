import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const localSecrets = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      /^(FLOW_(?:PRODUCTION_)?CLIENT_ID|FLOW_(?:PRODUCTION_)?CLIENT_SECRET|OIDC_CLIENT_SECRET|NEXTAUTH_SECRET|DATABASE_URL)$/.test(
        key,
      ) &&
      value &&
      value.length >= 8,
  )
  .map(([, value]) => value!);
try {
  const production = JSON.parse(await readFile('.local/production-config.json','utf8'));
  for (const [key,value] of Object.entries(production)) {
    if (/SECRET|CLIENT_ID|DATABASE_URL/.test(key) && typeof value === 'string' && value.length >= 8) localSecrets.push(value);
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk_live)_[A-Za-z0-9_]{20,}\b/,
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/,
  /(?:FLOW_CLIENT_SECRET|OIDC_CLIENT_SECRET|NEXTAUTH_SECRET|DATABASE_URL)\s*=\s*["']?[A-Za-z0-9+/]{16,}/,
];
const problems: string[] = [];
try {
  for (const f of await readdir(".next/static", {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!f.isFile()) continue;
    const path = f.parentPath + "/" + f.name;
    const source = await readFile(path, "utf8");
    if (localSecrets.some((secret) => source.includes(secret)))
      problems.push(
        "browser bundle: configured secret found (value suppressed)",
      );
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
for (const f of files) {
  if (/^\.env(?:\.|$)/.test(f) && f !== ".env.example")
    problems.push(f + ": env file tracked");
  const text = await readFile(f, "utf8");
  if (patterns.some((p) => p.test(text)))
    problems.push(f + ": possible secret");
  if (localSecrets.some((secret) => text.includes(secret)))
    problems.push(f + ": configured secret found (value suppressed)");
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `Heuristic and exact configured-secret scans passed for ${files.length} tracked/staged files. This is not a guarantee.`,
);
