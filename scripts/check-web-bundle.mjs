#!/usr/bin/env node
// Checks the built web page against the frozen production policy.
//
// This does not replace the static tests; it inspects what Vite actually emits:
// no remote asset, no inline script and a size budget for the seal-account code.
// Run after `pnpm --filter @loanshark/web build`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../apps/web/dist", import.meta.url));
const BUDGETS = {
  javascriptBytes: 600 * 1024,
  cssBytes: 20 * 1024,
  htmlBytes: 4 * 1024,
};

const files = readdirSync(join(DIST, "assets"))
  .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
  .map((name) => ({
    name,
    path: join(DIST, "assets", name),
    bytes: statSync(join(DIST, "assets", name)).size,
  }));
const htmlPath = join(DIST, "index.html");
const html = readFileSync(htmlPath, "utf8");

const sum = (extension) =>
  files
    .filter((file) => file.name.endsWith(extension))
    .reduce((total, file) => total + file.bytes, 0);

const js = sum(".js");
const css = sum(".css");
const htmlBytes = statSync(htmlPath).size;
const problems = [];

if (js > BUDGETS.javascriptBytes) {
  problems.push(`JavaScript is ${js} bytes, over the ${BUDGETS.javascriptBytes}-byte budget`);
}
if (css > BUDGETS.cssBytes) {
  problems.push(`CSS is ${css} bytes, over the ${BUDGETS.cssBytes}-byte budget`);
}
if (htmlBytes > BUDGETS.htmlBytes) {
  problems.push(`index.html is ${htmlBytes} bytes, over the ${BUDGETS.htmlBytes}-byte budget`);
}
if (/<script[^>]+src="https?:/i.test(html)) problems.push("the built page loads a remote script");
if (/<link[^>]+href="https?:/i.test(html))
  problems.push("the built page loads a remote stylesheet");
if (/\son[a-z]+="/i.test(html)) problems.push("the built page has an inline event handler");
if (/unsafe-inline|unsafe-eval/.test(html)) problems.push("the production CSP was relaxed");

for (const file of files) {
  console.log(`${file.name}: ${file.bytes} bytes`);
}
console.log(`index.html: ${htmlBytes} bytes`);
console.log(
  `budgets: js ${BUDGETS.javascriptBytes}, css ${BUDGETS.cssBytes}, html ${BUDGETS.htmlBytes}`,
);

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exitCode = 1;
} else {
  console.log("bundle check passed");
}
