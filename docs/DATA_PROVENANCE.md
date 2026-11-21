# データの出典と区分

- **EDINETコードリスト**: https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip — 企業名、英語名、EDINETコード、証券コード、提出者業種、EDINETの上場区分
- **EDINET API v2**: https://api.edinet-fsa.go.jp/api/v2 — 提出書類一覧・有価証券報告書。取得に必要なキーは本番Secretsにのみ保存し、CIやクライアントには渡さない
- **JPX**: 東証プライム／スタンダード／グロース区分やJPXの33業種等。現段階の公開ソースにはJPX由来の全社マスター・CSVを収録しない

EDINETの上場区分とJPXの市場区分は非同一、EDINET提出者業種とJPX 33業種も非同一。コードによる照合は会社属性の同一性・正確性・上場継続を自動保証しない。データ利用には金融庁その他の公式利用条件を適用する。

このリポジトリに収録するテスト会社名・コードは説明用fixtureであり、実際の全社マスターではない。
