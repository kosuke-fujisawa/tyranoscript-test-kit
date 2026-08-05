# AGENTS.md — tyranoscript-test-kit 開発原則

複数のTyranoScript作品([arikoi](https://github.com/kosuke-fujisawa/arikoi)、
[quality-prism](https://github.com/kosuke-fujisawa/quality-prism))で重複していた
テスト基盤(E2Eヘルパー・シナリオ静的検査)を切り出した共有パッケージ。

経緯: 各プロジェクトのAGENTS.md/ADR(arikoiのADR 0006)は「開発基盤と接続原則を揃え、
作品コードは共有しない」方針を採るが、E2Eヘルパーとシナリオ静的検査は完全に
ゲーム非依存で自己完結していたため、コピー&手動同期ではなく本パッケージへ切り出した。

## 原則

1. **ゲーム非依存を保つ。** シナリオ内容・キャラクター・ゲームルール・特定作品の
   セレクタやテストケースはここに置かない。各作品のリポジトリ側で保有する
2. **汎用化しすぎない。** 「複数作品で実際に重複している処理」だけを持つ。
   将来使うかもしれない機能を先回りして追加しない
3. **ビルド工程を持たない。** 消費側(各TyranoScript作品)がビルド工程を持たない
   構成に合わせ、素のJavaScript(ESM)で配布する。TypeScriptのコンパイル工程を導入しない
4. **破壊的変更には注意する。** 複数リポジトリが依存するため、関数シグネチャの変更は
   影響範囲(arikoi・quality-prism等)を確認してから行う。git依存(タグ参照)のため、
   各消費側は更新タイミングを自分で選べる

## 配布方法

npmレジストリへは未発行。`package.json`で`github:kosuke-fujisawa/tyranoscript-test-kit#vX.Y.Z`
のようにタグ参照するgit依存として利用する。

## テスト

```sh
npm test
```

`test/fixtures/{ok,broken}/`に検査対象のサンプルシナリオを置き、`checkScenario()`が
期待通りの結果を返すことを検証する。
