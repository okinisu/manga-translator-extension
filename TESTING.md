# テスト手順 / Testing guide

## インストール・更新

[最新リリース](https://github.com/okinisu/manga-translator-extension/releases/latest)の専用ZIPを使用します。モデルを同梱しているため約287 MB（10進表記）あります。GitHubの自動生成するSource code ZIPとは異なります。

初回はZIPを展開し、chrome://extensionsでデベロッパーモードを有効にしてフォルダーを読み込みます。使用するAIのページでログインしてから試してください。

更新時は既存の読み込み先を確認し、同じフォルダーへ新しいZIPの内容を上書きして拡張機能を再読み込みします。漫画ページとAIページも再読み込みしてください。拡張機能を削除して再追加すると、保存した設定やデータが消えます。

## 確認してほしい項目

1. 拡張機能のバージョン、Chromeのバージョン、OS、GPUを記録する。
2. NAVER WEBTOONの話ページで「この話を翻訳する準備」を実行し、主要な吹き出しが切り抜かれるか確認する。
3. 使用するAI・翻訳元・翻訳先を選び、全自動翻訳を実行する。画像が添付されて送信されるか確認する。
4. 生成中に訳文が順次仮表示され、最終返答で確定するか確認する。
5. IDの欠落が起きた場合、欠落分だけの小さい画像で再依頼されるか確認する。欠落はテストのために作る必要はありません。
6. 処理を停止・再開して、送信済みの画像が重複送信されないか確認する。
7. 次の話でもAIタブを再利用できるか、準備済みの画像・検出キャッシュを利用できるか確認する。
8. 翻訳メモを入力し、メニューを開き直して保存されているか、新しく準備した話の依頼文に入るか確認する。
9. 必要に応じてCPUのみ、GPUのFP32・FP16を比較する。GPUが利用できない場合のCPU切り替えも確認する。

主な吹き出しを優先しています。効果音や吹き出し外の文の検出、AIの読み取り・翻訳結果は常に正しいとは限りません。

## 問題が起きたら

[不具合報告](https://github.com/okinisu/manga-translator-extension/issues/new/choose)から、再現手順・期待した動作・実際の動作・エラー全文・動作環境を送ってください。

速度の報告には、検出診断の工程別時間、GPU情報、AI応答時間が役立ちます。診断JSONを添付する場合は中身を確認してから共有してください。アカウント情報、Cookie、認証トークン、非公開チャット、漫画1話分の画像は添付しないでください。

## English

Download the dedicated ZIP from the [latest release](https://github.com/okinisu/manga-translator-extension/releases/latest), extract it and load the folder in chrome://extensions with Developer mode enabled. The package is about 287 MB including model weights. Do not use GitHub's automatic Source code ZIP.

For updates, replace files in the same folder currently loaded by Chrome, reload the extension and reload both comic/AI pages. Removing the extension first deletes extension-managed settings and data.

Check image preparation, major speech-bubble detection, attachment/send, streaming previews, final confirmation, missing-ID retries when they occur, pause/resume without duplicate sends, AI-tab reuse, episode cache, saved custom instructions, and CPU/GPU modes supported by your device.

Report version, Chrome/OS/GPU, chosen AI, relevant settings, reproduction steps and the exact error in [Issues](https://github.com/okinisu/manga-translator-extension/issues/new/choose). Timing diagnostics can help with performance reports. Review diagnostic files before sharing. Do not upload credentials, cookies, tokens, private conversations or complete comic episodes.
