// シナリオ静的検査。ティラノスクリプトを起動せずに、シナリオディレクトリ配下の
// *.ks を横断して以下を検査する。
//
//   1. jump/call/glink/button の storage 参照先ファイルが存在するか
//   2. 同 target のラベルが、参照先(storage指定時)/自ファイル(未指定時)に存在するか
//   3. bg/image/chara_new/playbgm/playse の storage 参照先アセットが存在するか
//      (`&式` によるタグ属性は動的評価のためスキップする)
//   4. "#"/"#話者名" 行の直後に本文が一切無いまま次のタグ・ラベルへ進んでいないか
//   5. 同一の選択肢グループ内で [glink] の text= が重複していないか
//
// 対象外(意図的なスコープ外):
//   - 到達不能な分岐の検出(制御フロー解析が必要なため)
//   - 未定義変数の検出(f/sfは動的に生成されるため静的な網羅は困難)
//
// 各作品固有の追加検査(例: 多言語ミラー構成の整合性チェックなど)は、この関数の
// 結果を土台に呼び出し側で追加すること。このパッケージは複数のTyranoScript作品で
// 共通する最小限のチェックのみを持つ(汎用化しすぎない)。

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** @typedef {{ scenarioDir: string, dataDir: string, excludeFiles?: string[], assetTagBase?: Record<string, string | null> }} CheckScenarioOptions */

const DEFAULT_ASSET_TAG_BASE = {
  bg: "bgimage",
  image: "image",
  chara_new: "fgimage",
  chara_config: null, // storageを取らない
  playbgm: "bgm",
  playse: "sound",
};

function findKsFiles(dir) {
  let results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // .DS_Store, ._*(AppleDouble)
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findKsFiles(full));
    } else if (entry.name.endsWith(".ks")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * @param {CheckScenarioOptions} options
 * @returns {{ fileCount: number, errors: string[] }}
 */
export function checkScenario(options) {
  const { scenarioDir, dataDir, excludeFiles = [], assetTagBase = DEFAULT_ASSET_TAG_BASE } = options;
  const EXCLUDE_FILES = new Set(excludeFiles);

  function toScenarioKey(absPath) {
    return relative(scenarioDir, absPath).split(sep).join("/");
  }

  const files = findKsFiles(scenarioDir);
  const fileSet = new Set(files.map(toScenarioKey));
  const labelsByFile = new Map();
  const contentByFile = new Map();

  for (const f of files) {
    const key = toScenarioKey(f);
    const content = readFileSync(f, "utf8");
    contentByFile.set(key, content);
    const labels = new Set();
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*\*([A-Za-z0-9_]+)/);
      if (m) labels.add(m[1]);
    }
    labelsByFile.set(key, labels);
  }

  const errors = [];

  // --- 1・2: jump/call/glink/buttonの参照整合性 ---
  for (const [key, content] of contentByFile) {
    if (EXCLUDE_FILES.has(key)) continue;
    content.split(/\r?\n/).forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trim();
      if (trimmed.startsWith(";")) return;
      if (!/(@jump|@call|\[jump|\[call|\[glink|\[button)\b/.test(line)) return;

      const isDynamicStorage = /storage="&/.test(line);
      const storageMatch = line.match(/storage="([^"&][^"]*\.ks)"/);
      const targetMatch = line.match(/target="?\*([A-Za-z0-9_]+)"?/);

      let targetFileKey = key;
      if (storageMatch) {
        targetFileKey = storageMatch[1];
        if (!fileSet.has(targetFileKey)) {
          errors.push(`${key}:${lineNo}: storage="${targetFileKey}" が見つかりません`);
          return;
        }
      } else if (isDynamicStorage) {
        return;
      }

      if (targetMatch) {
        const label = targetMatch[1];
        const labelSet = labelsByFile.get(targetFileKey);
        if (labelSet && !labelSet.has(label)) {
          errors.push(`${key}:${lineNo}: ラベル "*${label}" が ${targetFileKey} に見つかりません`);
        }
      }
    });
  }

  // --- 3: アセット参照の整合性(静的storageのみ) ---
  for (const [key, content] of contentByFile) {
    if (EXCLUDE_FILES.has(key)) continue;
    content.split(/\r?\n/).forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trim();
      if (trimmed.startsWith(";")) return;

      for (const [tag, baseDir] of Object.entries(assetTagBase)) {
        if (!baseDir) continue;
        const tagRe = new RegExp(`\\[${tag}\\b[^\\]]*\\]`, "g");
        const tagMatches = line.match(tagRe);
        if (!tagMatches) continue;

        for (const tagText of tagMatches) {
          if (/storage="&/.test(tagText)) continue;
          if (/folder="image"/.test(tagText)) continue; // folder明示指定は既定のマッピングと異なるためスキップ
          const storageMatch = tagText.match(/storage="([^"]+)"/);
          if (!storageMatch) continue;
          const assetPath = join(dataDir, baseDir, storageMatch[1]);
          if (!existsSync(assetPath)) {
            errors.push(
              `${key}:${lineNo}: [${tag}] storage="${storageMatch[1]}" (${baseDir}/) が見つかりません`,
            );
          }
        }
      }
    });
  }

  // --- 4: "#"/"#話者名" 行の直後に本文が無いまま次へ進んでいないかの検出 ---
  for (const [key, content] of contentByFile) {
    if (EXCLUDE_FILES.has(key)) continue;
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      if (!/^#[^\s]*\s*$/.test(line.trim())) return;

      let j = idx + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        if (nextTrimmed === "" || nextTrimmed.startsWith(";")) {
          j++;
          continue;
        }
        break;
      }

      const nextTrimmed = j < lines.length ? lines[j].trim() : "";
      const hasNoBody = j >= lines.length || /^[#*\[@]/.test(nextTrimmed);
      if (hasNoBody) {
        errors.push(`${key}:${idx + 1}: "${line.trim()}" の直後に本文がありません(書き忘れの可能性)`);
      }
    });
  }

  // --- 5: 同一選択肢グループ内での [glink] text= 重複検出 ---
  for (const [key, content] of contentByFile) {
    if (EXCLUDE_FILES.has(key)) continue;
    const lines = content.split(/\r?\n/);
    let group = [];

    const flushGroup = () => {
      const firstSeenAt = new Map();
      for (const item of group) {
        if (firstSeenAt.has(item.text)) {
          errors.push(
            `${key}:${item.lineNo}: [glink] text="${item.text}" が同じ選択肢内で重複しています(${firstSeenAt.get(item.text)}行目と重複)`,
          );
        } else {
          firstSeenAt.set(item.text, item.lineNo);
        }
      }
      group = [];
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith(";")) return;

      const m = line.match(/\[glink\b[^\]]*\btext="([^"]+)"/);
      if (m) {
        group.push({ text: m[1], lineNo: idx + 1 });
      } else {
        flushGroup();
      }
    });
    flushGroup();
  }

  return { fileCount: files.length, errors };
}

export { DEFAULT_ASSET_TAG_BASE };
