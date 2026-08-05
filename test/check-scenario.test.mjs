import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScenario } from "../src/check-scenario.js";

const HERE = dirname(fileURLToPath(import.meta.url));

test("正常なシナリオではエラーが0件になる", () => {
  const root = join(HERE, "fixtures", "ok", "data");
  const { fileCount, errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });
  assert.equal(fileCount, 1);
  assert.deepEqual(errors, []);
});

test("壊れたシナリオで既知の問題をすべて検出する", () => {
  const root = join(HERE, "fixtures", "broken", "data");
  const { errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });

  assert.ok(
    errors.some((e) => e.includes('ラベル "*missing_label"')),
    "存在しないラベルへの参照を検出できていない",
  );
  assert.ok(
    errors.some((e) => e.includes('storage="missing.ks"')),
    "存在しないファイルへの参照を検出できていない",
  );
  assert.ok(
    errors.some((e) => e.includes("本文がありません")),
    "話者行直後の本文欠落を検出できていない",
  );
  assert.ok(
    errors.some((e) => e.includes('text="Start"') && e.includes("重複")),
    "選択肢の重複テキストを検出できていない",
  );
});
