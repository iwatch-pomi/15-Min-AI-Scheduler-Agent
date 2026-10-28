import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { UnauthorizedError, isInsufficientScope, isInvalidGrant } from "../errors";
import type { Block, BlockInput, BlockPatch, Energy } from "../types";
import type { CalendarBackend } from "./types";

/** AI 専用カレンダーの名前と色（Google カレンダー上での表示） */
export const AI_CALENDAR_NAME = "15分スケジューラー";
const AI_CALENDAR_COLOR = "#8e24aa";
const MAIN = "primary";

/** AI 専用カレンダーの id の保存先（ユーザーごと） */
export interface AiCalendarStore {
  /** 保存して、実際に使う id を返す（同時に作られた場合は先に保存された方） */
  save(id: string): Promise<string>;
  /** カレンダーがユーザーに削除されていたときに、保存した id を消す */
  clear(id: string): Promise<void>;
}

/**
 * Google カレンダー。
 * - メインのカレンダーは読むだけ（権限も calendar.events.readonly）。予定は ai=false
 * - AI の予定は、このアプリが作る専用カレンダーに書く（権限は calendar.app.created）。予定は ai=true
 *   専用カレンダーは最初に書き込むときに作る。ユーザーが消していたら作り直す
 */
export class GoogleCalendar implements CalendarBackend {
  private api: calendar_v3.Calendar;

  constructor(
    refreshToken: string,
    private aiCalendarId: string | null,
    private store: AiCalendarStore,
    private timeZone: string,
  ) {
    const client = new auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
    client.setCredentials({ refresh_token: refreshToken });
    this.api = calendar({ version: "v3", auth: client });
  }

  async list(from: Date, to: Date): Promise<Block[]> {
    const [main, ai] = await Promise.all([this.listIn(MAIN, from, to, false), this.listAi(from, to)]);
    return [...main, ...ai].sort((a, b) => a.start.localeCompare(b.start));
  }

  async get(id: string): Promise<Block | null> {
    if (this.aiCalendarId) {
      const block = await this.getIn(this.aiCalendarId, id, true);
      if (block) return block;
    }
    // メインの予定も「変更できない予定」として返す（AI が理由を説明できるように）
    return this.getIn(MAIN, id, false);
  }

  async create(input: BlockInput): Promise<Block> {
    const insert = async (calendarId: string) =>
      guard(() =>
        this.api.events.insert({
          calendarId,
          requestBody: {
            summary: input.title,
            start: { dateTime: new Date(input.start).toISOString() },
            end: { dateTime: new Date(input.end).toISOString() },
            extendedProperties: { private: { energy: input.energy ?? "MEDIUM" } },
          },
        }),
      );
    const calendarId = await this.ensureAiCalendar();
    try {
      return toBlock((await insert(calendarId)).data, true)!;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // 専用カレンダーが Google 側で消されていた → 作り直して1回だけやり直す
      await this.forgetAiCalendar(calendarId);
      return toBlock((await insert(await this.ensureAiCalendar())).data, true)!;
    }
  }

  async update(id: string, patch: BlockPatch): Promise<Block> {
    const body: calendar_v3.Schema$Event = {};
    if (patch.title !== undefined) body.summary = patch.title;
    if (patch.start) body.start = { dateTime: new Date(patch.start).toISOString() };
    if (patch.end) body.end = { dateTime: new Date(patch.end).toISOString() };
    if (patch.energy) body.extendedProperties = { private: { energy: patch.energy } };
    const res = await guard(() => this.api.events.patch({ calendarId: this.requireAiCalendar(), eventId: id, requestBody: body }));
    return toBlock(res.data, true)!;
  }

  async remove(id: string): Promise<void> {
    await guard(() => this.api.events.delete({ calendarId: this.requireAiCalendar(), eventId: id }));
  }

  private async listIn(calendarId: string, from: Date, to: Date, ai: boolean): Promise<Block[]> {
    const res = await guard(() =>
      this.api.events.list({
        calendarId,
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      }),
    );
    return (res.data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => toBlock(e, ai))
      .filter((b): b is Block => b !== null);
  }

  private async listAi(from: Date, to: Date): Promise<Block[]> {
    const id = this.aiCalendarId;
    if (!id) return [];
    try {
      return await this.listIn(id, from, to, true);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.forgetAiCalendar(id);
      return [];
    }
  }

  private async getIn(calendarId: string, eventId: string, ai: boolean): Promise<Block | null> {
    try {
      const res = await guard(() => this.api.events.get({ calendarId, eventId }));
      return res.data.status === "cancelled" ? null : toBlock(res.data, ai);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  private requireAiCalendar(): string {
    if (!this.aiCalendarId) throw Object.assign(new Error("AI 専用カレンダーがまだありません"), { code: 404 });
    return this.aiCalendarId;
  }

  private async ensureAiCalendar(): Promise<string> {
    if (this.aiCalendarId) return this.aiCalendarId;
    const created = await guard(() =>
      this.api.calendars.insert({
        requestBody: {
          summary: AI_CALENDAR_NAME,
          description: "AIスケジュールアシスタント が作成した予定です。このカレンダーの予定は AI が変更することがあります。",
          timeZone: this.timeZone,
        },
      }),
    );
    const newId = created.data.id!;
    const id = await this.store.save(newId);
    if (id !== newId) {
      // 同時に別のリクエストが作っていた → 今作った方は消す
      await guard(() => this.api.calendars.delete({ calendarId: newId })).catch(() => {});
    } else {
      // メインと見分けやすい色にする（失敗しても動作には影響しない）
      await guard(() =>
        this.api.calendarList.patch({ calendarId: id, colorRgbFormat: true, requestBody: { backgroundColor: AI_CALENDAR_COLOR, foregroundColor: "#ffffff" } }),
      ).catch(() => {});
    }
    this.aiCalendarId = id;
    return id;
  }

  private async forgetAiCalendar(id: string) {
    await this.store.clear(id);
    this.aiCalendarId = null;
  }
}

/**
 * Google API 呼び出しの共通処理。ログインし直しが必要なエラーを UnauthorizedError にする。
 * - invalid_grant：リフレッシュトークンの失効（テスト中のアプリは7日で切れる・権限の取り消し）
 * - 権限不足：アプリの更新で必要な権限が増えた、または同意画面で一部の権限を外した
 */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isInvalidGrant(err)) throw new UnauthorizedError("Google との接続が切れました。もう一度ログインしてください");
    if (isInsufficientScope(err)) {
      throw new UnauthorizedError("カレンダーの権限が足りません。もう一度ログインし、すべての項目を許可してください");
    }
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number | string; status?: number }).code ?? (err as { status?: number }).status;
  return code === 404 || code === "404" || code === 410;
}

function toBlock(e: calendar_v3.Schema$Event, ai: boolean): Block | null {
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
    ai,
    energy: ai ? ((priv.energy as Energy | undefined) ?? undefined) : undefined,
    allDay,
    location: e.location ?? undefined,
  };
}
