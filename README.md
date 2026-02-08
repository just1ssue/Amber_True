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
- `activeMemberIds` によるラウンド参加対象固定（途中参加は次ラウンドから）
- 観戦モード表示（対象外メンバーは提出/投票不可）
- 参加者一覧で提出/投票ステータスを表示
- Home/Roomで prompts 読み込み失敗時の再読み込みUI
- UTF-8固定（`.editorconfig`）
- dev専用デバッグ機能（Room）
  - 8人参加を仮想化して回答を補完
  - 非デバッグ参加者の投票完了で自動的にRESULTへ遷移
  - お題リロールボタンで現在ラウンドのお題を再抽選

### 未実装（次フェーズ）
- Liveblocks等のリアルタイム同期基盤
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
1. Liveblocks本実装（認証API + adapter差し替え）
2. SQLite編集運用の整備（担当・レビュー・反映フロー）
3. SQLite編集UI（必要に応じて）
