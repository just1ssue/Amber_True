# Amber_True

複数人（最大8人）で参加できる、**非ログイン**のWebゲーム（お題回答 → 投票 → 得点）モック。

- PJ名: `Amber_True`
- 対象: まずはモック（無料・簡単・運用ラク）を最速で作る
- ホスティング: **GitHub Pages（静的）**
- お題管理: **SQLite（ローカル）→ `public/prompts.json` を生成して同梱**
- ルーティング: **Hash Router**（Pagesの404回避）
- 投票: **投票時は匿名化、結果（得点）で公開**
- 同率: **同率1位は全員加点**

> 注意: `prompts.json` は静的配布されるため、URLを知っていれば誰でも閲覧できます（秘匿はしない前提）。

---

## 現在の実装状況

### 実装済み
- Hash Routerで `/#/room/<roomId>` ルーティング
- Homeでルーム作成/参加、表示名保存
- Homeでルーム参加前チェック（満員時ブロック）
- Homeで最近使ったルームID履歴（最大5件）
- Roomの3フェーズ進行（ANSWER / VOTE / RESULT）
- 回答匿名表示（VOTE）と公開表示（RESULT）
- 同率1位の全員加点
- 共有状態を `GameState` で固定
- `stateAdapter`（localStorage）経由で状態更新を集約
- 同一PC別タブでルーム状態同期（`storage`イベント）
- 退出時のメンバー除外、host離脱時の移譲
- `activeMemberIds` によるラウンド参加対象管理（ANSWER中の途中参加は当該ラウンドから参加可、VOTE/RESULT中は次ラウンドから）
- 観戦モード表示（対象外メンバーは提出/投票不可）
- 参加者一覧で提出/投票ステータスを表示
- Home/Roomで prompts 読み込み失敗時の再読み込みUI
- UTF-8固定（`.editorconfig`）
- dev専用デバッグ機能（Room）
  - 8人参加を仮想化して回答を補完
  - 非デバッグ参加者の投票完了で自動的にRESULTへ遷移
  - お題リロールボタンで現在ラウンドのお題を再抽選

### 未実装（次フェーズ）
- Liveblocks本番運用仕上げ（認証APIの本番導線・監視・障害時運用）
- SQLite編集UI（必要なら）
- 運用向けのDB更新フロー整備（レビュー手順/担当）

### 同期アダプタ切替
- `src/lib/stateAdapter.ts` でアダプタを選択
- 環境変数 `VITE_ROOM_ADAPTER` を使用（既定: `local`）
- `VITE_ROOM_ADAPTER=liveblocks` を指定すると Liveblocksアダプタを使用
- 認証設定は以下の順で解決
  - `VITE_LIVEBLOCKS_AUTH_ENDPOINT`（推奨、`POST { room }` で token を返す）
  - `VITE_LIVEBLOCKS_PUBLIC_KEY`（暫定）
- 認証設定がない場合や初期化失敗時は local へフォールバック
- `RoomStateAdapter` の契約は `src/lib/roomStateAdapterTypes.ts` を参照
  - `load/save/update/subscribe` は同期I/Fとして統一
  - `update` は read-modify-write を担う
- `src/lib/liveblocksAdapter.ts` で local とLiveblocksをミラー
  - `authEndpoint` 使用時は `cache: no-store` で認証APIを呼び出し
  - 認証レスポンスは `token` の存在を検証し、不正レスポンス時はエラー扱い

### Liveblocks認証API契約（本番固定）
- 用途: GitHub Pagesの静的フロントから、外部の認証APIを経由して Liveblocks token を取得する
- エンドポイント: `VITE_LIVEBLOCKS_AUTH_ENDPOINT` に `https://...` の完全URLを設定する
- リクエスト:
  - Method: `POST`
  - Headers: `Content-Type: application/json`, `Accept: application/json`
  - Cache: `no-store`
  - Body: `{ "room": "<roomId>" }`
- レスポンス（成功）:
  - HTTP 200
  - Body: `{ "token": "<liveblocks-access-token>" }`
