# Pi connection / Pi連携

既存のPi認証を使い、漫画画像をローカルRPC経由で送信します。ChatGPTのブラウザ操作は不要です。Pi 1.1.0のRPC仕様に合わせています。Node.js 22以降と、ログイン済みのPiが必要です。

1. このフォルダで実行します。

~~~sh
node scripts/pi-bridge.mjs
~~~

2. 表示された Connection key を、拡張機能メニューの「Pi 接続」に貼り付けます。「接続・モデル一覧を更新」を押してローカル接続を許可し、Piから画像対応モデルを取得します。接続確認が成功すると「Pi接続OK（ブリッジ v2）」と表示され、その後にモデル一覧を取得します。
3. 使用するAIを「Pi（ローカル / Codex）」にします。
4. 画像対応モデルの一覧から選びます。空欄はPiの既定モデルです。一覧にはPiが返した画像入力対応モデルのみ表示されます。推論レベルはPiの既定、off、minimal、low、medium、high、xhigh、maxから選べます。モデルが対応しないレベルはPiがモデルの能力に合わせて調整します。
5. 漫画ページで「全自動」を開始します。確認用タブは開いたままにしてください。

サーバーは127.0.0.1:43129でのみ待ち受けます。認証情報はPi側に残ります。接続キーは拡張機能のローカル設定に保存されます。起動時にキーは再生成されます。固定する場合は PI_BRIDGE_TOKEN 環境変数に24文字以上のキーを設定してください。Piの実行パスは PI_BIN で指定できます。接続キーを公開しないでください。

「Pi接続OKですが、モデル一覧APIに未対応」またはHTTP 404が表示された場合、古いブリッジが43129番ポートを使っています。古い `node scripts/pi-bridge.mjs` プロセスを終了し、更新した拡張機能と同じ配布フォルダに含まれる `scripts/pi-bridge.mjs` を起動してください。起動のたびにConnection keyが変わるため、表示されたキーを貼り直します。

各画像につき保存なし・ツールなしのPiプロセスを作成します。スキル、拡張、MCP、プロジェクトの指示ファイルも読み込みません。翻訳メモと直前の翻訳文脈は既存の依頼文に含まれます。逐次表示、最終JSON検証、欠落IDの最大12領域での再依頼は既存処理を利用します。

停止すると通信とPi子プロセスを中断します。再開時は未確定の画像を再依頼します。上流で開始済みのリクエストの利用枠が返還される保証はありません。5分でタイムアウトします。接続確認はHTTP接続のみで、AI認証・モデルの画像対応を検証するものではありません。

Pi連携はローカルサーバーの常時起動が必要です。サービスの利用条件は、選択した接続方式に応じて確認してください。

## 無料枠について / Free tiers

Piは接続ツールであり、独自の無料推論枠は提供しません。接続先の無料枠または契約済み利用枠を利用します。Gemini APIは対象モデルにFree Tierがあり、APIキーをPi側に設定するとこの拡張機能からPi経由で利用できます。CodexはChatGPT Freeにも含まれますが、アカウントごとの利用可能範囲と上限が適用されます。APIの有料設定や別のモデルを選択すると料金が発生する場合があります。

Pi uses the selected provider's free tier, subscription allowance or paid API billing; Pi itself does not provide free inference. Gemini API offers a Free Tier for eligible models; configure its key in Pi to use it through this extension. Codex is included in ChatGPT Free subject to account availability and limits. Other models or billing settings may incur charges.

最新の条件 / Current terms: [Gemini API](https://ai.google.dev/gemini-api/docs/pricing) · [Codex](https://learn.chatgpt.com/docs/pricing)

## English setup

Run node scripts/pi-bridge.mjs with Node.js 22+, then paste its connection key into the extension's Pi connection settings and click Connect & refresh models. Select a vision model and a thinking level from the list, then select Pi as the AI and start automatic translation. Leave the review tab open. Thinking levels are passed to Pi and may be clamped to the selected model's capabilities.

The bridge binds only to 127.0.0.1:43129. Pi keeps its own provider credentials; the extension stores only the bridge key and optional model ID. Empty model uses Pi's default. Each image uses an ephemeral RPC process with tools, extensions, MCP, skills and context-file discovery disabled. Responses stream into provisional overlays and become final only after Pi reports agent_settled and the extension validates the translation JSON. Stop cancels the process; resume resends the unfinished image.
