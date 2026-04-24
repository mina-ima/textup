# textup 開発タスク

## Phase 0: 土台整備
- [x] 依存パッケージ追加（drizzle-orm, next-auth, @google/generative-ai 等）
- [x] shadcn/ui 初期化 + コンポーネント追加（button, card, dialog, input, badge, sheet, sonner, dropdown-menu, avatar）
- [x] drizzle.config.ts 作成
- [x] src/lib/db/schema.ts 作成（全テーブル定義）
- [x] src/lib/db/index.ts 作成（Drizzle クライアント）
- [x] drizzle-kit generate + migrate 実行
- [x] .env.local に AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, GEMINI_API_KEY 追加

## Phase 1: 認証基盤
- [x] src/lib/auth.ts 作成（Auth.js v5 + DrizzleAdapter + Google OAuth）
- [x] src/app/api/auth/[...nextauth]/route.ts 作成
- [x] src/proxy.ts 作成（認可ゲート）
- [x] src/app/(auth)/login/page.tsx 作成（Googleサインインボタン）
- [x] src/app/(auth)/layout.tsx 作成
- [x] src/components/layout/AppHeader.tsx 作成
- [x] src/components/layout/UserMenu.tsx 作成
- [x] src/app/(app)/layout.tsx 作成
- [x] src/app/(app)/dashboard/page.tsx 作成（セッション一覧）
- [x] src/types/next-auth.d.ts 作成（Session型拡張）

## Phase 2: 録音UI
- [x] src/features/recording/types.ts 作成（RecordingMode定義 + プリセット）
- [x] src/features/recording/useRecorder.ts 作成（MediaRecorder + GainNode フック）
- [x] src/components/recorder/AudioLevelMeter.tsx 作成
- [x] src/components/recorder/RecorderControls.tsx 作成
- [x] src/components/recorder/RecordingSettings.tsx 作成（ゲイン・録音モード設定パネル）
  - [x] ゲインスライダー（0.5x〜5x）
  - [x] プリセット選択: 対面 / 会議室 / 講義 / WEB会議（各モードで noiseSuppression / echoCancellation / autoGainControl を自動設定）
- [x] src/app/api/sessions/route.ts 作成（POST: セッション作成）
- [x] src/app/api/sessions/[id]/audio/route.ts 作成（PUT: Vercel Blob アップロード）
- [x] src/app/(app)/record/page.tsx 作成（録音ページ + WakeLock スリープ防止）
- [x] src/app/(app)/sessions/[id]/page.tsx stub 作成（遷移先）
- [x] AppLayout に Toaster 配置
- [x] dashboard に録音開始ボタン追加

## Phase 3: 文字起こし（Gemini）
- [x] src/lib/gemini.ts 作成（Gemini SDK ラッパ + **モデル自動フォールバック機構**）
  - [x] MODEL_CANDIDATES 配列（未来モデル優先順: 3.5 → 3.0 → 2.5 → 2.0 → 1.5）
  - [x] 404 / quota / billing / 429 / 403 エラー時に次候補へ自動切替
  - [x] 環境変数 GEMINI_MODEL_CANDIDATES で上書き可能
  - [x] 成功時に採用モデルをログ出力
- [x] src/features/transcription/transcribeAudio.ts 作成
- [x] src/app/api/transcribe/[id]/route.ts 作成（POST: 文字起こし実行、maxDuration=300）
- [x] 録音停止後に自動で文字起こし開始する処理（record page で fire-and-forget）
- [x] ステータス表示 UI（uploading / processing / ready / failed）
- [x] src/components/session/StatusPoller.tsx（5秒ごとに router.refresh）
- [x] src/components/session/TranscriptList.tsx
- [x] src/app/(app)/sessions/[id]/page.tsx 本実装（文字起こし結果 + 話者バッジ表示）

## Phase 4: 話者修正UI
- [x] src/components/session/TranscriptList.tsx（client 化、話者バッジクリックでダイアログ）
- [x] src/components/session/SpeakerEditDialog.tsx 作成（1クリック操作 + 一括適用チェック）
- [x] src/app/api/sessions/[id]/speakers/route.ts 作成（PATCH: 話者名/色 upsert）
- [x] src/app/api/sessions/[id]/transcripts/[tid]/route.ts 作成（PATCH: 個別行の speakerLabel 変更）
- [x] src/app/(app)/sessions/[id]/page.tsx に TranscriptList 組み込み

## Phase 5: 要約生成
- [x] src/features/summary/promptBuilder.ts 作成
- [x] src/app/api/summarize/[id]/route.ts 作成（Gemini フォールバック経由、upsert対応）
- [x] src/app/(app)/sessions/[id]/summary/page.tsx 作成（Markdown表示）
- [x] react-markdown + remark-gfm で MarkdownView コンポーネント
- [x] GenerateSummaryButton（要約生成トリガ）
- [x] セッション詳細ページから要約ページへの導線追加

## Phase 6: PWA化
- [x] public/icons/ にアイコン追加（192x192, 512x512, apple-icon.png）— Python PILで生成
- [x] src/app/manifest.ts 作成（start_url: /dashboard, display: standalone, theme_color: indigo）
- [x] public/sw.js 作成（インストール可能性を満たすための最小 SW）
- [x] src/components/pwa/ServiceWorkerRegister.tsx 作成（本番ビルドでのみ登録）
- [x] root layout の icons / manifest / viewport（themeColor） 設定
- [x] WakeLock API の実装（record page で録音中スリープ防止）
- [ ] Android Chrome 実機動作確認（ユーザーテスト待ち）
