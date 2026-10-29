// Google の広告（AdSense・Google アド マネージャー）の設定。ID は環境変数で渡し、無いものは使わない（自前の案内を出す）。
// 広告に、予定やチャットの内容は渡さない（Google API の Limited Use の決まり）

export type AdsConfig = {
  /** AdSense のサイト運営者 ID（ca-pub-…） */
  client: string | null;
  /** AdSense の広告ユニットの ID（小さい広告の枠ごと） */
  slots: { home: string | null; chat: string | null };
  /** アド マネージャーの Web インタースティシャルの広告ユニット（/ネットワークコード/ユニット名） */
  interstitialUnit: string | null;
};

export const NO_ADS: AdsConfig = { client: null, slots: { home: null, chat: null }, interstitialUnit: null };

const pick = (value: string | undefined, pattern: RegExp) => {
  const v = value?.trim();
  return v && pattern.test(v) ? v : null;
};

/** 環境変数から読む。形がおかしい値は、使わない（ページに埋め込むので、決まった形だけ通す） */
export function adsConfig(env: Record<string, string | undefined> = process.env): AdsConfig {
  const client = pick(env.ADSENSE_CLIENT, /^ca-pub-\d{10,20}$/);
  const slot = (v: string | undefined) => (client ? pick(v, /^\d{5,20}$/) : null);
  return {
    client,
    slots: { home: slot(env.ADSENSE_SLOT_HOME), chat: slot(env.ADSENSE_SLOT_CHAT) },
    interstitialUnit: pick(env.GAM_INTERSTITIAL_UNIT, /^\/\d{3,20}(\/[A-Za-z0-9_.-]+)+$/),
  };
}

export function adsEnabled(config: AdsConfig): boolean {
  return config.client !== null || config.interstitialUnit !== null;
}

/** /ads.txt の中身（AdSense の収益を守るため、このサイトで広告を売ってよい事業者を示す） */
export function adsTxt(config: AdsConfig): string | null {
  return config.client ? `google.com, ${config.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : null;
}

export const ADSENSE_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
export const GPT_SCRIPT = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";

/**
 * 広告を出すときに、Content-Security-Policy で許す送り先（proxy.ts）。
 * スクリプトは nonce と strict-dynamic で通るので、ここには通信・iframe の送り先だけを書く。広告の画像は色々な所から届くので img-src は https: を許す
 */
export const AD_HOSTS = [
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.google.com",
  "https://*.google.co.jp",
  "https://*.googleadservices.com",
  "https://*.googletagservices.com",
  "https://*.adtrafficquality.google",
];
