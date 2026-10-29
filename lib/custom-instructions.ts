// AI へのカスタム指示（ユーザーが書く、毎回 AI に渡す文）。端末間で共有する

export const MAX_INSTRUCTIONS_LENGTH = 500;

/** 前後の空白・連続する空行を整え、長すぎる分は切る。空なら null（指示なし） */
export function normalizeInstructions(text: string | null | undefined): string | null {
  const s = (text ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_INSTRUCTIONS_LENGTH);
  return s || null;
}

/** AI に渡すときの形。本人が書いた好みとして扱い、安全や決まりより優先しないことを添える */
export function instructionsBlock(text: string): string {
  return `## ユーザーのカスタム指示
ユーザー本人が書いた、予定の組み方や返事についての好み。できるだけ従う。ただし上の決まり（安全、メインのカレンダーの予定は変えない、15分単位など）と食い違うときは、上の決まりを優先する。
<custom_instructions>
${text}
</custom_instructions>`;
}
