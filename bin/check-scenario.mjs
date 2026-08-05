#!/usr/bin/env node
// 使い方: tyrano-check-scenario [--scenario-dir data/scenario] [--data-dir data] [--exclude tyrano.ks,config.ks]
//
// 呼び出し元のプロジェクトルート(cwd)からの相対パスでシナリオディレクトリを検査する。

import { checkScenario } from "../src/check-scenario.js";
import { resolve } from "node:path";

function parseArgs(argv) {
  const opts = { scenarioDir: "data/scenario", dataDir: "data", exclude: "tyrano.ks" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario-dir") opts.scenarioDir = argv[++i];
    else if (arg === "--data-dir") opts.dataDir = argv[++i];
    else if (arg === "--exclude") opts.exclude = argv[++i];
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const scenarioDir = resolve(process.cwd(), opts.scenarioDir);
const dataDir = resolve(process.cwd(), opts.dataDir);
const excludeFiles = opts.exclude
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const { fileCount, errors } = checkScenario({ scenarioDir, dataDir, excludeFiles });

console.log(`シナリオ静的検査: ${fileCount}ファイルを検査`);

if (errors.length > 0) {
  console.log(`\nエラー ${errors.length}件:`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log("\n静的検査: FAIL");
  process.exit(1);
}

console.log("\n静的検査: PASS");
