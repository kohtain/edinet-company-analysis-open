# 財務分析の純粋計算モジュール

旧Privateの実データや個人ノートを含めず、EDINETのXBRL/CSVに関する再利用可能な検証ロジックを移植しました。

- `lib/facts.mjs`: EDINETのTSV数値解析
- `lib/dashboard.mjs`: 期間・会計基準・単位・連結範囲を考慮した財務指標
- `lib/research.mjs`: 企業検索、出典つき財務表示
- `lib/comparison.mjs`: 複数企業比較、期間・会計基準の違いを明示
- `lib/research-presentation.mjs`: 記述情報の検証・表示
- `lib/edinet-index-reconcile.mjs`: 重複したEDINET書類の厳格な照合

初期テストは人工fixtureのみ。既存Private内の実データスナップショットを参照する試験は含めていません。後続で匿名化fixtureと独立検証を追加し、Web画面を移す前に機能カバレッジを高めます。
