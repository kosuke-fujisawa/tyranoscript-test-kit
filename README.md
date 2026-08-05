# tyranoscript-test-kit

[![CI](https://github.com/kosuke-fujisawa/tyranoscript-test-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kosuke-fujisawa/tyranoscript-test-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[TyranoScript](https://tyrano.jp/)製ノベルゲーム作品向けの、E2Eテストヘルパー(Playwright)と
シナリオ静的検査ツール。複数のTyranoScript作品([arikoi](https://github.com/kosuke-fujisawa/arikoi)、
[quality-prism](https://github.com/kosuke-fujisawa/quality-prism))で重複していた
テスト基盤を切り出したもの。

## これは何?

TyranoScriptでノベルゲームを作っていると、作品が違っても次のような作業が共通して発生する。

- Playwrightで「タイトル画面を開く → 選択肢を押す → 文字送りを進める」というE2Eテストを書く
- `.ks`シナリオの中で、存在しないラベルへジャンプしていないか・存在しない画像や音声を
  参照していないかをCIで検査する

このパッケージは、その「作品に依存しない共通部分」だけを切り出したもの。ゲーム本編の
シナリオやキャラクター、作品固有のテストケースは含まない。TyranoScript製ゲームの
リポジトリに`devDependencies`として追加し、ここが提供するヘルパー・CLIを土台に
各作品固有のテストを書く想定で使う。

## 前提条件

- Node.js 18以上
- [Playwright](https://playwright.dev/)(`@playwright/test`、`>=1.40.0`)を導入済みのプロジェクト
  (E2Eヘルパーを使う場合。peerDependencyとして定義)
- 検査対象のTyranoScriptプロジェクトが`data/scenario/`(`.ks`シナリオ)・`data/`(画像・音声等の
  アセット)という標準的なディレクトリ構成であること
- E2Eヘルパーは、TyranoScript標準の`.glink_button`クラスを持つリンク型選択肢を前提にしている

## クイックスタート

```sh
# 1. インストール(git依存としてdevDependenciesに追加される)
npm install -D github:kosuke-fujisawa/tyranoscript-test-kit#v0.2.0

# 2. シナリオの静的検査をまず一度実行してみる
npx tyrano-check-scenario --scenario-dir data/scenario --data-dir data
```

問題があれば`静的検査: FAIL`と該当のエラー一覧が表示される(終了コードも1になる)。
E2Eヘルパーの使い方は下記「使い方」を参照。

## スコープ

このパッケージが持つのは「複数のTyranoScript作品で共通するテスト基盤」だけ。
シナリオ内容・キャラクター・ゲームルール・作品固有のE2Eテストケースは各作品側が持つ。

- ✅ 持つもの: glinkクリック・文字送り待機などの汎用E2Eヘルパー、`.ks`のラベル/ジャンプ/
  アセット参照を検査する静的解析ツール
- ❌ 持たないもの: 特定作品のシナリオ・テストケース・セレクタ・多言語ミラー構成など
  作品固有の検査ロジック(必要な場合は各作品側でこのパッケージの結果を土台に追加する)

## インストール

npmレジストリへは未発行。GitHubからgit依存として参照する
(上記クイックスタートの`npm install -D`コマンドで十分だが、`package.json`を直接編集する
場合は以下のように書く)。

```jsonc
// package.json
{
  "devDependencies": {
    "tyranoscript-test-kit": "github:kosuke-fujisawa/tyranoscript-test-kit#v0.2.0"
  }
}
```

バージョンを上げる際は`#v0.2.0`の部分を対象タグに変更し、`npm install`し直す。

## 使い方

### E2Eヘルパー(Playwright)

```ts
import { openTitle, glink, clickGlink, advanceUntilVisible, waitForTextSettled } from "tyranoscript-test-kit";

test("start -> ending", async ({ page }) => {
  await openTitle(page, "Start"); // タイトル画面のSTARTボタン文言は作品ごとに渡す
  await clickGlink(page, "Start");
  await advanceUntilVisible(page, "共通の書き出し");
});
```

| 関数 | 役割 |
|---|---|
| `openTitle(page, buttonText)` | タイトル画面を開き、`buttonText`を持つglinkボタンが表示されるまで待つ(初回起動を考慮して長めに待機) |
| `glink(page, hasText)` | `hasText`を持つglinkボタン(選択肢リンク)のLocatorを返す |
| `clickGlink(page, hasText, maxAttempts?)` | glinkボタンをクリックする。アニメーション起因でクリックが無視される場合に自動リトライする |
| `advanceUntilVisible(page, text, maxClicks?)` | `text`が表示されるまでメッセージ領域をクリックして進める |
| `advanceUntil(page, target, maxClicks?, clickPoint?)` | 任意のLocatorが表示されるまでクリックして進める(`advanceUntilVisible`の汎用版) |
| `waitForTextSettled(page)` | 文字送りアニメーションの完了を待つ。セーブ処理の直前に必須 |

### シナリオ静的検査(CLI)

```sh
npx tyrano-check-scenario --scenario-dir data/scenario --data-dir data --exclude tyrano.ks
```

| オプション | 既定値 | 説明 |
|---|---|---|
| `--scenario-dir` | `data/scenario` | 検査対象の`.ks`シナリオを探すディレクトリ |
| `--data-dir` | `data` | 画像・音声などアセットを探す起点ディレクトリ |
| `--exclude` | `tyrano.ks` | 検査から除外するファイル名(カンマ区切りで複数指定可) |

`package.json`の`scripts`に登録する例:

```jsonc
{
  "scripts": {
    "check:scenario": "tyrano-check-scenario"
  }
}
```

### シナリオ静的検査(ライブラリとして呼び出し・独自チェックを追加する場合)

```js
import { checkScenario } from "tyranoscript-test-kit/check-scenario";

const { fileCount, errors } = checkScenario({
  scenarioDir: "./data/scenario",
  dataDir: "./data",
  excludeFiles: ["tyrano.ks"],
});
```

## 検査項目

1. `jump`/`call`/`glink`/`button`の`storage`参照先ファイルが存在するか
2. 同`target`のラベルが、参照先(`storage`指定時)/自ファイル(未指定時)に存在するか
3. `bg`/`image`/`chara_new`/`playbgm`/`playse`/`glink`/`button`の各画像・音声属性
   (`storage`/`graphic`/`enterimg`/`clickimg`)の参照先アセットが存在するか
   (タグに`folder=`属性があれば既定のフォルダを上書きする)
4. `#`/`#話者名`行の直後に本文が一切無いまま次のタグ・ラベルへ進んでいないか
5. 同一の選択肢グループ内で`[glink]`の`text=`が重複していないか
6. `chara_show`/`chara_hide`/`chara_mod`/`chara_face`が参照するキャラクターが
   `chara_new`で定義されているか(プロジェクト全体で横断的に解決する)
7. `[jump]`/`[return]`(`@jump`省略記法・無引用属性を含む)の直後にあり、かつ
   プロジェクト内のどこからも参照されないラベルの検出(未参照ラベル警告)。直前の
   行が静的な`storage=`/`target=`を持つ`[jump]`または`[return]`の場合のみ
   「フォールスルーで到達しない」とみなす保守的な判定(選択肢グループの後や
   `[s]`の後は対象外)。動的ジャンプ(`storage=`/`target=`が`"&式"`)は到達可否を
   静的に判定できないため、遷移元ファイル・(storageのみ静的な場合の)遷移先
   ファイル・(storageも動的な場合の)プロジェクト全体、のいずれかの単位で検査
   対象から除外する

対象外(意図的なスコープ外): 選択肢分岐・複雑な制御フローを網羅した完全な到達可能性解析
(項目7は「静的jump/returnの直後」という限定条件のみを対象とする)、未定義変数の検出、
未使用ラベル・未使用キャラクターの検出(ファイル間の実行順序に依存し誤検知率が高いため
見送り)、未定義タグ・マクロの検出(網羅的なタグ辞書が無いため見送り)。

これらのより踏み込んだ検査は、エディタ向けのTyranoScript Language Server
([tyranoscript-lsp](https://github.com/void2610/tyranoscript-lsp))がワークスペース索引を
前提に実装している。本パッケージはCIでそのまま実行できる軽量な検査に用途を絞っている。

## コントリビュート

```sh
git clone https://github.com/kosuke-fujisawa/tyranoscript-test-kit.git
cd tyranoscript-test-kit
npm test
```

開発方針(ゲーム非依存を保つ・汎用化しすぎない、等)は[AGENTS.md](./AGENTS.md)を参照。
PRを送るとCI(`npm test`)に加え、CodeRabbitとPR-Agentによる自動レビューが実行される。

## ライセンス

MIT