- レスポンス（失敗）:
  - 4xx/5xx + `{ "error": "<code>", "reason": "<detail>" }` を推奨
  - クライアントは `token` が無い/不正なJSON/HTTPエラー/通信失敗を認証失敗として扱う
- クライアント動作:
  - 認証失敗または初期化失敗時は local アダプタにフォールバック
  - `VITE_LIVEBLOCKS_AUTH_ENDPOINT` 未設定時のみ `VITE_LIVEBLOCKS_PUBLIC_KEY` を使用

### 認証APIデプロイ導線（推奨）
- フロント: GitHub Pages（現行維持）
- 認証API: GitHub Pagesとは別ホスティング（例: Cloudflare Workers / Vercel Functions / Netlify Functions）
- 反映手順:
  1. 認証APIをデプロイし HTTPS エンドポイントURLを確定
  2. `.env.local` または CI環境変数に `VITE_LIVEBLOCKS_AUTH_ENDPOINT` を設定
  3. `VITE_ROOM_ADAPTER=liveblocks` を設定してビルド/配布
  4. `VITE_LIVEBLOCKS_PUBLIC_KEY` は暫定用としてのみ維持（本番は endpoint 優先）

### エラーテレメトリ（auth/sync）
- 目的: Liveblocks 認証失敗と同期失敗をクライアント側から収集する
- 環境変数:
  - `VITE_TELEMETRY_ENDPOINT` を設定した場合のみ送信（未設定時は送信しない）
- 送信仕様:
  - Method: `POST`
  - Headers: `Content-Type: application/json`, `Accept: application/json`
  - Cache: `no-store`
  - Keepalive: `true`
  - Body:

```json
{
  "category": "auth | sync",
  "code": "string",
  "reason": "string",
  "roomId": "optional",
  "adapter": "liveblocks",
  "timestamp": "ISO-8601"
}
```

- 主なイベント:
  - `auth_endpoint_error`（`network_error`, `HTTP xxx`, `invalid_json_response` など）
  - `storage_read_failed`
  - `storage_subscribe_failed`
  - `storage_write_failed`
  - `liveblocks_init_fallback`
- 注意:
  - テレメトリ送信失敗はゲーム進行に影響させない
  - 開発環境（`import.meta.env.DEV`）では `console.warn` にも出力

### Reconnect / Degraded-mode UX方針
- 原則:
  - ゲーム進行は止めず、同期異常時はローカル継続を優先する
  - 同期状態は Room 画面に明示してホスト/参加者が判別できるようにする
- 状態遷移:
  - `healthy/liveblocks`: Liveblocks 同期が有効
  - `degraded/liveblocks`: Liveblocks 接続はあるが storage read/write/subscribe で失敗
  - `degraded/local`: Liveblocks 初期化不可または未設定で local 継続
- UI:
  - 劣化時は「同期状態: 劣化モード」と reason を表示
  - `再同期を試す` ボタンで `adapter.load(roomId)` を再実行
  - 復旧時は自動で `liveblocks 接続中` 表示へ戻る
- 実装箇所:
  - `src/lib/roomSyncStatus.ts`（同期状態ストア）
  - `src/lib/liveblocksAdapter.ts`（状態更新）
  - `src/pages/Room.tsx`（同期状態表示）

---

## ゲーム仕様（概要）

### ルーム
- ルームIDを知っている人のみ参加（URLで共有）
- 最大8人
- 参加者一覧表示（表示名は任意。未入力なら `Guest-XXXX`）

### フェーズ（3つ）
1. **ANSWER**: お題を見てテキスト回答を提出
2. **VOTE**: 回答が揃ったら、最も良い回答に投票（この時点では匿名表示）
3. **RESULT**: 勝者（同率含む）を公開し加点 → 次ラウンドへ

### お題生成（カード3枚イメージ）
- お題は以下3カテゴリから1つずつ抽選し合成
  - `text`（文頭テーマ）
  - `modifier`（修飾子）
  - `content`（内容）

---

## お題データ（SQLite → JSON）

