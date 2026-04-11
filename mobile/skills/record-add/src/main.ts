type RecordAddInput = {
  message: string;
};

type RecordEntry = {
  message: string;
  dateTime: string;
};

declare const __LOCAL_STORAGE_KEY__: string;

/** `mobile/.env` の LOCAL_STORAGE_KEY（ビルド時に `__LOCAL_STORAGE_KEY__` へ注入） */
const LOCAL_STORAGE_KEY = __LOCAL_STORAGE_KEY__.trim();

function getNowIsoInJst(): string {
  const now = new Date();
  const jstMillis = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMillis).toISOString().replace("Z", "+09:00");
}

function stringifyForMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeLegacyEntry(value: unknown, fallbackDateTime: string): RecordEntry {
  if (typeof value === "object" && value !== null) {
    const record = value as { message?: unknown; dateTime?: unknown };
    const message = typeof record.message === "string" ? record.message : stringifyForMessage(value);
    const dateTime =
      typeof record.dateTime === "string" && record.dateTime.trim()
        ? record.dateTime
        : fallbackDateTime;
    return { message, dateTime };
  }

  return {
    message: stringifyForMessage(value),
    dateTime: fallbackDateTime,
  };
}

function resolveStoredRecords(raw: string | null, fallbackDateTime: string): RecordEntry[] {
  if (raw === null) {
    return [];
  }

  if (!raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizeLegacyEntry(item, fallbackDateTime));
    }
    return [normalizeLegacyEntry(parsed, fallbackDateTime)];
  } catch {
    return [{ message: raw, dateTime: fallbackDateTime }];
  }
}

function parseInput(data: string): RecordAddInput {
  const parsed = (data ? JSON.parse(data) : {}) as Partial<RecordAddInput>;
  const message = parsed.message?.trim();
  if (!message) {
    throw new Error("`message` is required.");
  }
  return { message };
}

async function run(data: string): Promise<string> {
  try {
    if (!LOCAL_STORAGE_KEY) {
      return JSON.stringify({ error: "LOCAL_STORAGE_KEY is not configured." });
    }

    const input = parseInput(data);
    const dateTime = getNowIsoInJst();
    const newRecord: RecordEntry = {
      message: input.message,
      dateTime,
    };

    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const records = resolveStoredRecords(existingRaw, dateTime);
    records.push(newRecord);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));

    return JSON.stringify({
      result: {
        appended: newRecord,
        count: records.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to run record-add: ${message}` });
  }
}

declare global {
  interface Window {
    ai_edge_gallery_get_result: (data: string, secret?: string) => Promise<string>;
  }
}

window.ai_edge_gallery_get_result = async (data: string) => run(data);

export {};
