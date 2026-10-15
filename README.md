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

1. [Releases](https://github.com/okinisu/manga-translator-extension/releases/latest)から専用ZIP（例：manga-translator-1.0.0.zip）をダウンロードして展開します。
2. Chromeで chrome://extensions を開き、デベロッパーモードを有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」で展開したフォルダーを選択します。
4. 漫画ページとAIページを開いていた場合は再読み込みします。

更新するときは、Chromeで現在読み込んでいる同じフォルダーへ新しいZIPの内容を上書きし、拡張機能の再読み込みボタンを押します。漫画ページとAIページも再読み込みしてください。別フォルダーから追加すると別の拡張機能として扱われる場合があるため、設定を引き継ぐ場合は読み込み先を揃えてください。

詳しい確認項目は[テスト手順](TESTING.md)にまとめています。

ソースから使う場合はGit LFSが必要です。

~~~sh
git clone https://github.com/okinisu/manga-translator-extension.git
cd manga-translator-extension
git lfs pull
~~~

リポジトリのルートを拡張機能として読み込めます。GitHubの自動生成ソースZIPでは、モデルがLFSポインターになっている場合があります。Releasesの専用ZIPには実際のモデルを含めます。

## 使い方

1. ブラウザ連携ではChatGPTまたはGeminiにログインします。Pi連携では[設定手順](PI.md)に従ってPiとブリッジを起動します。
2. NAVER WEBTOONの話ページで拡張機能メニューを開きます。
3. 翻訳元・翻訳先・AI・バッチのまとめ方を選びます。
4. 「裏で全自動翻訳 / 再開」を押します。画像準備と文字検出を進め、最初の翻訳画像が完成した時点でAIへ依頼します。
5. 生成中も完成したIDの訳文を仮表示し、最終返答で確定します。欠落IDのみ最大12領域の画像で再依頼します。

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
- 診断：検出工程の時間・並列状況、AI小窓での平均応答時間を確認できます。

AI返答は原文を省いたIDと訳文のみを要求します。旧形式の原文付きJSONも取り込めます。原文は新しい返答では保存されません。

## 開発・検証

Node.js、Python 3、Git LFSを使用します。

~~~sh
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

Pi未導入の場合は、Node.js 22.19以降を用意し、ターミナルの任意のフォルダで次を実行します。

~~~sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
~~~

Piが起動したら、Piの入力欄で `/login` を実行し、利用するAIサービスの認証を完了します。その後、別のターミナルで **この拡張機能のルート**（`manifest.json` と `scripts/` があるフォルダ）へ移動します。ソースを `~/manga-translator-extension` に取得した場合の例：

~~~sh
cd "$HOME/manga-translator-extension"
node scripts/pi-bridge.mjs
~~~

展開先が違う場合は `cd` のパスを置き換えてください。起動時に表示される `Connection key:` の値が、拡張機能の「Pi 接続」→「接続キー」に貼るキーです。AIサービスのログインコードとは別です。翻訳中はブリッジを起動したターミナルを開いたままにしてください。

[Piの導入・ログイン・接続キー発行の詳しい手順](PI.md)
