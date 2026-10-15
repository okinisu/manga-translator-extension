# Pi connection / Pi連携

既存のPi認証を使い、漫画画像をローカルRPC経由で送信します。ChatGPTのブラウザ操作は不要です。Pi 1.1.0で動作を確認しています。

## 1. Piをインストールする

拡張機能を使うChromeと同じPCに、[Node.js](https://nodejs.org/en/download) 22.19以降（npmを含む）をインストールします。ターミナルで次を実行してください。Piのインストールはどのフォルダからでも実行できます。

~~~sh
node --version
npm --version
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version
~~~

別のインストール方法やPATHの設定は[Pi公式の導入手順](https://github.com/earendil-works/pi#getting-started)を参照してください。インストール後も `pi` が見つからない場合はターミナルを開き直し、Piのインストール先がPATHに含まれているか確認します。

## 2. PiにAIサービスを接続する

ターミナルで `pi` を起動し、**Piの入力欄で** `/login` を実行します。ターミナルのシェルに `/login` を入力するのではありません。

~~~sh
pi
~~~

Pi内で利用する接続先（Codexの契約・ログインを使う場合はOpenAI/Codex、Gemini APIを使う場合はGoogle/Gemini）を選び、案内に従ってログインまたはAPIキーの設定を完了します。認証の流れは接続先により異なります。ログインに使うアカウントやAPIキーはPiが管理します。

**AIサービスへのログイン認証と、次の手順で発行するConnection keyは別物です。** 拡張機能に貼るのは、AIサービスのログインコードやAPIキーではなく、ローカルブリッジのConnection keyです。

## 3. 拡張機能のフォルダでブリッジを起動・接続キーを発行する

Piを起動した画面とは別のターミナルを開きます。**拡張機能を読み込んだフォルダのルート（`manifest.json` と `scripts` フォルダがある場所）へ `cd` してから**起動してください。`scripts` フォルダ自体に移動するのではありません。

初めてソースを取得する場合の例（GitとGit LFSが必要）：

~~~sh
git clone https://github.com/okinisu/manga-translator-extension.git "$HOME/manga-translator-extension"
cd "$HOME/manga-translator-extension"
git lfs pull
node scripts/pi-bridge.mjs
~~~

取得・展開済みの場合は、そのフォルダに置き換えます。例では展開先を `~/Downloads/manga-translator` としています。

~~~sh
cd "$HOME/Downloads/manga-translator"
node scripts/pi-bridge.mjs
~~~

成功すると、ターミナルに `Pi bridge: http://127.0.0.1:43129` と `Connection key: ...` が表示されます。この起動時に接続キーが自動生成されるため、別途コードを発行する操作はありません。翻訳中はこのターミナルを開いたままにします。停止する場合は、このコマンドを実行したターミナルでCtrl+Cを押します。

## 4. 拡張機能に接続する

1. 表示された `Connection key:` の後ろの値を、拡張機能メニューの「Pi 接続」→「接続キー」に貼り付けます。「接続・モデル一覧を更新」を押してローカル接続を許可し、Piから画像対応モデルを取得します。接続確認が成功すると「Pi接続OK（ブリッジ v2）」と表示され、その後にモデル一覧を取得します。
2. 使用するAIを「Pi（ローカル / Codex）」にします。
3. 画像対応モデルの一覧から選びます。空欄はPiの既定モデルです。一覧にはPiが返した画像入力対応モデルのみ表示されます。推論レベルはPiの既定、off、minimal、low、medium、high、xhigh、maxから選べます。モデルが対応しないレベルはPiがモデルの能力に合わせて調整します。
4. 漫画ページで「全自動」を開始します。確認用タブは開いたままにしてください。

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

1. On the same PC as Chrome, install Node.js 22.19+ with npm. From any terminal folder, run `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, then check `pi --version`. See the [official Pi installation guide](https://github.com/earendil-works/pi#getting-started) for alternatives.
2. Run `pi`, then enter `/login` **inside Pi**, not in your shell. Select your provider and complete its subscription login or API-key setup. This provider authentication is separate from the bridge connection key.
3. Open another terminal and change to the **extension root folder containing `manifest.json` and `scripts/`**, using the actual path where you cloned or extracted this extension. For example:

~~~sh
cd "$HOME/manga-translator-extension"
node scripts/pi-bridge.mjs
~~~

For a fresh source checkout, first run `git clone https://github.com/okinisu/manga-translator-extension.git "$HOME/manga-translator-extension"`, change into that directory and run `git lfs pull`. Git LFS is required. Do not run the bridge from an old copy or a folder in Trash.

4. Startup automatically prints the local bridge address and `Connection key: ...`. Paste the value after that label into the extension's Pi connection settings, then click Connect & refresh models. Do not paste the provider's login code or API key. Keep the bridge terminal running; Ctrl+C in that terminal stops it. Each restart generates a new key, which must be pasted again.
5. Select Pi as the AI, choose a vision model and a thinking level, and start automatic translation. Leave the review tab open. Thinking levels are passed to Pi and may be clamped to the selected model's capabilities.

The bridge binds only to 127.0.0.1:43129. Pi keeps its own provider credentials; the extension stores only the bridge key and optional model ID. Empty model uses Pi's default. Each image uses an ephemeral RPC process with tools, extensions, MCP, skills and context-file discovery disabled. Responses stream into provisional overlays and become final only after Pi reports agent_settled and the extension validates the translation JSON. Stop cancels the process; resume resends the unfinished image.
