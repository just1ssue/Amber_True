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
- UTF-8固定（`.editorconfig`）

### 未実装（次フェーズ）
- Liveblocks等のリアルタイム同期基盤
- 参加者一覧UIの強化
- SQLite編集UI（必要なら）

### 同期アダプタ切替
- `src/lib/stateAdapter.ts` でアダプタを選択
- 環境変数 `VITE_ROOM_ADAPTER` を使用（既定: `local`）
- `VITE_ROOM_ADAPTER=liveblocks` を指定すると Liveblocks用アダプタ雛形を通ります  
  現在は認証API未導入のため、内部的に local へフォールバックします

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
  - `modifier`（修飾子）
  - `situation`（場合）
  - `content`（内容）

---

## お題データ（SQLite → JSON）

### DBスキーマ（`data/prompts.db`）
- テーブル: `prompts`
- カラム:
  - `id`（TEXT / PK）
  - `category`（`modifier` / `situation` / `content`）
  - `text`
  - `enabled`（0/1）
  - `weight`（任意・未指定は1）

### 生成されるJSON（例）
`public/prompts.json`

```json
{
  "version": "2026-02-07T00:00:00Z",
  "modifier": [{ "id":"m_001", "text":"...", "weight":1 }],
  "situation": [{ "id":"s_001", "text":"...", "weight":1 }],
  "content": [{ "id":"c_001", "text":"...", "weight":1 }]
}
```

### ローカル同期コマンド
- 初期化（DB作成 + 初期データ投入）
  - `npm run prompts:init`
- JSON生成（DB -> `public/prompts.json`）
  - `npm run prompts:sync`

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
1. `stateAdapter` を interface 化し、Liveblocks実装を追加
2. 参加者一覧UI/接続状態UI/host権限UIを追加
3. ルーム内エラーハンドリング（prompts取得失敗時など）を改善
4. SQLiteを編集しやすくする運用（GUIツール or 管理画面）を整備
