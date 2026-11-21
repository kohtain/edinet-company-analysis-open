# 公開移行の検証記録 — 2026-11-21

## 独立したPublicリポジトリの状態

- リポジトリ: https://github.com/kohtain/edinet-company-analysis-open
- 新しく作成した空リポジトリを初回コミットから利用。既存の二つのPrivateリポジトリからGit履歴、fork、git bundle、タグ、データバックアップを継承していない
- 移植した範囲: EDINET会社識別、提出書類一覧・最新有報選択、財務・企業比較の純粋計算、公式IRリンクの形式検査、R2の不変リリース読込契約
- Publicリポジトリに元の全社マスター、EDINET原本、第三者画像、個人分析ノート、CloudflareSecrets、GitHubの本番Secretsは収録していない
- 現時点ではWebアプリ全体のデプロイ可能な移植版は作成していない。本番Cloudflare Access、D1/R2、旧Private側の定期実行・更新ジョブは変更していない

## CI

- 核となる計算ロジックと出典照合の合成fixtureテスト **38件合格、0件失敗**
- 公開対象の全トラッキングファイルに対する禁則ファイル形式・秘密情報パターン・高権限ワークフローの検査に合格
- 新PublicのCIはSecretsを参照せず、`contents: read`。標準`ubuntu-latest`での`npm test`のみ、デプロイ・データ更新なし
- 実行: https://github.com/kohtain/edinet-company-analysis-open/actions/runs/44912889721

## EDINET公式ZIPによる独立受入

- 公開CIとは別の単発・読み取り専用ワークフロー（定期実行なし）: https://github.com/kohtain/edinet-company-analysis-open/actions/runs/44912958597
- コードリスト内の基準日: **2026-11-21**
- 条件に一致した内国上場・4文字証券コードの企業: **3,806社**
- この実行で取得した公式ZIP SHA-256: `0b8034c0513aeab60f6fec4f960267e84e270cce36c3edda77d3c38ee5c53a07`
- 今回のJSON配信用投影データ SHA-256: `644e8a5cba4d7472b0134e994fca96a6c32dc0e5ed2224fc6a0cff57d164427c`
- 原本ZIP・投影データ・認証情報をGitHubコミット/Artifactsに含めず、Runnerの作業領域のみで処理

## データ照合で残る不確実性

旧Private側の別ワークフローで同日付EDINETコードリストを取得し、旧3,686社すべての証券コードが一致、EDINET側のみ120社と記録: https://github.com/kohtain/edinet-company-analysis/actions/runs/44907776620

**重要:** 上記の旧Private実行で報告された公式ZIP SHA-256は `4876ef3fbdb6e3ea01e3073544e0c8ad9db10a759a8b9e65b02b427f48bf7eb4` で、今回のPublic実行とは異なる。同じ基準日・同じ企業件数でもZIPのバイナリが同じとは限らず、原因（内容更新またはZIP再生成）は未確定。旧Private側の投影データSHA-256は残っていないため、両実行の企業名・属性までバイト一致したとは断定しない。以後は展開CSVと正規化投影データのハッシュを別々に照合する。

EDINETの「上場」や提出者業種は、JPXの東証3市場・33業種と同じ分類ではない。追加120社の取り扱いと市場補完は別途受入判断が必要。

## 次の合格ゲート

1. EDINET中心の企業一覧をR2へ検証付きでアップロードし、Cloudflare Access経由の読取APIをデプロイ・遮断試験
2. Web画面、企業照会、バックフィル、比較CSVの全社マスター依存を分離。既存の財務分析・ノート機能を損なわない回帰テスト
3. 新Publicの本番Writerは、旧Privateジョブ停止・残存処理終了・チェックポイントとバケット整合性の照合後に起動
4. 旧Japan IR Naviの独自資料リンクを選択的に移し、既存サービスからの切替を確認。旧リポジトリは削除せずPrivateでアーカイブ
5. 必要な第三者ライセンス、出典表示、ソースコードの再利用ライセンスは別途確定する
