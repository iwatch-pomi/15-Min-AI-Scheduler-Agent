"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ADSENSE_SCRIPT, GPT_SCRIPT, NO_ADS, type AdsConfig } from "@/lib/ads";

// Google の広告（AdSense の小さい広告・アド マネージャーの全画面広告）。
// スクリプトは、広告を出すプラン（無料・ライト）の人が開いたときだけ読み込む（有料プランでは読み込まない）

/** 広告の設定（サーバーの環境変数から、Scheduler が渡す） */
export const AdsContext = createContext<AdsConfig>(NO_ADS);
export const useAds = () => useContext(AdsContext);

const loading = new Map<string, Promise<void>>();

/** 外部のスクリプトを1回だけ読み込む。CSP の strict-dynamic で、このアプリのスクリプトが足したものとして通る */
function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.crossOrigin = "anonymous";
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`読み込めませんでした：${src}`));
      document.head.appendChild(el);
    });
    loading.set(src, p);
  }
  return p;
}

type AdsByGoogle = { push: (v: object) => void };
type Googletag = {
  cmd: { push: (f: () => void) => void } | (() => void)[];
  enums: { OutOfPageFormat: { INTERSTITIAL: unknown } };
  defineOutOfPageSlot: (unit: string, format: unknown) => GptSlot | null;
  pubads: () => unknown;
  enableServices: () => void;
  display: (slot: GptSlot) => void;
  destroySlots: (slots: GptSlot[]) => void;
};
type GptSlot = { addService: (s: unknown) => GptSlot; setConfig?: (c: object) => void };
type AdWindow = Window & { adsbygoogle?: AdsByGoogle | object[]; googletag?: Googletag };

/**
 * AdSense の広告ユニット1つ（label は「広告」の表示）。広告が埋まらなかったとき（unfilled）・読み込めなかったときは、fallback を出す
 */
export function AdSenseUnit(props: { client: string; slot: string; label: React.ReactNode; fallback: React.ReactNode }) {
  const ref = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    loadScript(`${ADSENSE_SCRIPT}?client=${props.client}`).catch(() => setFailed(true));
    if (!pushed.current) {
      pushed.current = true;
      try {
        const w = window as AdWindow;
        ((w.adsbygoogle ??= []) as AdsByGoogle).push({});
      } catch {
        // 読み込み前でも push はできる。失敗するのは、すでに広告が入っているときなど（そのままにする）
      }
    }
    // 広告が無かったときは、AdSense が data-ad-status="unfilled" を付ける
    const watch = new MutationObserver(() => el.getAttribute("data-ad-status") === "unfilled" && setFailed(true));
    watch.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => watch.disconnect();
  }, [props.client]);

  if (failed) return <>{props.fallback}</>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-surface px-2 pt-1 pb-2 stoic:rounded-[12px]">
      {props.label}
      <ins
        ref={ref}
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={props.client}
        data-ad-slot={props.slot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
        data-testid="adsense-unit"
      />
    </div>
  );
}

/**
 * アド マネージャーの Web インタースティシャル（全画面広告）を有効にする。
 * いつ出すかは Google が決める（画面に戻ったとき・リンクを押したときなど。間隔はアド マネージャーの設定）。
 * 返り値：on＝Google の全画面広告を使う／off＝使えない（未設定・この端末では非対応・読み込めない）ので自前の案内を使う／loading＝確かめている途中
 */
export function useGamInterstitial(unit: string | null, enabled: boolean): "loading" | "on" | "off" {
  const [state, setState] = useState<"loading" | "on" | "off">("loading");
  useEffect(() => {
    if (!enabled || !unit) return;
    let cancelled = false;
    let slot: GptSlot | null = null;
    const w = window as AdWindow;
    w.googletag ??= { cmd: [] } as unknown as Googletag;
    loadScript(GPT_SCRIPT).catch(() => !cancelled && setState("off"));
    w.googletag.cmd.push(() => {
      if (cancelled) return;
      const g = w.googletag!;
      slot = g.defineOutOfPageSlot(unit, g.enums.OutOfPageFormat.INTERSTITIAL);
      // この画面の大きさ・ブラウザでは全画面広告を出せない
      if (!slot) return setState("off");
      slot.addService(g.pubads());
      // アプリ（PWA）はページを移らないので、画面に戻ったとき・ブラウザの戻る操作でも出せるようにする
      slot.setConfig?.({ interstitial: { triggers: { unhideWindow: true, navBar: true } } });
      g.enableServices();
      g.display(slot);
      setState("on");
    });
    return () => {
      cancelled = true;
      w.googletag?.cmd.push(() => slot && w.googletag!.destroySlots([slot]));
    };
  }, [unit, enabled]);
  if (!enabled || !unit) return "off";
  return state;
}
