# tyranoscript-test-kit

[TyranoScript](https://tyrano.jp/)製ノベルゲーム作品向けの、E2Eテストヘルパー(Playwright)と
シナリオ静的検査ツール。複数のTyranoScript作品([arikoi](https://github.com/kosuke-fujisawa/arikoi)、
[quality-prism](https://github.com/kosuke-fujisawa/quality-prism))で重複していた
テスト基盤を切り出したもの。

## スコープ

このパッケージが持つのは「複数のTyranoScript作品で共通するテスト基盤」だけ。
シナリオ内容・キャラクター・ゲームルール・作品固有のE2Eテストケースは各作品側が持つ。

- ✅ 持つもの: glinkクリック・文字送り待機などの汎用E2Eヘルパー、`.ks`のラベル/ジャンプ/
  アセット参照を検査する静的解析ツール
- ❌ 持たないもの: 特定作品のシナリオ・テストケース・セレクタ・多言語ミラー構成など
  作品固有の検査ロジック(必要な場合は各作品側でこのパッケージの結果を土台に追加する)

## インストール

npmレジストリへは未発行。GitHubからgit依存として参照する。

```jsonc
// package.json
{
  "devDependencies": {
    "tyranoscript-test-kit": "github:kosuke-fujisawa/tyranoscript-test-kit#v0.2.0"
  }
}
```

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

### シナリオ静的検査(CLI)

```sh
npx tyrano-check-scenario --scenario-dir data/scenario --data-dir data --exclude tyrano.ks
```

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

## ライセンス

MIT
