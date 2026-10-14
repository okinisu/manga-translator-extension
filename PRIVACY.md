# Privacy Policy / プライバシーポリシー

Updated / 更新日: 2026-10-14
Maintainer / 管理者: okinisu
Contact / 問い合わせ: https://github.com/okinisu/manga-translator-extension/issues
Issues are public. Do not include account credentials, private conversations or sensitive personal data in reports.
Issuesは公開されます。認証情報・非公開の会話・機微な個人情報を投稿しないでください。

## 日本語

### 処理と送信

この拡張機能は、NAVER WEBTOONの本文画像と文字の位置を処理して、選択したAIで翻訳し、訳文を元のページに重ねて表示します。文字領域の検出・画像の切り抜き・画像の結合は端末内で行います。

翻訳時には、番号付きの切り抜き画像、翻訳依頼文（保存したカスタム指示を含む）、選択言語、領域ID、直前の訳文の一部（旧形式の返答では原文も、文脈用）を、ログイン済みのChatGPTまたはGeminiへ送ります。全自動開始ボタンを押すと、その話の画像が準備され次第、自動送信が始まります。確認画面での手動操作では送信内容を確認できます。

画像取得ではNAVERの画像配信元へ通信します。AIページは選択したサービスへ通信します。各サービスはIPアドレス等の通常の通信情報を受け取る場合があります。送信した画像・会話の保持、学習への利用、削除は、そのサービスの規約・設定・プライバシーポリシーに従います。この拡張から会話を削除していません。

本拡張には開発者のサーバーへの送信、利用状況解析、広告SDKはありません。ログインはAIサービス自身のページで行います。拡張はパスワード、支払い情報、APIキー、Cookieを読み取り・保存する処理を実装していません。AIページ上では入力欄・添付状態・応答・処理エラーを読み取り、入力・添付・送信を操作します。

### 端末内の保存

- Chromeローカルストレージ: 設定、カスタム指示、UI言語、話のURLをキーとする原文・訳文・表示位置、再利用するAIタブID。
- セッションストレージ: 進行中の話のURL・画像URL、送信用画像の参照、領域情報、処理状態、AIタブID。新規の番号付き送信画像本体はIndexedDBに保存し、画面への受け渡し時にのみ一時的にBase64化します。旧方式の範囲選択や旧版から再開した処理には、画像がセッションに含まれる場合があります。
- IndexedDB: 元画像、切り抜き画像、検出結果、送信キュー、部分的に取り込んだ翻訳。
- 話の検出キャッシュ: 最大3話・256MB・7日。期限・容量の整理はキャッシュの利用・保存時に実行され、7日経過時に即時削除するタイマーはありません。
- 翻訳表示は検出キャッシュと別に保存され、自動の7日削除対象ではありません。生成中の仮表示は漫画ページのメモリ内だけに保持し、確定するまで保存しません。
- AI応答時間の集計はAIページ内で保持し、ページの再読み込みでリセットします。

通常、話の翻訳完了・破棄・次の話の準備時に作業用キューが削除されます。保存済みの検出キャッシュと漫画ページの翻訳表示は別に残ります。確認画面のキャッシュ削除ボタンは保存済み画像・検出キャッシュを削除します。漫画ページの削除操作はその話の翻訳表示を消します。すべての拡張内保存データを消すには拡張をアンインストールしてください。AIサービス側に保存された会話や、手動で保存した画像・診断ファイルは別に削除してください。

### 任意の診断とクリップボード

診断は初期状態で無効です。有効にすると処理時間、GPU・ランタイム情報、エラーを記録し、ユーザーの操作でJSONを端末に保存できます。画像・セリフを記録する項目は設けていません。エラーのURLは伏せる処理をしていますが、外部に共有する前にファイルを確認してください。診断は開発者に自動送信しません。

画像・依頼文のコピー操作で、選択内容をクリップボードへ書き込みます。普段のクリップボード内容を収集する処理はありません。

## English

This extension translates comic dialogue on NAVER WEBTOON. Detection, cropping and collage generation run locally. For translation, it sends numbered image crops, a translation prompt (including saved custom instructions), chosen languages, region IDs and limited preceding translations (plus source text for legacy replies) to the ChatGPT or Gemini page you are signed into. Starting automatic translation authorizes sending batches as they become ready. Manual review lets you inspect prepared content.

Source images are downloaded from NAVER's image host. AI pages communicate with their respective services. Those services may receive normal network information such as your IP address. Their policies and account settings govern uploaded content, conversation retention, training and deletion. Removing extension data does not delete AI conversations.

There is no developer-operated data receiver, analytics or advertising SDK. The extension does not implement password, payment, API-key or cookie collection. It reads and operates the AI page's composer, attachments, responses and errors to perform translation.

Local storage holds settings, custom instructions, episode URLs, source/translated dialogue, overlay coordinates and reusable AI tab IDs. Session storage holds active episode/image URLs, outbound image references, regions and run state. New numbered outbound images remain in IndexedDB and are temporarily encoded as Base64 only for transfer to a page. Legacy range selections or jobs resumed from older versions may retain inline session images. IndexedDB holds source/crop images, detection results, queues and partially received translations. Detection cache is limited to three episodes, 256 MB and seven days; expiration is enforced during cache access/writes rather than by an immediate seven-day deletion timer. Saved translation overlays have no automatic seven-day expiry. Provisional overlays stay in comic-page memory and are not persisted before confirmation. AI response-time statistics stay in AI-page memory and reset on page reload.

Working queues are normally cleared on completion, discard or new episode preparation. Detection cache and saved overlays remain separate. Use the review page to clear the image/detection cache and the comic page to delete its translation overlay. Uninstall the extension to remove all extension-managed storage. Separately delete AI conversations and manually downloaded files if desired.

Optional diagnostics are off by default. When enabled, timing, GPU/runtime details and errors can be exported locally. No image/dialogue fields are recorded; URLs in error messages are sanitized. Review files before sharing. Diagnostics are not sent automatically. Copy buttons write the selected image or prompt to your clipboard; the extension does not collect unrelated clipboard contents.

## Third-party policies / 外部サービス

- OpenAI: https://openai.com/policies/privacy-policy/
- Google / Gemini: https://policies.google.com/privacy


Custom translation instructions are stored locally in Chrome extension storage and included in prompts sent to your selected AI provider. They apply across titles on this device. Clear the field to disable future use; this does not remove prompts already sent to an AI provider.

## Pi local connection

When selected, numbered images and translation prompts pass through http://127.0.0.1:43129 to your installed Pi and its configured AI provider. The bridge key, optional model ID, cached model list and thinking-level preference are stored locally by the extension. Provider credentials remain managed by Pi. The bridge does not persist images or responses, and requests ephemeral Pi sessions.
