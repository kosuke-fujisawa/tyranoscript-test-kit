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
  assert.ok(
    errors.some((e) => e.includes('[chara_show] name="ghost"') && e.includes("定義されていません")),
    "未定義キャラクターへの参照を検出できていない",
  );
  assert.ok(
    errors.some((e) => e.includes('graphic="does_not_exist.png"')),
    "glinkのgraphic参照アセット欠落を検出できていない",
  );
  assert.ok(
    errors.some((e) => e.includes('ラベル "*dead_end"') && e.includes("参照されていません")),
    "[jump]直後の未参照ラベルを検出できていない",
  );
});

test("動的ジャンプ(storage=\"&...\")を含むファイルは未参照ラベル検査をスキップする", () => {
  const root = join(HERE, "fixtures", "dynamic-jump", "data");
  const { errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });
  assert.deepEqual(
    errors.filter((e) => e.includes("参照されていません")),
    [],
    "動的ジャンプを含むファイルで未参照ラベル検査を誤って実行している",
  );
});
