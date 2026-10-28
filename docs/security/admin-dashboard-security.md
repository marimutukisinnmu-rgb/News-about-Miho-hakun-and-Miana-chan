# MHN 管理画面セキュリティ設計

## 状態
- 対象ブランチ: admin-security-hardening（web から分岐）
- 調査結果・要件・初期 UI をこのブランチに追加した。まだ本番公開や Auth ポリシー変更は行っていない。
- admin.html / admin.js には、管理者ロール確認と TOTP 登録・チャレンジ・AAL2 の画面側ゲートを追加した。これは UI の保護であり、管理 API のサーバー側認可の代替ではない。
- リカバリーコード、重要操作の再認証、通知、監査ログ、コメント管理 API は未実装。これらが完了し、テストに合格するまで本番公開しない。

## 調査結果（2026-10-28）
- Supabase プロジェクト MHN は稼働中。
- public.profiles に role（user / admin）があり、RLS が有効。
- authenticated の profiles 権限は SELECT と display_name の UPDATE のみ。ブラウザーから role を更新する権限は確認されなかった。
- public.has_aal2() は JWT の aal が aal2 である場合のみ true を返す。
- public.mhn_private_comments と public.mhn_comment_rate_limits は RLS 有効で、anon/authenticated の操作を拒否するポリシーが存在する。コメント管理にはサーバー側の管理経路が必要。
- mhn-comment-submit Edge Function は verify_jwt=false。公開投稿受付のためで、オリジン制限、JSON/サイズ検証、ハニーポット、レート制限を実装している。公開エンドポイントとして追加の負荷・レート制限テストが必要。
- MFA/RLS 関連 migration があり、has_aal2 が存在する。ただし、確認したポリシー一覧では has_aal2() を参照するポリシーは見つからなかった。管理用 API 側で AAL2 を強制する必要がある。
- Supabase Security Advisor は Leaked Password Protection Disabled を警告している。Auth 設定で有効化を検討する。
- nav.js は profiles.role === admin によってリンクを表示するが、これは表示上の導線にすぎず、アクセス制御ではない。

## 必須要件

### 認証・MFA
1. Supabase Auth の TOTP authenticator を使用する。
2. 管理画面と管理用 Edge Function は aal2 を必須とする。フロントエンドのチェックだけに依存しない。
3. TOTP の登録、challenge、verify、factor 管理を実装し、認証未完了・未検証 factor・不正コードでは fail closed。
4. リカバリーコードは十分なランダム性を持つ一回限りのコードとして生成し、平文を永続保存せず、ハッシュだけを保存する。表示は生成時の一度だけ。
5. MFA の解除・再登録、権限変更、コメント削除など重要操作は直近の再認証を要求する。
6. 復旧経路を MFA より弱くしない。解除は本人確認と通知を伴う。

### 認可・データ
1. 管理者は信頼できるサーバー側データで判定する。user_metadata、ブラウザー状態、URL の秘匿を信頼しない。
2. 管理用 Edge Function は毎回 Bearer token を auth.getUser() で検証し、DB 上のロールと aal2 を確認する。
3. service_role は Edge Function の環境変数内だけに置き、フロントエンド、リポジトリ、ログに含めない。
4. mhn_private_comments はブラウザーから直接読ませず、管理者認可済み Edge Function を経由させる。
5. RLS は有効のまま維持。ポリシーは最小権限とし、既存の公開投稿経路を壊さない。
6. 管理 API の応答に不要な個人情報を含めない。コメントの連絡先は必要時だけ限定表示する。

### 監査・不正対策
1. ログイン失敗、MFA失敗、MFA要素の変更、リカバリー利用、重要操作を記録する。
2. ログに秘密・OTP・回復コード・生の認証トークンを含めない。
3. 失敗回数制限、レート制限、情報漏えいを抑えたエラー応答を行う。
4. 重要操作の監査ログはサーバー側で生成し、通常ユーザーから改ざん・削除できないようにする。
5. 不審ログイン・重要操作通知は、通知先の検証と重複通知抑制を含める。

## 実装フェーズ
1. 完了（初期調査）：Auth/RLS/Edge Function/ポリシーの現状を調査し、Security Advisor を確認した。
2. 初期実装（未本番検証）：管理画面に TOTP 登録・challenge・verify と AAL2 表示ゲートを追加した。
3. 未完了：管理用 API の共通認可処理（有効セッション、DB ロール、AAL2、レート制限）を実装する。
4. 未完了：一回限りのリカバリーコード、重要操作の再認証、通知、監査ログを実装する。
5. 未完了：コメント管理 API と画面を実装する。
6. 未完了：非管理者、aal1、期限切れセッション、OTP再利用、無効なリカバリーコード、直接 API 呼び出し、XSS/CSRF、レート制限を検証する。
7. 未完了：Security Advisor を再実行し、設定変更と本番公開は検証後に行う。

## 公開前の受け入れ条件
- 未ログイン、一般ユーザー、aal1 セッションから管理 API を呼ぶと拒否される。
- 管理者でも MFA 未完了では管理データを取得・変更できない。
- クライアントから profiles.role を変更できない。
- コメントテーブルを anon/authenticated が直接読めない。
- リカバリーコードは一度しか使えず、DB に平文が残らない。
- 重要操作には直近の再認証が必要で、監査ログがサーバー側で作られる。
- OTP、リカバリーコード、アクセストークン、連絡先などの秘密がログに出ない。
- ニュース表示、公開コメント送信、収益機能の回帰テストに合格する。
