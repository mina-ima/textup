# textup 開発計画

## Context

Android Chrome ユーザーが PWA として使用できる会議・講義録音アプリを新規開発する。
録音環境（遠距離・ノイズあり）の制約から、文字起こしはリアルタイムではなく録音後に Gemini 2.0 Flash で一括処理する方式（オプション C）を採用。完全無料での運用が必須要件。

## 技術スタック（確定）

- **フレームワーク**: Next.js 16.2.4 (App Router, src/)
- **DB**: Neon Postgres + Drizzle ORM（.env.local 設定済み）
- **ストレージ**: Vercel Blob（BLOB_READ_WRITE_TOKEN 設定済み）
- **認証**: Auth.js v5 + Google OAuth
- **文字起こし・要約**: Google Gemini 2.0 Flash API（無料枠）
- **PWA**: manifest + Service Worker (serwist)
- **UI**: shadcn/ui + Tailwind CSS v4

## Phase 0: 土台整備

**目的**: 依存パッケージ・DB・UIの初期設定

### タスク
1. 依存パッケージ追加:
   ```
   pnpm add drizzle-orm @neondatabase/serverless next-auth@beta @auth/drizzle-adapter \
     @google/generative-ai @vercel/blob zod clsx tailwind-merge lucide-react react-markdown \
     serwist next-serwist
   pnpm add -D drizzle-kit @types/bcryptjs
   ```
2. shadcn/ui 初期化: `pnpm dlx shadcn@latest init`
   追加コンポーネント: button, card, dialog, input, badge, sheet, sonner, dropdown-menu, avatar
3. `drizzle.config.ts` 作成（DATABASE_URL_UNPOOLED を使用）
4. `src/lib/db/schema.ts` にスキーマ定義（下記参照）
5. `pnpm drizzle-kit generate && pnpm drizzle-kit migrate` でDB適用
6. `.env.local` に追加: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GEMINI_API_KEY`

### DBスキーマ（src/lib/db/schema.ts）

```ts
// Auth.js 標準テーブル: users, accounts, sessions, verification_tokens
// アプリ固有テーブル:

recording_sessions: {
  id: uuid PK
  userId: text FK→users
  title: text default '無題の録音'
  status: enum('uploading','processing','ready','failed') default 'uploading'
  startedAt: timestamp
  endedAt: timestamp
  durationSec: integer
  audioBlobUrl: text        // Vercel Blob URL
  audioMimeType: text
  createdAt: timestamp
}

transcripts: {
  id: uuid PK
  sessionId: uuid FK→recording_sessions
  seq: integer              // クライアント採番
  speakerLabel: integer     // 0,1,2... = A,B,C...
  startMs: integer
  endMs: integer
  text: text
  createdAt: timestamp
}

speaker_mappings: {
  sessionId: uuid FK  (PK複合)
  speakerLabel: integer    (PK複合)
  displayName: text        // '田中さん' 等
  color: text              // UI表示色
}

summaries: {
  id: uuid PK
  sessionId: uuid FK unique
  markdown: text
  generatedAt: timestamp
}
```

## Phase 1: 認証基盤

**ファイル**:
- `src/lib/auth.ts` — Auth.js v5 設定（DrizzleAdapter + Google OAuth）
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/proxy.ts` — 認可ゲート（`/dashboard`, `/record`, `/sessions` を保護）
- `src/app/(auth)/login/page.tsx` — Google サインインボタン
- `src/app/(app)/layout.tsx` — ヘッダ + ユーザーメニュー
- `src/app/(app)/dashboard/page.tsx` — セッション一覧（空状態）

**ポイント**:
- Next.js 16 では `middleware.ts` ではなく `src/proxy.ts`（named export `proxy`）
- `session: { strategy: 'database' }` で Neon にセッション保存

## Phase 2: 録音UI

**ファイル**:
- `src/features/recording/useRecorder.ts` — MediaRecorder フック
- `src/components/recorder/RecorderControls.tsx` — 開始/停止/一時停止ボタン
- `src/components/recorder/AudioLevelMeter.tsx` — リアルタイム音量メーター（Web Audio API）
- `src/app/(app)/record/page.tsx` — 録音ページ

**録音設定**:
```ts
getUserMedia({ audio: {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 16000,
}})
MediaRecorder: mimeType 'audio/webm;codecs=opus'
```

**フロー**:
1. 録音開始 → `POST /api/sessions`（DB にセッション作成）
2. 録音中 → 音量メーター表示、時間カウンター
3. 録音停止 → WebM Blob を `PUT /api/sessions/[id]/audio`（Vercel Blob へアップロード）
4. アップロード完了 → `POST /api/transcribe/[id]` を自動呼び出し

## Phase 3: 文字起こし（Gemini）

**ファイル**:
- `src/lib/gemini.ts` — Gemini SDK ラッパ（**モデル自動フォールバック機構を内蔵**）
- `src/features/transcription/transcribeAudio.ts` — 音声→Gemini→DB保存
- `src/app/api/transcribe/[id]/route.ts` — Route Handler

