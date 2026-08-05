// シナリオ静的検査。ティラノスクリプトを起動せずに、シナリオディレクトリ配下の
// *.ks を横断して以下を検査する。
//
//   1. jump/call/glink/button の storage 参照先ファイルが存在するか
//   2. 同 target のラベルが、参照先(storage指定時)/自ファイル(未指定時)に存在するか
//   3. bg/image/chara_new/playbgm/playse/glink/button の各画像・音声属性の
//      参照先アセットが存在するか(`&式` によるタグ属性は動的評価のためスキップする)
//   4. "#"/"#話者名" 行の直後に本文が一切無いまま次のタグ・ラベルへ進んでいないか
//   5. 同一の選択肢グループ内で [glink] の text= が重複していないか
//   6. chara_show/chara_hide/chara_mod/chara_face が参照するキャラクターが
//      chara_newで定義されているか(プロジェクト全体で横断的にキャラクターを解決する。
//      TyranoScriptのchara_*タグはファイルスコープではなくランタイム全体で共有される
//      状態を操作するため、ラベル参照のようにファイル単位では解決しない)
//   7. [jump]/[return]の直後にあり、かつプロジェクト内のどこからも参照されない
//      ラベルの検出(未参照ラベル警告)。直前の行が静的なstorage/targetを持つ
//      [jump]または[return]の場合のみ「フォールスルーで到達しない」とみなす
//      保守的な判定(誤検知を避けるため、選択肢グループの後や[s]の後は対象外)。
//      storage="&式"/target="&式"による動的ジャンプを含むファイルは、到達可否を
//      静的に判定できないため検査対象から除外する
//
// 対象外(意図的なスコープ外):
//   - 完全な到達可能性解析(選択肢分岐・複雑な制御フローを網羅した到達不能検出。
//     [iscript]やマクロによる動的な制御フローがあり誤検知率が高いため見送り。
//     項目7は「静的jump/returnの直後」という限定条件のみを対象とする)
//   - 未定義変数の検出(f/sfは動的に生成されるため静的な網羅は困難)
//   - 未使用ラベル・未使用キャラクターの検出(ファイル間の実行順序に依存するため、
//     誤検知率が高いと判断し見送った。必要になれば別途追加する)
//   - 未定義タグ・マクロの検出(全タグを網羅した辞書が無いと誤検知するため見送った)
//
// これらのうち後者2つは、エディタ向けのTyranoScript Language Server
// (https://github.com/void2610/tyranoscript-lsp) がワークスペース全体の索引を
// 前提により踏み込んだ形で実装している。本パッケージはCIでそのまま実行できる
// 軽量な検査に用途を絞り、参考にしつつ独立して実装している。
//
// 各作品固有の追加検査(例: 多言語ミラー構成の整合性チェックなど)は、この関数の
// 結果を土台に呼び出し側で追加すること。このパッケージは複数のTyranoScript作品で
// 共通する最小限のチェックのみを持つ(汎用化しすぎない)。

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * @typedef {{ tag: string, attr: string, folder: string }} AssetCheck
 * @typedef {{
 *   scenarioDir: string,
 *   dataDir: string,
 *   excludeFiles?: string[],
 *   assetChecks?: AssetCheck[],
 *   characterTags?: string[],
 * }} CheckScenarioOptions
 */

const DEFAULT_ASSET_CHECKS = [
  { tag: "bg", attr: "storage", folder: "bgimage" },
  { tag: "image", attr: "storage", folder: "image" },
  { tag: "chara_new", attr: "storage", folder: "fgimage" },
  { tag: "playbgm", attr: "storage", folder: "bgm" },
  { tag: "playse", attr: "storage", folder: "sound" },
  { tag: "glink", attr: "graphic", folder: "image" },
  { tag: "glink", attr: "enterimg", folder: "image" },
  { tag: "button", attr: "graphic", folder: "image" },
  { tag: "button", attr: "enterimg", folder: "image" },
  { tag: "button", attr: "clickimg", folder: "image" },
];

// name=を参照だけして定義はしないタグ(chara_newが定義側)
const DEFAULT_CHARACTER_REFERENCE_TAGS = ["chara_show", "chara_hide", "chara_mod", "chara_face"];

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

function extractTagAttr(line, tag, attr) {
  const tagRe = new RegExp(`\\[${tag}\\b[^\\]]*\\]`, "g");
  const tagMatches = line.match(tagRe);
  if (!tagMatches) return [];
  const results = [];
  for (const tagText of tagMatches) {
    const attrMatch = tagText.match(new RegExp(`\\b${attr}="([^"]*)"`));
    if (!attrMatch) continue;
    results.push({ tagText, value: attrMatch[1] });
  }
  return results;
}

