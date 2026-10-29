"use client";

import { useState } from "react";
import { MAX_INSTRUCTIONS_LENGTH } from "@/lib/custom-instructions";

const EXAMPLES = [
  "朝は集中する作業、午後は会議や軽い作業にして",
  "1時間ごとに5分の休憩を入れて",
  "22時以降は予定を入れないで",
  "返事は短く、結論だけにして",
];

/**
 * 増える使用量の目安（1日の予算 $0.50 に対する％）。日本語は1字およそ1.2トークン、
 * 1回の依頼で AI を3回ほど呼ぶとして、モデルごとの入力の料金から計算する
 */
function extraPercent(chars: number, usdPerMTok: number): string {
  const p = ((chars * 1.2 * 3 * usdPerMTok) / 1_000_000 / 0.5) * 100;
  return p < 0.01 ? "0.01%未満" : `約${p < 0.1 ? p.toFixed(2) : p.toFixed(1)}%`;
}

/** マイページから開く「AIへのカスタム指示」の編集シート */
export default function InstructionsEditor(props: { text: string | null; onSave: (text: string | null) => Promise<string | null>; onClose: () => void }) {
  const { onSave, onClose } = props;
  const [text, setText] = useState(props.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const len = text.trim().length;

  const save = async (value: string | null) => {
    setBusy(true);
    const message = await onSave(value);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center bg-black/30 stoic:bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="max-h-[92dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-bg px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card stoic:border-t stoic:border-line"
        onClick={(e) => e.stopPropagation()}
        data-testid="instructions-editor"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">AIへのカスタム指示</h2>
          <button onClick={onClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          予定の組み方や返事の好みを書いておくと、AIが毎回この指示に従います。チャットと「AIで更新」（AIのおすすめ）で使い、ほかの端末でも同じ指示が使われます。
        </p>

        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_INSTRUCTIONS_LENGTH}
            rows={6}
            placeholder="例：朝は集中する作業を入れて、会議は午後にまとめて"
            aria-label="カスタム指示"
            className="w-full resize-none rounded-xl bg-surface px-3.5 py-3 text-[16px] leading-relaxed outline-none ring-1 ring-line focus:ring-accent"
          />
          <p className="t-code text-right text-[11px] text-muted">
            {len} / {MAX_INSTRUCTIONS_LENGTH}字
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText((t) => (t.trim() ? `${t.trim()}\n${ex}` : ex).slice(0, MAX_INSTRUCTIONS_LENGTH))}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-muted active:bg-surface stoic:rounded-lg"
            >
              ＋ {ex}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 rounded-xl bg-now/10 px-3.5 py-3 text-xs leading-relaxed text-text" data-testid="instructions-cost">
          <p className="font-bold text-now">⚠ 使用量が増えます</p>
          <p>カスタム指示は、AIに依頼するたびに毎回いっしょに送ります。そのため、指示が長いほど、1回ごとの使用量が増えます。</p>
          <p className="t-code">
            今の長さ（{len}字）での目安：節約・通常（Haiku）{extraPercent(len, 0.1)}／強化（Sonnet）{extraPercent(len, 2)}／最大（Opus）{extraPercent(len, 4)}（1回の依頼あたり、今日のAIの残りから）
          </p>
          <p className="text-muted">節約モードでアプリが処理する依頼（「14時から会議1時間」など）には使わないので、使用量は増えません。</p>
        </div>

        {error && <p className="text-sm text-now">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy || !props.text}
            className="rounded-full border border-line px-4 py-2.5 text-sm text-muted disabled:opacity-40 stoic:rounded-xl"
          >
            指示を消す
          </button>
          <button
            type="button"
            onClick={() => save(text.trim() || null)}
            disabled={busy}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-on-accent disabled:opacity-60 stoic:rounded-xl"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
