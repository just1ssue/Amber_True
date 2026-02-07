# Amber_True

複数人（最大8人）で参加できる、**非ログイン**のWebゲーム（お題回答 → 投票 → 得点）モック。

- PJ名: `Amber_True`
- 対象: まずはモック（無料・簡単・運用ラク）を最速で作る
- ホスティング: **GitHub Pages（静的）**
- お題管理: **Google スプレッドシート → GitHub Actions で JSON に変換して同梱（方案B）**
- ルーティング: **Hash Router**（Pagesの404回避）
- 投票: **投票時は匿名化、結果（得点）で公開**
- 同率: **同率1位は全員加点**

> 注意: 方案Bは `prompts.json` が静的配布されるため、URLを知っていれば誰でも閲覧できます（秘匿はしない前提）。

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

## お題データ（Sheets → JSON）

### 推奨フォーマット（1シート方式）
- Spreadsheet: `prompts` シート
- カラム:
  - `id`（一意）
  - `category`（`modifier` / `situation` / `content`）
  - `text`
  - `enabled`（TRUE/FALSE）
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

---

## ディレクトリ構成（最小）

- `.github/workflows/` … Sheets→JSON同期（手動実行）
- `public/prompts.json` … 生成されたお題JSON（静的配布）
- `src/pages/Home.tsx` … ルーム作成/参加
- `src/pages/Room.tsx` … ルーム（ゲーム画面の雛形）
- `src/lib/` … 型/抽選/ユーティリティ

---

## 開発（ローカル）

```bash
npm install
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
1. Home: ルーム作成/参加のUI確定（roomId生成、表示名入力）
2. Room: フェーズUIの雛形（ANSWER/VOTE/RESULT）
3. 共有状態の設計を固定（phase/round/prompt/submissions/votes/scores）
4. 同期基盤（例: Liveblocks）を差し替え可能な形で組み込む
5. GitHub Actions: Sheets→JSON生成を実動にする（Secrets設定）
