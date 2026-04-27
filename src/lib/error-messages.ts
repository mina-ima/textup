// Gemini や周辺 API のエラーをユーザー向けの簡潔な文言に変換する。
// API ルートの catch で `summary` フィールドとして JSON に含め、
// クライアントはそれをトーストに表示する。
//
// 詳細スタックはサーバー console と `detail` フィールドにのみ残す。

export type ErrorCategory =
  | 'quota_exhausted'
  | 'rate_limited'
  | 'overloaded'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'timeout'
  | 'network'
  | 'all_models_failed'
  | 'already_processing'
  | 'unknown';

const SUMMARY_BY_CATEGORY: Record<ErrorCategory, string> = {
  quota_exhausted:
    'Gemini API の無料枠を使い切りました。時間をおいて再度お試しください',
  rate_limited:
    'リクエストが多すぎます。少し待ってから再度お試しください',
  overloaded:
    'Gemini API が一時的に混雑しています。少し待ってから再度お試しください',
  auth: 'Gemini API キーの認証に失敗しました（管理者にご連絡ください）',
  permission: 'このモデルにアクセスする権限がありません',
  not_found: '指定したモデルが見つかりませんでした',
  timeout: '処理がタイムアウトしました。録音時間が長すぎる可能性があります',
  network: 'ネットワーク接続に問題があります。接続状況をご確認ください',
  all_models_failed:
    '利用可能なすべての Gemini モデルが失敗しました。時間をおいて再度お試しください',
  already_processing:
    'すでに処理中です。完了まで少しお待ちください',
  unknown:
    '一時的な問題が発生しました。少し待ってから再度お試しください',
};

function categorize(raw: string): ErrorCategory {
  const m = raw.toLowerCase();

  // フォールバック全滅は最優先で判定（最も一般的なエラー）
  if (m.includes('all gemini model candidates failed')) {
    // 内訳の最後のエラーで再分類できればそちらを優先
    const inner = extractLastInnerError(raw);
    if (inner) {
      const cat = categorize(inner);
      if (cat !== 'unknown') return cat;
    }
    return 'all_models_failed';
  }

  if (
    m.includes('limit: 0') ||
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('billing')
  ) {
    return 'quota_exhausted';
  }
  if (m.includes('429') || m.includes('rate limit')) return 'rate_limited';
  if (
    m.includes('503') ||
    m.includes('500') ||
    m.includes('502') ||
    m.includes('504') ||
    m.includes('overloaded') ||
    m.includes('high demand') ||
    m.includes('service unavailable') ||
    m.includes('internal error')
  ) {
    return 'overloaded';
  }
  if (m.includes('401') || m.includes('api key') || m.includes('unauthenticated')) {
    return 'auth';
  }
  if (m.includes('403') || m.includes('permission')) return 'permission';
  if (m.includes('404') || m.includes('not found')) return 'not_found';
  if (m.includes('deadline') || m.includes('timeout') || m.includes('timed out')) {
    return 'timeout';
  }
  if (
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('enotfound')
  ) {
    return 'network';
  }
  return 'unknown';
}

// `All Gemini model candidates failed: [{"model":"...","error":"..."}]`
// から最後の inner error を取り出す。
function extractLastInnerError(raw: string): string | null {
  try {
    const idx = raw.indexOf('[');
    if (idx < 0) return null;
    const parsed = JSON.parse(raw.slice(idx)) as Array<{ error?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const last = parsed[parsed.length - 1]?.error;
    return typeof last === 'string' ? last : null;
  } catch {
    return null;
  }
}

export function summarizeError(err: unknown): {
  summary: string;
  category: ErrorCategory;
  detail: string;
} {
  const detail = err instanceof Error ? err.message : String(err);
  const category = categorize(detail);
  return { summary: SUMMARY_BY_CATEGORY[category], category, detail };
}

export function getCategorySummary(category: ErrorCategory): string {
  return SUMMARY_BY_CATEGORY[category];
}
