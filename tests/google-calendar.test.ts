import { beforeEach, describe, expect, it, vi } from "vitest";

// Google Calendar API の偽物。カレンダー id ごとに予定をメモリに持つ
type Ev = { id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string }; extendedProperties?: unknown; status?: string };
const fake = {
  calendars: new Map<string, Map<string, Ev>>(),
  colors: new Map<string, string>(),
  names: new Map<string, string>(),
  writes: [] as string[], // 書き込んだカレンダー id（メインに書いていないかの確認用）
  denyScopes: false,
  nextCal: 0,
};
const notFound = () => Object.assign(new Error("Not Found"), { code: 404 });
const cal = (id: string) => {
  if (fake.denyScopes) throw Object.assign(new Error("Request had insufficient authentication scopes."), { code: 403 });
  const c = fake.calendars.get(id);
  if (!c) throw notFound();
  return c;
};

vi.mock("@googleapis/calendar", () => ({
  auth: { OAuth2: class { setCredentials() {} } },
  calendar: () => ({
    events: {
      list: async ({ calendarId }: { calendarId: string }) => ({ data: { items: [...cal(calendarId).values()] } }),
      get: async ({ calendarId, eventId }: { calendarId: string; eventId: string }) => {
        const e = cal(calendarId).get(eventId);
        if (!e) throw notFound();
        return { data: e };
      },
      insert: async ({ calendarId, requestBody }: { calendarId: string; requestBody: Omit<Ev, "id"> }) => {
        fake.writes.push(calendarId);
        const e = { ...requestBody, id: `ev${Math.random().toString(36).slice(2, 8)}` };
        cal(calendarId).set(e.id, e);
        return { data: e };
      },
      patch: async ({ calendarId, eventId, requestBody }: { calendarId: string; eventId: string; requestBody: Partial<Ev> }) => {
        fake.writes.push(calendarId);
        const e = cal(calendarId).get(eventId);
        if (!e) throw notFound();
        const next = { ...e, ...requestBody };
        cal(calendarId).set(eventId, next);
        return { data: next };
      },
      delete: async ({ calendarId, eventId }: { calendarId: string; eventId: string }) => {
        fake.writes.push(calendarId);
        if (!cal(calendarId).delete(eventId)) throw notFound();
        return { data: {} };
      },
    },
    calendars: {
      insert: async ({ requestBody }: { requestBody: { summary: string } }) => {
        const id = `ai-cal-${++fake.nextCal}`;
        fake.calendars.set(id, new Map());
        fake.names.set(id, requestBody.summary);
        return { data: { id } };
      },
      get: async ({ calendarId }: { calendarId: string }) => {
        cal(calendarId);
        return { data: { id: calendarId, summary: fake.names.get(calendarId) } };
      },
      patch: async ({ calendarId, requestBody }: { calendarId: string; requestBody: { summary: string } }) => {
        fake.names.set(calendarId, requestBody.summary);
        return { data: {} };
      },
      delete: async ({ calendarId }: { calendarId: string }) => fake.calendars.delete(calendarId),
    },
    calendarList: {
      patch: async ({ calendarId, requestBody }: { calendarId: string; requestBody: { backgroundColor: string } }) => {
        fake.colors.set(calendarId, requestBody.backgroundColor);
        return { data: {} };
      },
    },
  }),
}));

const { GoogleCalendar } = await import("@/lib/calendar/google");
const { UnauthorizedError } = await import("@/lib/errors");

const t = (hhmm: string) => `2026-10-28T${hhmm}:00.000Z`;
let saved: string | null;
const store = {
  save: async (id: string) => (saved ??= id),
  clear: async (id: string) => {
    if (saved === id) saved = null;
  },
};
const make = () => new GoogleCalendar("refresh", saved, store, "Asia/Tokyo");

beforeEach(() => {
  fake.calendars = new Map([["primary", new Map([["mtg", { id: "mtg", summary: "MTG", start: { dateTime: t("01:00") }, end: { dateTime: t("02:00") } }]])]]);
  fake.colors.clear();
  fake.names.clear();
  fake.writes = [];
  fake.denyScopes = false;
  fake.nextCal = 0;
  saved = null;
});

describe("GoogleCalendar（AI 専用カレンダー）", () => {
  it("最初の書き込みで専用カレンダーを作り、色を付け、予定はそこに入れる", async () => {
    const g = make();
    const b = await g.create({ title: "課題", start: t("03:00"), end: t("03:30"), energy: "HIGH" });
    expect(saved).toBe("ai-cal-1");
    expect(fake.colors.get("ai-cal-1")).toBeTruthy();
    expect(fake.calendars.get("ai-cal-1")!.has(b.id)).toBe(true);
    expect(b).toMatchObject({ ai: true, energy: "HIGH" });
  });

  it("メインのカレンダーには一切書き込まない", async () => {
    const g = make();
    const b = await g.create({ title: "課題", start: t("03:00"), end: t("03:30") });
    await g.update(b.id, { title: "課題2" });
    await g.remove(b.id);
    expect(fake.writes.every((id) => id !== "primary")).toBe(true);
    // メインの予定 id を指定しても、専用カレンダーで探すので見つからない（メインは変わらない）
    await expect(g.remove("mtg")).rejects.toMatchObject({ code: 404 });
    expect(fake.calendars.get("primary")!.has("mtg")).toBe(true);
  });

  it("一覧はメイン（ai=false）と専用カレンダー（ai=true）を合わせて時刻順に返す", async () => {
    await make().create({ title: "課題", start: t("00:00"), end: t("00:30") });
    const list = await make().list(new Date(t("00:00")), new Date(t("23:00")));
    expect(list.map((b) => [b.title, b.ai])).toEqual([
      ["課題", true],
      ["MTG", false],
    ]);
  });

  it("get はメインの予定を ai=false で返す（AI が「変更できない」と判断できる）", async () => {
    await make().create({ title: "課題", start: t("03:00"), end: t("03:30") });
    expect(await make().get("mtg")).toMatchObject({ title: "MTG", ai: false });
  });

  it("専用カレンダーが Google 側で消されていたら、作り直してから書き込む", async () => {
    await make().create({ title: "1つ目", start: t("03:00"), end: t("03:30") });
    fake.calendars.delete("ai-cal-1");
    const g = make();
    expect(await g.list(new Date(t("00:00")), new Date(t("23:00")))).toHaveLength(1); // メインだけ
    const b = await g.create({ title: "2つ目", start: t("04:00"), end: t("04:30") });
    expect(saved).toBe("ai-cal-2");
    expect(fake.calendars.get("ai-cal-2")!.has(b.id)).toBe(true);
  });

  it("権限が足りない（古いログインのまま）ときは、ログインし直しのエラーにする", async () => {
    fake.denyScopes = true;
    await expect(make().list(new Date(t("00:00")), new Date(t("23:00")))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("専用カレンダーは「AIスケジューラー」で作り、以前の名前のものは名前を変える", async () => {
    await make().create({ title: "課題", start: t("03:00"), end: t("03:30") });
    expect(fake.names.get("ai-cal-1")).toBe("AIスケジューラー");

    // 以前の名前で作られていたカレンダー
    fake.calendars.set("old-cal", new Map());
    fake.names.set("old-cal", "15分スケジューラー");
    saved = "old-cal";
    await make().list(new Date(t("00:00")), new Date(t("23:00")));
    expect(fake.names.get("old-cal")).toBe("AIスケジューラー");
  });
});