**モデル自動フォールバック（必須要件）**:
Gemini の無料枠対象モデルは頻繁に切り替わり、無料枠廃止も起こる。単一モデル固定だと突然動かなくなる事故が発生するため、`gemini.ts` は必ずフォールバック機構を持つ。

```ts
// 新しいモデル優先。未来モデル（まだ存在しない）を先頭に並べておく。
const MODEL_CANDIDATES = [
  'gemini-3.5-flash',   // 未来モデル（リリース時に自動採用）
  'gemini-3.0-flash',   // 未来モデル
  'gemini-2.5-flash',   // 未来モデル
  'gemini-2.0-flash',   // 現行（2026-04 時点）
  'gemini-1.5-flash',   // 後退フォールバック
] as const;
// 環境変数 GEMINI_MODEL_CANDIDATES で上書き可能に
// 404 / quota exceeded / billing required エラー時に次候補へ
// 成功したモデルをログ出力（どれに着地したか把握用）
```

**Geminiへの指示プロンプト**:
```
以下の音声を文字起こしし、話者を区別してください。
JSONで出力: { segments: [{ speaker: 0, startMs: 0, endMs: 1500, text: "..." }] }
話者は整数（0,1,2...）で表してください。同じ声は同じ番号で。
```

**タイムアウト対策**: 60分超の音声はチャンク分割（30分×2回）して処理

**ステータス管理**: `recording_sessions.status` を uploading→processing→ready/failed で遷移

## Phase 4: 話者修正UI（1クリック操作）

**ファイル**:
- `src/app/(app)/sessions/[id]/page.tsx` — 文字起こし表示ページ
- `src/components/session/TranscriptLine.tsx` — 1行コンポーネント
- `src/components/session/SpeakerBadge.tsx` — クリック可能な話者バッジ
- `src/components/session/SpeakerRenameDialog.tsx` — 話者名変更ダイアログ
- `src/app/api/sessions/[id]/speakers/route.ts` — PATCH: 話者名更新

**UI仕様（1クリック操作）**:
```
[話者A] 本日はお集まりいただき...
  ↑ タップ
  ┌─────────────────┐
  │ この行のみ変更  │
  │ ○ 話者A ● 話者B │ ← ラジオ選択
  │ ─────────────── │
  │ 話者A の名前変更│ ← 入力フィールド
  │ □ 全体に適用    │ ← チェックONで一括変更
  │      [保存]     │
  └─────────────────┘
```

- `PATCH /api/sessions/[id]/speakers` で `speaker_mappings` を更新
- `PATCH /api/sessions/[id]/transcripts/[transcriptId]` で個別行の `speakerLabel` を更新
- 表示は `speaker_mappings` を JOIN して常に最新名を表示

## Phase 5: 要約生成（Gemini）

**ファイル**:
- `src/features/summary/promptBuilder.ts` — プロンプト生成
- `src/app/api/summarize/[id]/route.ts` — Route Handler
- `src/app/(app)/sessions/[id]/summary/page.tsx` — Markdown表示

**プロンプト**:
```
以下は日本語の会議/講義の書き起こしです。
話者: {A: 田中, B: 山田, C: 不明}
Markdownで出力:
# タイトル / ## 概要 / ## 主要トピック / ## 決定事項・ToDo / ## 発言ハイライト
```

**Markdownレンダリング**: `react-markdown` + `remark-gfm`

## Phase 6: PWA化

**ファイル**:
- `src/app/manifest.ts` — PWAマニフェスト（Next.js metadata API）
- `public/icons/` — 192x192, 512x512 アイコン
- `next.config.ts` — `serwist` プラグイン追加

**Android最適化**:
- `navigator.wakeLock.request('screen')` — 録音中の画面スリープ防止
- `display: "standalone"` — ネイティブアプリ風表示

## 検証方法

1. `pnpm dev` でローカル起動 → Google OAuth ログイン確認
2. 録音開始 → 停止 → DB にセッション作成・Blob に音声保存確認
3. Gemini 文字起こし結果が画面に表示されること
4. 話者バッジをタップ → ダイアログで変更 → 全体適用が機能すること
5. 要約生成ボタン → Markdown で表示されること
6. Android Chrome でホーム画面に追加 → スタンドアロン起動確認

## 重要ファイルパス

- `/Users/minamidenshiimanaka/AI/textup/src/app/layout.tsx` — 既存 Root layout
- `/Users/minamidenshiimanaka/AI/textup/.env.local` — 環境変数（Neon/Blob設定済み）
- `/Users/minamidenshiimanaka/AI/textup/node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — proxy.ts 仕様
- `/Users/minamidenshiimanaka/AI/textup/node_modules/next/dist/docs/01-app/guides/authentication.md` — Auth.js ガイド
