# agents.md（AI支援用メモ）

このリポジトリは「モック優先」で進める。AI（Codex等）に依頼するときは、以下の前提を守る。

---

## プロジェクト前提

- 名前: Amber_True
- ホスティング: GitHub Pages（静的）
- ルーティング: Hash Router（`/#/...`）
- お題: Google Sheetsで管理し、GitHub Actionsで `public/prompts.json` を更新（手動実行）
- 同率: 同率1位は全員加点
- 匿名: 投票フェーズでは回答者を匿名表示、結果フェーズで公開

---

## 重要な設計制約

1. **静的サイトのみで秘密情報は扱わない**
   - Sheets APIの鍵やLiveblocksのSecret等はフロントに置かない。
   - 方案BではSheetsはActions側で取得しJSON化する。

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

---

## 共有状態（固定したい最小スキーマ）

- `phase`: 'ANSWER' | 'VOTE' | 'RESULT'
- `round`: number
- `prompt`: { modifierId, situationId, contentId, text }
- `submissions`: { [userId]: { text, submittedAt } }
- `votes`: { [voterId]: { targetUserId } }
- `scores`: { [userId]: number }
- `members`: { [userId]: { name, joinedAt } }
- `hostId`: string

---

## お題抽選ルール（最小）

- `modifier/situation/content` から1つずつ抽選
- `enabled` のみ対象
- `weight` による重み抽選（未指定は1）
- 抽選結果は1ラウンド中固定
