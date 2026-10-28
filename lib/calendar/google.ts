import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { UnauthorizedError, isInvalidGrant } from "../errors";
import type { Block, BlockInput, BlockPatch, Energy } from "../types";
import type { CalendarBackend } from "./types";

// AI が作った予定の目印。Google カレンダー上では extendedProperties.private に入る
const MARK = "ai15";

export class GoogleCalendar implements CalendarBackend {
  private api: calendar_v3.Calendar;
  private calendarId = "primary";

  constructor(refreshToken: string) {
    const client = new auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
    client.setCredentials({ refresh_token: refreshToken });
    this.api = calendar({ version: "v3", auth: client });
  }

  async list(from: Date, to: Date): Promise<Block[]> {
    const res = await guard(() => this.api.events.list({
      calendarId: this.calendarId,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    }));
    return (res.data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map(toBlock)
      .filter((b): b is Block => b !== null);
  }

  async get(id: string): Promise<Block | null> {
    try {
      const res = await guard(() => this.api.events.get({ calendarId: this.calendarId, eventId: id }));
      return res.data.status === "cancelled" ? null : toBlock(res.data);
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async create(input: BlockInput): Promise<Block> {
    const res = await guard(() => this.api.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: input.title,
        start: { dateTime: new Date(input.start).toISOString() },
        end: { dateTime: new Date(input.end).toISOString() },
        extendedProperties: { private: { [MARK]: "1", energy: input.energy ?? "MEDIUM" } },
      },
    }));
    return toBlock(res.data)!;
  }

  async update(id: string, patch: BlockPatch): Promise<Block> {
    const body: calendar_v3.Schema$Event = {};
    if (patch.title !== undefined) body.summary = patch.title;
    if (patch.start) body.start = { dateTime: new Date(patch.start).toISOString() };
    if (patch.end) body.end = { dateTime: new Date(patch.end).toISOString() };
    if (patch.energy) body.extendedProperties = { private: { [MARK]: "1", energy: patch.energy } };
    const res = await guard(() => this.api.events.patch({ calendarId: this.calendarId, eventId: id, requestBody: body }));
    return toBlock(res.data)!;
  }

  async remove(id: string): Promise<void> {
    await guard(() => this.api.events.delete({ calendarId: this.calendarId, eventId: id }));
  }
}

/**
 * Google API 呼び出しの共通処理。リフレッシュトークンが失効していたら
 * （テスト中のアプリは7日で切れる・ユーザーが権限を取り消した）ログインし直しを促す。
 */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isInvalidGrant(err)) throw new UnauthorizedError("Google との接続が切れました。もう一度ログインしてください");
    throw err;
  }
}

function toBlock(e: calendar_v3.Schema$Event): Block | null {
  if (!e.id) return null;
  const priv = e.extendedProperties?.private ?? {};
  const allDay = !e.start?.dateTime;
  // 終日予定は date（YYYY-MM-DD）しか持たないので UTC の0時として扱う（描画では別枠表示）
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
  const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null);
  if (!start || !end) return null;
  return {
    id: e.id,
    title: e.summary ?? "(タイトルなし)",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    ai: priv[MARK] === "1",
    energy: (priv.energy as Energy | undefined) ?? undefined,
    allDay,
  };
}
