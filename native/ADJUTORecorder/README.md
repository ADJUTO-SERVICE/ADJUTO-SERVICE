# ADJUTO Recorder — 自社iPhone記録アプリ（開発版）

既存ADJUTO MAPと組み合わせるiPhone専用アプリです。iOS 17以降、SwiftUI、Core Location、MapKitを使用し、外部SDKは使いません。配布記録・IndexedDBをアプリへ自動移行しません。

## 実装範囲

- 作業者名・現場名・記録名を指定し、開始・一時停止・再開・終了。
- Core Location標準測位とbackground locationモード。ロック・電話・他アプリへの切替ではアプリ側から停止しません。
- 各採用点でセッション別JSONをatomic保存。ロック後も保存できる保護クラスを指定。精度、異常値除外、停止区間の分離。
- 再起動時は前回記録を一時停止として復元。強制終了・電源断中の記録や自動復帰は保証しません。
- 終了・一時停止した軌跡をGPXで共有・ファイルに保存。ADJUTO MAP側で対象ルートを選択し、プレビュー後に追記します。別作業者との自動同期やリアルタイム監視は未実装です。
- 記録を消す操作は設けていません。読み込み失敗時も元ファイルを保持します。

## ビルド

MacのXcodeで `ADJUTORecorder.xcodeproj` を開き、ADJUTORecorderスキームを選択します。シミュレーターは署名なしでビルドできます。

```
swift test --package-path native/ADJUTORecorder
xcodebuild -project native/ADJUTORecorder/ADJUTORecorder.xcodeproj -scheme ADJUTORecorder -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

GitHubのPRでは標準のmacos-15環境で同じテストとビルドを実行します。公開リポジトリの標準GitHub-hosted runnerを使用し、大型・有料runnerや外部サービス契約は追加しません。ビルド対象はソースのみで、実際の配布記録は送信しません。

## iPhoneへ配布する前に必要なこと

このリポジトリには署名済みIPA・配布証明書はありません。シミュレータービルドの成功だけではiPhoneへインストールできません。

- Apple Developer Program登録と自社名義の署名・App Store Connect設定（TestFlight等で複数端末に配布する場合）。手続・契約・費用の承認は所有者が行います。
- Bundle ID `com.adjuto.recorder` は開発用候補です。登録時に所有者の利用可能なIDへ設定してください。
- アプリアイコン、サポート窓口、プライバシーポリシーとApp Store申告内容の確認。
- 実機で正確な位置情報を許可し、ロック状態30分、通常電話・LINE等の通話、他アプリ、圏外、低電力、権限取消、強制終了からの復元を検証。
- 電池消費・発熱・測位精度を現場で検証し、GPX取込とJSONバックアップの結果を照合。

位置情報は記録開始の操作後だけ取得します。終了・一時停止すると取得を止めます。When In Use許可とバックグラウンド測位表示を使用し、常時許可や通話履歴・マイク・連絡先への権限は要求しません。アプリはGPS記録を会社サーバーへ自動送信しません。MapKitの背景地図にはAppleの地図サービスを利用し、GPX共有先は利用者が選びます。

Windowsでソースを作成しています。実機でのロック中・通話中のGPSは未検証です。業務で使用する前に実機受入テストが必要です。

参考: [Apple: background location](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)、[Apple: background updates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates)、[GitHub: standard runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。