/**
 * @param {CheckScenarioOptions} options
 * @returns {{ fileCount: number, errors: string[] }}
 */
export function checkScenario(options) {
  const {
    scenarioDir,
    dataDir,
    excludeFiles = [],
    assetChecks = DEFAULT_ASSET_CHECKS,
    characterTags = DEFAULT_CHARACTER_REFERENCE_TAGS,
  } = options;
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

  // --- 3: アセット参照の整合性(静的な値のみ。folder=属性があれば既定を上書きする) ---
  for (const [key, content] of contentByFile) {
    if (EXCLUDE_FILES.has(key)) continue;
    content.split(/\r?\n/).forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trim();
      if (trimmed.startsWith(";")) return;

      for (const { tag, attr, folder } of assetChecks) {
        for (const { tagText, value } of extractTagAttr(line, tag, attr)) {
          if (value.startsWith("&")) continue; // 動的式はスキップ
          const folderMatch = tagText.match(/\bfolder="([^"]*)"/);
          const resolvedFolder = folderMatch ? folderMatch[1] : folder;
          const assetPath = join(dataDir, resolvedFolder, value);
          if (!existsSync(assetPath)) {
            errors.push(
              `${key}:${lineNo}: [${tag}] ${attr}="${value}" (${resolvedFolder}/) が見つかりません`,
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

  // --- 6: 未定義キャラクター参照の検出(プロジェクト全体でchara_newを解決) ---
  {
    const definedCharacters = new Set();
    for (const [key, content] of contentByFile) {
      if (EXCLUDE_FILES.has(key)) continue;
      for (const line of content.split(/\r?\n/)) {
        if (line.trim().startsWith(";")) continue;
        for (const { value } of extractTagAttr(line, "chara_new", "name")) {
          if (!value.startsWith("&")) definedCharacters.add(value);
        }
      }
    }

    for (const [key, content] of contentByFile) {
      if (EXCLUDE_FILES.has(key)) continue;
      content.split(/\r?\n/).forEach((line, idx) => {
        const lineNo = idx + 1;
        if (line.trim().startsWith(";")) return;
        for (const tag of characterTags) {
          for (const { value } of extractTagAttr(line, tag, "name")) {
            if (value.startsWith("&")) continue;
            if (!definedCharacters.has(value)) {
              errors.push(
                `${key}:${lineNo}: [${tag}] name="${value}" は [chara_new] で定義されていません`,
              );
            }
          }
        }
      });
    }
  }

  // --- 7: [jump]/[return]直後の未参照ラベル検出(動的ジャンプを含むファイルはスキップ) ---
  {
    const jumpLikeRe = /\[(?:jump|call|glink|button)\b[^\]]*\]/g;
    const referenced = new Set(); // "file::label"
    const hasDynamicJump = new Map(); // file -> boolean

    for (const [key, content] of contentByFile) {
      let dynamic = false;
      for (const line of content.split(/\r?\n/)) {
        if (line.trim().startsWith(";")) continue;
        const tags = line.match(jumpLikeRe);
        if (!tags) continue;
        for (const tagText of tags) {
          const storageMatch = tagText.match(/\bstorage="([^"]*)"/);
          const targetMatch = tagText.match(/\btarget="([^"]*)"/);
          if (
            (storageMatch && storageMatch[1].startsWith("&")) ||
            (targetMatch && targetMatch[1].startsWith("&"))
          ) {
            dynamic = true;
            continue;
          }
          const targetFileKey =
            storageMatch && !storageMatch[1].startsWith("&") ? storageMatch[1] : key;
          if (targetMatch && targetMatch[1].startsWith("*")) {
            referenced.add(`${targetFileKey}::${targetMatch[1].slice(1)}`);
          }
        }
      }
      hasDynamicJump.set(key, dynamic);
    }

    for (const [key, content] of contentByFile) {
      if (EXCLUDE_FILES.has(key)) continue;
      if (hasDynamicJump.get(key)) continue;

      const lines = content.split(/\r?\n/);
      let cutByJump = false;
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith(";")) return;

        const labelMatch = trimmed.match(/^\*([A-Za-z0-9_]+)/);
        if (labelMatch) {
          const label = labelMatch[1];
          if (cutByJump && !referenced.has(`${key}::${label}`)) {
            errors.push(
              `${key}:${idx + 1}: ラベル "*${label}" は [jump]/[return] の直後にありますが、プロジェクト内のどこからも参照されていません(到達不能の可能性)`,
            );
          }
          cutByJump = false;
          return;
        }

        cutByJump = /^\[(?:jump|return)\b[^\]]*\]$/.test(trimmed);
      });
    }
  }

  return { fileCount: files.length, errors };
}

export { DEFAULT_ASSET_CHECKS, DEFAULT_CHARACTER_REFERENCE_TAGS };
