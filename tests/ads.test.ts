import { describe, expect, it } from "vitest";
import { NO_ADS, adsConfig, adsEnabled, adsTxt } from "@/lib/ads";
import { contentSecurityPolicy } from "@/proxy";

describe("Google の広告の設定", () => {
  const env = {
    ADSENSE_CLIENT: "ca-pub-1234567890123456",
    ADSENSE_SLOT_HOME: "1111111111",
    ADSENSE_SLOT_CHAT: "2222222222",
    GAM_INTERSTITIAL_UNIT: "/21234567890/ai15_interstitial",
  };

  it("環境変数が無ければ、広告は使わない（自前の案内だけ）", () => {
    expect(adsConfig({})).toEqual(NO_ADS);
    expect(adsEnabled(adsConfig({}))).toBe(false);
    expect(adsTxt(adsConfig({}))).toBeNull();
  });

  it("決まった形の ID だけを使う（ページに埋め込むので）", () => {
    expect(adsConfig(env)).toEqual({
      client: "ca-pub-1234567890123456",
      slots: { home: "1111111111", chat: "2222222222" },
      interstitialUnit: "/21234567890/ai15_interstitial",
    });
    expect(adsConfig({ ...env, ADSENSE_CLIENT: 'ca-pub-1"><script>' }).client).toBeNull();
    expect(adsConfig({ ...env, ADSENSE_SLOT_HOME: "abc" }).slots.home).toBeNull();
    expect(adsConfig({ ...env, GAM_INTERSTITIAL_UNIT: "ai15_interstitial" }).interstitialUnit).toBeNull();
  });

  it("AdSense の ID が無ければ、広告ユニットの ID だけがあっても使わない", () => {
    expect(adsConfig({ ADSENSE_SLOT_HOME: "1111111111" }).slots.home).toBeNull();
  });

  it("ads.txt は、AdSense の ID から作る", () => {
    expect(adsTxt(adsConfig(env))).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("広告を使うときだけ、CSP で Google の広告の通信・iframe・画像を許す。スクリプトは nonce のまま", () => {
    const off = contentSecurityPolicy("n");
    expect(off).toContain("connect-src 'self';");
    expect(off).toContain("frame-src 'self';");
    expect(off).not.toContain("googlesyndication");

    const on = contentSecurityPolicy("n", false, true);
    expect(on).toMatch(/connect-src 'self' [^;]*https:\/\/\*\.googlesyndication\.com/);
    expect(on).toMatch(/frame-src 'self' [^;]*https:\/\/\*\.doubleclick\.net/);
    expect(on).toContain("img-src 'self' data: blob: https:");
    expect(on).toMatch(/script-src 'self' 'nonce-n' 'strict-dynamic';/);
    expect(on).toContain("frame-ancestors 'none'");
  });
});
