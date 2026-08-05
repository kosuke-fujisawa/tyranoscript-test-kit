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

test("@jump形式・無引用属性のtarget参照も未参照ラベル検査で認識する", () => {
  const root = join(HERE, "fixtures", "at-jump-unquoted", "data");
  const { errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });
  const unreferencedErrors = errors.filter((e) => e.includes("参照されていません"));
  assert.ok(
    !unreferencedErrors.some((e) => e.includes('"*used"')),
    "@jump target=*used(無引用)による参照を認識できておらず、参照済みラベルを誤検出している",
  );
  assert.ok(
    unreferencedErrors.some((e) => e.includes('"*truly_orphan"')),
    "@jump直後の未参照ラベルを検出できていない",
  );
});

test("静的storage+動的targetの遷移先ファイルは未参照ラベル検査から除外する", () => {
  const root = join(HERE, "fixtures", "dynamic-target-cross-file", "data");
  const { errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });
  assert.deepEqual(
    errors.filter((e) => e.includes("参照されていません")),
    [],
    "動的targetの遷移先として特定できるファイルの未参照ラベル検査を誤って実行している",
  );
});

test("動的storageで遷移先ファイルすら特定できない場合はプロジェクト全体で未参照ラベル検査をスキップする", () => {
  const root = join(HERE, "fixtures", "dynamic-storage-project-wide", "data");
  const { errors } = checkScenario({
    scenarioDir: join(root, "scenario"),
    dataDir: root,
  });
  assert.deepEqual(
    errors.filter((e) => e.includes("参照されていません")),
    [],
    "遷移先ファイルを特定できない動的storageがあるのに、他ファイルの未参照ラベル検査を実行している",
  );
});
