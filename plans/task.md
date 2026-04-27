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

## Phase 7: 再実行機能の強化（2026-04-24）
- [x] セッション詳細で「文字起こし再実行」ボタンを常時表示
  - 条件を `failed || stuck` から `!isBusy && audioBlobUrl` に緩和
  - 完了でも結果が不満/空のときに再実行できるように
  - 対象: `src/app/(app)/sessions/[id]/page.tsx`
- [x] 既存結果がある場合は `window.confirm()` で上書き確認
  - `RetryTranscribeButton` に `hasExisting` prop 追加
  - 対象: `src/components/session/RetryTranscribeButton.tsx`
- [x] `status=ready` で結果が空のケース用の警告メッセージを表示
- [x] Gemini 自動フォールバックの強化（503/500/overloaded/high demand/deadline を追加）
  - 対象: `src/lib/gemini.ts` の `isFallbackError()`
- [x] ローカル dev で動作確認（Chrome DevTools MCP 経由）
- [x] 本番 Vercel にデプロイ（v0.2.9、textup-five.vercel.app）
- [x] 本番で失敗状態セッションでの再実行フロー確認
  - 本番テスト用セッション ID: `eb2275ee-a2a9-4d80-a57c-bab9dbb20dc1`
  - 再実行ボタン→API発火→全モデルフォールバック は動作確認済み
  - 503フォールバックも実動作確認

## Phase 8: Gemini 候補順の最適化（2026-04-27 / v0.2.10）
- [x] DEFAULT_CANDIDATES を「実在モデル優先」に並び替え（静的フォールバック用）
- [x] 常時 404 のモデルを除外
- [x] v0.2.10 デプロイ確認

## Phase 9: ListModels API による動的候補取得（2026-04-27 / v0.2.11）
- [x] REST 直叩きで `v1beta/models` から動的取得（SDK に listModels 無し）
- [x] `generateContent` 対応モデルのみ抽出 + 不適切バリアント除外
- [x] バージョン降順ソート、プロセスメモリ 1h キャッシュ
- [x] 失敗時は静的 `DEFAULT_CANDIDATES` にフォールバック
- [x] v0.2.11 デプロイ確認

## Phase 10: エラーメッセージのユーザー向け要約（2026-04-27 / v0.2.12）
- [x] `src/lib/error-messages.ts` 新規作成（`summarizeError()` ユーティリティ）
- [x] エラーカテゴリ分類: quota_exhausted / rate_limited / overloaded / auth / permission / not_found / timeout / network / all_models_failed / unknown
- [x] `All Gemini model candidates failed: [...]` から最後の inner error を再分類
- [x] `/api/transcribe/[id]` と `/api/summarize/[id]` で `summary` / `category` / `detail` を返す
- [x] `RetryTranscribeButton` / `GenerateSummaryButton` で `summary` を優先表示、`detail` は console
- [x] ロジックの 7 ケース手動テスト全パス
- [ ] 本番 Vercel にデプロイ

## 今後の課題（次回以降）

### 文字起こし系
- [ ] Gemini 429 の `retryDelay` を尊重して指数バックオフ付きリトライを実装
- [ ] 再実行中の重複 POST 防止（現状は `busy` state のみ、サーバー側で `processing` 中の rate limit は未実装）
- [ ] retry count / 履歴の可視化

### UI/UX
- [ ] 一覧（dashboard）から「失敗」セッションの直接再実行

### PWA
- [ ] Android Chrome 実機動作確認（Phase 6 から持ち越し）
