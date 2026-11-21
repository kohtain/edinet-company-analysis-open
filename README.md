# EDINET企業分析 — 公開ソース（移行中）

EDINETの有価証券報告書・企業情報を、出典と検証状態を保ちながら分析するための実装です。

**移行ステータス：構築中。** このリポジトリは、既存のPrivate版 `edinet-company-analysis` と `japan-ir-navi` を統合する新しい公開ソースです。既存サイトの本番版を置き換えたものではありません。

## 現在の対象
- 金融庁EDINETの公式コードリストを基礎とした企業一覧の生成、母集団比較
- EDINET API v2の有報提出情報の取得・訂正追跡ロジック
- 最新有報の選択・データ出典の検証ロジック
- R2上の不変リリースを読み込むための純粋なデータ処理

**Git管理対象に含めないもの：** ダウンロードしたEDINET/JPXの全社データ、原本ZIP、個人の分析ノート、秘密鍵、Cloudflareの認証情報、Private版のGit履歴・運用記録。

## 安全な運用
このリポジトリには、本番R2/D1・Cloudflareへのデプロイ、日次収集を実行するActions設定を含めません。CIは合成データによるローカルのテストだけを実行します。公開ソースの利用可能性と、実際のWebサービスを一般公開することは別の判断です。

## 実行環境
Node.js 22以上。テストは `npm test`、EDINET公式ZIPをローカルで解析する場合は `npm run build:directory -- --zip=/path/to/Edinetcode.zip --snapshot=auto` を使用します。変換したデータはGit管理対象外の `.edinet-runtime/` に保存します。ZIP展開には `unzip` コマンドが必要です。

## データ出典
企業識別は金融庁の[EDINETコードリスト](https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip)、有価証券報告書の提出情報はEDINET API v2を利用します。EDINETの「上場」区分は東証のプライム・スタンダード・グロースを表すものではありません。JPXの33業種とEDINETの提出者業種も区別します。

## ライセンス
この公開リポジトリのソースコードに対するライセンスは未決定です。Public設定は第三者への包括的な再利用許諾を意味しません。第三者の資料やデータには、それぞれの利用条件が適用されます。
