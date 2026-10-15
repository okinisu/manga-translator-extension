# 漫画翻訳 / Manga Translator 1.0

[English](README.en.md) · [ダウンロード](https://github.com/okinisu/manga-translator-extension/releases/latest) · [テスト手順](TESTING.md) · [不具合報告](https://github.com/okinisu/manga-translator-extension/issues/new/choose)

NAVER WEBTOONの文字領域を端末内で検出し、番号付きの切り抜き画像をChatGPT・Gemini・ローカルのPi経由で翻訳して、漫画上に訳文を重ねるChrome拡張機能です。モデルは文章の位置を検出するもので、文字起こしと翻訳は選択したAIが担当します。

## 利用上の注意

**本拡張機能は、利用者自身の責任で使用してください。** 各AIサービス・配信サイトの利用規約とコンテンツの権利を確認したうえで利用してください。翻訳の正確性、自動操作の継続動作、アカウントの安全性は保証しません。

## 無料枠と利用料金

有料サブスクリプションなしで試せる接続先もあります。

| 接続先 | 無料で利用できる範囲 | この拡張機能での利用方法 |
| --- | --- | --- |
| Gemini API | 対象モデルにFree Tierがあります。モデル・プロジェクトごとの上限が適用されます。 | Gemini APIキーをPi側に設定し、拡張機能でPiと画像対応Geminiモデルを選択します。APIキーの直接入力画面はありません。 |
| Pi経由のCodexなど | Pi自体には独自の推論利用枠はありません。接続サービスの無料枠や契約済み利用枠を使います。CodexはChatGPT Freeにも含まれますが、アカウントの利用可能範囲・上限が適用されます。 | ログイン済みのPiとローカルブリッジを起動します。[Pi設定手順](PI.md)を参照してください。 |

Piで選べるモデルがすべて無料という意味ではありません。APIの有料設定や契約プランによって料金が発生する場合があります。無料枠の対象・回数・地域などは変更されるため、[Gemini APIの料金](https://ai.google.dev/gemini-api/docs/pricing)、[Gemini APIの課金説明](https://ai.google.dev/gemini-api/docs/billing)、[Codexのプラン・利用枠](https://learn.chatgpt.com/docs/pricing)と各アカウントの利用状況を確認してください。

## インストール

### 必要な環境・配布版の違い

- デスクトップ版Chromeと、モデルファイルを含む拡張機能一式が必要です。GPUは必須ではなく、CPUのみでも動作します。
- 既存のv1.0.0リリースZIPはChatGPT・Geminiのブラウザ連携用です。Pi連携を使う場合は、下記のmainのソース版を取得してください。どちらも拡張機能のバージョン表示は現時点では1.0.0です。
- 通常の拡張機能の利用にNode.jsやPythonは不要です。Pi連携には同じPC上のNode.js 22.19以降・Pi・起動中のブリッジが必要です。

### リリースZIPから使う（ブラウザ連携）

1. [Releases](https://github.com/okinisu/manga-translator-extension/releases/latest)から専用ZIP（例：manga-translator-1.0.0.zip）をダウンロードして展開します。
2. Chromeで chrome://extensions を開き、デベロッパーモードを有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」で展開したフォルダーを選択します。
4. 漫画ページとAIページを開いていた場合は再読み込みします。

更新するときは、Chromeで現在読み込んでいる同じフォルダーへ新しいZIPの内容を上書きし、拡張機能の再読み込みボタンを押します。漫画ページとAIページも再読み込みしてください。別フォルダーから追加すると別の拡張機能として扱われる場合があるため、設定を引き継ぐ場合は読み込み先を揃えてください。

詳しい確認項目は[テスト手順](TESTING.md)にまとめています。

### mainのソースから使う（Pi連携を含む）

Gitと[Git LFS](https://git-lfs.com/)をインストールしてから、ターミナルで次を実行します。以下のシェルコマンド例はLinux/macOSのbash・zsh向けです。

~~~sh
git lfs install
git clone https://github.com/okinisu/manga-translator-extension.git "$HOME/Downloads/manga-translator-extension"
cd "$HOME/Downloads/manga-translator-extension"
git lfs pull
~~~

Chromeの `chrome://extensions` でデベロッパーモードを有効にし、`manifest.json` のある `~/Downloads/manga-translator-extension` を「パッケージ化されていない拡張機能を読み込む」で選択します。`popup.html` を直接開いても拡張機能としては動作しません。GitHubの自動生成ソースZIPでは、モデルがLFSポインターになっている場合があります。Releasesの専用ZIPには実際のモデルを含めます。

WindowsのPowerShellでは `"$HOME/Downloads/manga-translator-extension"` を `"$HOME\Downloads\manga-translator-extension"` に読み替え、実際の取得先に合わせてください。

ソース版の更新は、取得済みのリポジトリのルートで次を実行します。ローカルで変更している場合は、先にその内容を保存・整理してください。

~~~sh
git pull --ff-only
git lfs pull
~~~

その後、Chromeで拡張機能と漫画・AIページを再読み込みします。Piを使っている場合は、古いブリッジを終了し、更新したフォルダから再起動してください。Connection keyが再生成されるため、拡張機能へ貼り直します。

## 使い方

1. ブラウザ連携ではChatGPTまたはGeminiにログインします。Pi連携では[設定手順](PI.md)に従ってPiとブリッジを起動します。
2. NAVER WEBTOONの話ページで拡張機能メニューを開きます。
3. 翻訳元・翻訳先・AI・バッチのまとめ方を選びます。
4. 「裏で全自動翻訳 / 再開」を押します。画像準備と文字検出を進め、最初の翻訳画像が完成した時点でAIへ依頼します。
5. 生成途中の返答を取得できる場合、完成したIDの訳文を仮表示し、最終返答で確定します。欠落IDのみ最大12領域の画像で再依頼します。再依頼はIDごとに最大3回で、それでも欠落する場合は反映済みの訳文を保持して停止します。

手動では「この話を翻訳する準備」から切り抜き画像・依頼文を作成できます。AIの返答JSONを確認画面へ貼り付ける方法にも対応します。生成中の仮表示は保存せず、生成完了後の確定訳を保存します。停止中の仮表示は漫画ページの再読み込みで消えます。

## 主な設定

- UI：日本語・英語。LANGUAGEから切り替えます。
- 翻訳元・翻訳先：言語に合わせた読み取り・翻訳指示を生成します。
- バッチ：精度優先・バランス（標準）・枚数削減。
- 翻訳メモ・カスタム指示：最大4000文字、自動保存。この端末の全作品に共通で、新しく話を準備した時点の内容を全バッチと再依頼へ引き継ぎます。空欄で無効です。メモは選択したAIへの依頼文に含まれます。翻訳履歴からの自動学習は行いません。
- ChatGPT：一時チャット（標準）または通常チャット。
- Pi：接続キー、画像対応モデル一覧の取得・選択、推論レベル（Piの既定設定／off〜max）。対応レベルはモデルによって異なります。
- 検出：GPU＋CPU併用（標準）またはCPUのみ。GPUが利用できない場合はCPUへ切り替えます。
- GPU精度：部分FP16またはFP32。GPU選択はブラウザが決めます。
- Graph Capture：自動・無効・有効（試験用）。自動ではAMDの部分FP16だけで有効になります。起動検証に失敗すると無効で再試行します。FP32では無効です。
- 診断：検出工程の時間・並列状況を確認できます。ブラウザ連携ではAI小窓で平均応答時間も確認できます。Piの応答時間はこの小窓の集計対象外です。

AI返答は原文を省いたIDと訳文のみを要求します。旧形式の原文付きJSONも取り込めます。原文は新しい返答では保存されません。

## 開発・検証

Node.js、Python 3、Git LFSを使用します。コマンドはリポジトリのルートで実行します。

~~~sh
git lfs pull
python3 scripts/test_extension.py
python3 scripts/package_extension.py --output dist
~~~

31テストスイートとJavaScript構文チェックを含みます。ブラウザ上のAIサイトの全動作やモデル精度を自動テストだけで保証するものではありません。ChatGPT/Geminiの画面変更や利用上限により自動操作が停止する場合があります。

## データとライセンス

モデルの仕様は[MODEL.md](MODEL.md)、保存と送信の内容は[PRIVACY.md](PRIVACY.md)、第三者コンポーネントのライセンスは[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。

独自コードのライセンスは未選定です。モデル・ランタイムのライセンスとは別です。ChatGPT、Gemini、NAVER、Chromeの公式製品ではなく、各サービスの利用条件やコンテンツの権利は別途適用されます。

この1.0.0を開発履歴の起点として公開テストしています。不具合は[Issues](https://github.com/okinisu/manga-translator-extension/issues/new/choose)へ報告してください。開発への参加方法は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

### Pi / Codex local connection

Pi連携は現在mainのソース版に含まれます。既存の1.0.0リリースZIPには含まれないため、上記のソースからのインストール手順を使用してください。

Pi未導入の場合は、Node.js 22.19以降（npmを含む）を用意し、ターミナルの任意のフォルダで次を実行します。[Pi公式の導入手順](https://github.com/earendil-works/pi#getting-started)も参照してください。

~~~sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
~~~

Piが起動したら、Piの入力欄で `/login` を実行し、利用するAIサービスの認証を完了します。その後、別のターミナルで **この拡張機能のルート**（`manifest.json` と `scripts/` があるフォルダ）へ移動します。ソースを `~/Downloads/manga-translator-extension` に取得した場合の例：

~~~sh
cd "$HOME/Downloads/manga-translator-extension"
node scripts/pi-bridge.mjs
~~~

展開先が違う場合は `cd` のパスを置き換えてください。起動時に表示される `Connection key:` の値が、拡張機能の「Pi 接続」→「接続キー」に貼るキーです。AIサービスのログインコードとは別です。翻訳中はブリッジを起動したターミナルを開いたままにしてください。

[Piの導入・ログイン・接続キー発行の詳しい手順](PI.md)