### DBスキーマ（`data/prompts.db`）
- テーブル: `prompts`
- カラム:
  - `id`（TEXT / PK）
  - `category`（`text` / `modifier` / `content`）
  - `text`
  - `enabled`（0/1）
  - `weight`（任意・未指定は1）

### カテゴリ別編集ビュー
`npm run prompts:init` 実行時に、以下の編集用ビューが自動で作成されます。

- `prompts_modifier`
- `prompts_text`
- `prompts_content`

これらのビューには `INSTEAD OF` トリガーが設定されており、`INSERT / UPDATE / DELETE` を行うと内部的に `prompts` テーブルへ反映されます。  
カテゴリ列を意識せずに、カテゴリ単位で編集できます。

### 生成されるJSON（例）
`public/prompts.json`

```json
{
  "version": "2026-02-07T00:00:00Z",
  "text": [{ "id":"t_001", "text":"...", "weight":1 }],
  "modifier": [{ "id":"m_001", "text":"...", "weight":1 }],
  "content": [{ "id":"c_001", "text":"...", "weight":1 }]
}
```

### ローカル同期コマンド
- 初期化（DB作成 + 初期データ投入）
  - `npm run prompts:init`
- CSV一括投入（`data/prompts.bulk.csv` -> DB）
  - `npm run prompts:import`
- JSON生成（DB -> `public/prompts.json`）
  - `npm run prompts:sync`

### CSVでまとめて編集する
編集用CSVは `data/prompts.bulk.csv`（UTF-8）です。1ファイルで3カテゴリを管理できます。

ヘッダ:

```csv
id,category,text,enabled,weight
```

- `id`: 一意キー（既存IDなら上書き更新）
- `category`: `text` / `modifier` / `content`
- `text`: お題本文
- `enabled`: `1` or `0`（未指定は `1`）
- `weight`: 正の数（未指定は `1`）

CSV反映手順:
1. `data/prompts.bulk.csv` を編集
2. `npm run prompts:import`
3. `public/prompts.json` の差分確認

`npm run prompts:import` 実行時に `prompts:sync` は自動実行されます。

### 日常運用（推奨）
1. `data/prompts.db` を更新
2. `npm run prompts:sync`
3. `public/prompts.json` の差分確認
4. 必要ファイルをコミット

### GitHub Actions 同期（手動実行）
- Workflow: `.github/workflows/sync-prompts.yml`
- Trigger: `workflow_dispatch`（手動）
- 処理:
  - `npm run prompts:init`
  - `npm run prompts:sync`
  - `public/prompts.json` に差分があれば自動コミット

---

## ディレクトリ構成（最小）

- `.github/workflows/` … SQLite→JSON同期（手動実行）
- `data/prompts.db` … お題のローカルDB
- `public/prompts.json` … 生成されたお題JSON（静的配布）
- `src/pages/Home.tsx` … ルーム作成/参加
- `src/pages/Room.tsx` … ルーム（ゲーム画面の雛形）
- `src/lib/types.ts` … 型定義（`GameState`含む）
- `src/lib/prompt.ts` … 重み付き抽選
- `src/lib/stateAdapter.ts` … ローカル同期層（localStorage）
- `src/lib/gameState.ts` … 初期ゲーム状態生成
- `src/lib/storage.ts` … userId/displayNameの永続化
- `src/lib/debugTools.ts` … dev用デバッグ参加者ロジック

---

## 開発（ローカル）

```bash
npm install
npm run prompts:init
npm run prompts:sync
npm run dev
```

ビルド:

```bash
npm run build
npm run preview
```

---

## デプロイ（GitHub Pagesの想定）
- Viteの `base` は `/<repo>/` を想定（`vite.config.ts` を参照）
- ルーティングは Hash Router を採用（`/#/room/<roomId>`）

---

## 次の作業（推奨順）
1. Liveblocks本番運用の確定（認証APIの固定・エラー監視・再接続方針）
2. SQLite編集運用の整備（担当・レビュー・反映フロー）
3. SQLite編集UI（必要に応じて）
