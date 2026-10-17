# Contributing / 開発への参加

不具合の報告はIssues、変更案はPull Requestで受け付けます。独自コードのライセンスは未選定です。第三者コンポーネントのライセンスはTHIRD_PARTY_NOTICES.mdを参照してください。

## Local setup

~~~sh
git clone https://github.com/okinisu/manga-translator-extension.git
cd manga-translator-extension
git lfs pull
python3 scripts/test_extension.py
~~~

Node.js 22とPython 3、Git LFSを使用します。npm依存関係のインストールは不要です。3個のTFLiteモデルはGit LFSで管理しています。

## Scope and checks

- 実装変更に応じたテストを実行してください。テストは模擬DOM・メッセージ・ランタイム環境を使い、AIへ実際に送信しません。
- AIサイトのDOM操作を変更する場合は、使用したブラウザ、AI、手動で確認した内容をPRに記載してください。
- モデル変更は精度・検出数・処理時間とモデルハッシュを確認し、対応するモデル情報も更新してください。
- アカウント、認証情報、ブラウザプロファイル、漫画画像、生成したZIPはコミットしないでください。
- パッケージは python3 scripts/package_extension.py --output dist で作成できます。このコマンドは公開・アップロードを行いません。

GitHub Actionsはpush・Pull Request時にテストとJavaScript構文を検証し、テスト結果JSONを成果物として保存します。ブラウザGPUでの推論やAIサイトの実動作はCIの検証対象外です。

## English

Use Issues for bug reports and pull requests for changes. Original-code licensing is not yet selected; third-party licenses remain applicable.

Install Node.js 22, Python 3 and Git LFS, fetch the three TFLite model files with git lfs pull, then run python3 scripts/test_extension.py. No npm installation is required.

Describe relevant validation in your PR. AI DOM changes need browser/provider details and manual verification notes. Model changes need detection/accuracy/timing comparisons and updated hash metadata. Do not commit credentials, profiles, comic images or generated ZIP files.

CI runs simulated tests and syntax checks; it does not send requests to AI services or verify real GPU inference. The package script builds a local ZIP and never publishes it.
