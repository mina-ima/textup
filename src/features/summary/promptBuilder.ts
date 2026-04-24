import 'server-only';

type Segment = {
  speakerLabel: number;
  startMs: number;
  text: string;
};

type SpeakerMap = Record<number, string>;

export function buildSummaryPrompt(
  title: string,
  segments: Segment[],
  speakers: SpeakerMap,
): string {
  const speakerLines = Object.entries(speakers)
    .map(([k, v]) => `${speakerLabelToName(Number(k))}: ${v}`)
    .join('\n');

  const transcriptText = segments
    .map((seg) => {
      const name = speakers[seg.speakerLabel] ?? speakerLabelToName(seg.speakerLabel);
      return `[${name}] ${seg.text}`;
    })
    .join('\n');

  return `以下は「${title}」の文字起こしです。この内容を Markdown 形式で要約してください。

話者:
${speakerLines || '(情報なし)'}

---
${transcriptText}
---

出力は以下の構造の Markdown としてください（日本語で、そのまま表示できる形式で返す）：

# ${title}

## 概要
(3-5行で全体像を要約)

## 主要トピック
(箇条書きで主要な議題・論点を列挙)

## 決定事項・ToDo
(決まったこと・宿題・次のアクションを箇条書き。該当なしの場合は「特になし」)

## 発言ハイライト
(印象的な発言や重要な数字・固有名詞を、誰の発言かとともに引用形式で記載)

注意:
- 表面的な繰り返しではなく、内容を把握した要約にすること。
- 事実に基づかない推測は含めないこと。
- 議事録/講義ノートとして使えるレベルを目指すこと。`;
}

function speakerLabelToName(label: number): string {
  return `話者${String.fromCharCode(65 + label)}`;
}
