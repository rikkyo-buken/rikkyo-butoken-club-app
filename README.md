# 舞研アプリ（立教大学舞踏研究会 運営アプリ）

予定・お金・大会・備品・部員をまとめて扱う、スマホ向けのPWA。

- 画面：React（Vite）で作るPWA、Netlifyで配信（段階1で追加）
- データ・ログイン・写真：Supabase（開発用 `butoken-dev` と本番用 `butoken-prod` の2プロジェクト）

## フォルダ構成

```
supabase/
  migrations/   データベースの定義。番号順に流す
    ..._schema.sql     テーブル
    ..._security.sql   共通関数と権限ルール（RLS）
    ..._storage.sql    備品写真の保存場所
  tests/        権限ルールのテスト（ローカルのPostgresで実行）
```

## 権限の考え方

- 在籍中の部員でなければ、何も読めない・書けない（引退した部員、招待から登録していない人はアプリを使えない）
- 役職：`admin`（管理者）`captain`（主将）`vice_captain`（副将）`treasurer`（財務）`equipment`（備品管理）。管理者はすべての役職の権限を持つ
- 学年：入部年度から毎回計算し、4月1日に自動で繰り上がる。学年ごとの権限は `grade_permissions` で切り替える（初期値は2年以上が予定を編集可）
- これらはすべてデータベース側で強制する。画面でボタンを隠すのは見た目のためだけ

## 初回セットアップ（Supabaseプロジェクトごとに1回）

### 1. テーブルと権限ルールを作る

Supabaseの管理画面 → SQL Editor で、`supabase/migrations/` のファイルを番号順に貼り付けて実行する。

### 2. ログインの設定

Authentication → Sign In / Providers で、Email を有効にする（メールで届くリンクでログインする方式）。
パスワードによるログインは使わない。

### 3. 最初の管理者を登録する

最初の1人は招待してくれる管理者がいないので、手動で作る。

1. SQL Editor で招待を1つ作る
   ```sql
   insert into public.invites (token, max_uses) values ('first-admin-REPLACE-ME', 1);
   ```
2. アプリの招待リンク（`/join/first-admin-REPLACE-ME`）から登録する
3. SQL Editor で自分に管理者を付ける
   ```sql
   insert into public.member_roles (member_id, role)
   select id, 'admin' from public.members where nickname = '（自分のニックネーム）';
   ```

2人目以降は、アプリの管理画面から招待リンクを発行する。管理者は最低2人置く。

## 権限ルールのテスト

PostgreSQL 16 が入った環境で：

```sh
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
```

部員・財務・主将・引退者などの立場で読み書きを試し、41項目すべて `OK` になれば合格。
権限ルールを変えたら、必ずこのテストを流してから本番に反映する。

## 本番への反映

開発用（`butoken-dev`）で確認してから、同じSQLを本番用（`butoken-prod`）に流す。
本番のデータベースを直接書き換えない。

## 秘密情報の扱い

- 画面に埋め込んでよいのは Project URL と anon キーだけ
- `service_role` キーとデータベースのパスワードは、コード・チャット・LINEに貼らない
