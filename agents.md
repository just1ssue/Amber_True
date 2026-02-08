# agents.md（AI支援用メモ）

このリポジトリは「モック優先」で進める。AI（Codex等）に依頼するときは、以下の前提を守る。

---

## プロジェクト前提

- 名前: Amber_True
- ホスティング: GitHub Pages（静的）
- ルーティング: Hash Router（`/#/...`）
- お題: SQLite（`data/prompts.db`）で管理し、`public/prompts.json` を生成して配布
- 同率: 同率1位は全員加点
- 匿名: 投票フェーズでは回答者を匿名表示、結果フェーズで公開
- 文字コード: UTF-8固定（`.editorconfig`）

---

## 重要な設計制約

1. **静的サイトのみで秘密情報は扱わない**
   - LiveblocksのSecret等はフロントに置かない。
   - SQLiteはローカル/CIで扱い、生成結果のみ `public/prompts.json` に出力する。

2. **GitHub PagesのSPA制約**
   - 404回避のためHash Router採用。
   - URL設計は `/#/room/<roomId>` を基本にする。

3. **データの公開性**
   - `public/prompts.json` は誰でも閲覧できる前提。
   - 秘匿が必要になったら、別案（サーバレスAPI方式）へ移行。

---

## AIに依頼する時の粒度

- 変更は「ファイル単位」で提示（差分だけでなく全文が望ましい）
- まずはUI/状態遷移の骨格から
- 同期基盤（Liveblocks等）は後から差し替えできる設計にする
- ローカルモックは `stateAdapter`（localStorage）経由で実装する

---

## 共有状態（固定したい最小スキーマ）

- `phase`: 'ANSWER' | 'VOTE' | 'RESULT'
- `round`: number
- `prompt`: { textId, modifierId, contentId, text }
- `submissions`: { [userId]: { text, submittedAt } }
- `votes`: { [voterId]: { targetUserId } }
- `scores`: { [userId]: number }
- `members`: { [userId]: { name, joinedAt } }
- `hostId`: string

---

## お題抽選ルール（最小）

- `text/modifier/content` から1つずつ抽選
- `enabled` のみ対象
- `weight` による重み抽選（未指定は1）
- 抽選結果は1ラウンド中固定

---

## 現在のローカルモック実装（2026-02-08時点）

- 共有状態は `GameState` で固定し、`Room` はこの単一状態を更新
- 共有状態に `activeMemberIds` があり、ラウンド参加対象を固定（途中参加は次ラウンドから）
- 共有状態の保存/読込は `src/lib/stateAdapter.ts` に集約
- 同一PCの別タブで `storage` イベントによりルーム状態同期
- ルーム参加上限8人を適用（満員時は入室不可）
- ルーム退出時に `members` から除外、host離脱時は次メンバーへ移譲
- Homeでルーム作成時に初期状態を作成して保存してから遷移
- Homeに最近使ったルームID履歴（最大5件）を表示
- Home/Roomで `prompts.json` 読み込み失敗時にエラー表示と再読み込みを実装
- お題はSQLiteからJSON生成（`npm run prompts:init` / `npm run prompts:sync`）
- 同期アダプタは `RoomStateAdapter` interface で差し替え可能
- `VITE_ROOM_ADAPTER=liveblocks` は雛形経由で現状localにフォールバック

---

## 直近の未実装

- Liveblocks本実装（認証APIを含む）
- SQLite編集UI（必要であれば）
- SQLite運用ルールの固定（誰がDB更新するか、更新頻度、レビュー手順）

---

## 引き継ぎメモ

- お題を更新する基本手順:
  1. `data/prompts.db` を編集
  2. `npm run prompts:sync`
  3. `public/prompts.json` の差分確認
- 初回環境構築:
  - `npm install`
  - `npm run prompts:init`
- 既知の注意:
  - `prompts:init` はDBが空の場合のみseedする（既存データは上書きしない）
  - GitHub Actionsの同期workflowはSQLite前提で動作
