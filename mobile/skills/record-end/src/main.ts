type RecordEndAction =
  | "load_records"
  | "put_firestore_doc"
  | "exec_ec2_command"
  | "clear_records";

type RecordEndInput = {
  action: RecordEndAction;
  description?: string;
};

type RecordEntry = {
  message: string;
  dateTime: string;
};

declare const __FUNCTION_URL__: string;
declare const __LOCAL_STORAGE_KEY__: string;

/** `mobile/.env` の LOCAL_STORAGE_KEY（ビルド時に `__LOCAL_STORAGE_KEY__` へ注入） */
const LOCAL_STORAGE_KEY = __LOCAL_STORAGE_KEY__.trim();

function getFunctionUrl(): string {
  const functionUrl = __FUNCTION_URL__?.trim();
  if (!functionUrl) {
    throw new Error("FUNCTION_URL is not configured.");
  }
  return functionUrl;
}

function getBearerToken(secret?: string): string {
  const token = secret?.trim();
  if (!token) {
    throw new Error("BEARER_TOKEN (secret) is required.");
  }
  return token;
}

/** 実行環境のローカル時刻ではなく、Asia/Tokyo（JST）の「今日」を YYYY-MM-DD で返す */
function getTodayYmdInJst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to resolve today's date in JST.");
  }
  return `${year}-${month}-${day}`;
}

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

function parseInput(data: string): RecordEndInput {
  const parsed = (data ? JSON.parse(data) : {}) as Partial<RecordEndInput>;
  const action = parsed.action;
  if (
    action !== "load_records" &&
    action !== "put_firestore_doc" &&
    action !== "exec_ec2_command" &&
    action !== "clear_records"
  ) {
    throw new Error(
      "`action` must be one of: load_records, put_firestore_doc, exec_ec2_command, clear_records."
    );
  }

  return {
    action,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return text;
  }
}

async function runLoadRecords(): Promise<unknown> {
  if (!LOCAL_STORAGE_KEY) {
    throw new Error("LOCAL_STORAGE_KEY is not configured.");
  }
  const now = getNowIsoInJst();
  const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
  const records = resolveStoredRecords(existingRaw, now);
  return {
    records,
    count: records.length,
  };
}

async function runPutFirestoreDoc(description: string | undefined, secret?: string): Promise<unknown> {
  const bodyDescription = description?.trim();
  if (!bodyDescription) {
    throw new Error("`description` is required for action=put_firestore_doc.");
  }

  const token = getBearerToken(secret);
  const date = getTodayYmdInJst();
  const url = new URL(`${getFunctionUrl()}/putFireStoreDoc`);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date,
      description: bodyDescription,
    }),
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : response.statusText;
    throw new Error(`putFireStoreDoc failed (${response.status}): ${errMsg}`);
  }

  return {
    date,
    response: body,
  };
}

async function runExecEc2Command(secret?: string): Promise<unknown> {
  const token = getBearerToken(secret);
  const url = new URL(`${getFunctionUrl()}/execEc2Command`);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : response.statusText;
    throw new Error(`execEc2Command failed (${response.status}): ${errMsg}`);
  }
  return body;
}

async function runClearRecords(): Promise<unknown> {
  if (!LOCAL_STORAGE_KEY) {
    throw new Error("LOCAL_STORAGE_KEY is not configured.");
  }
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  return {
    cleared: true,
    key: LOCAL_STORAGE_KEY,
  };
}

async function run(data: string, secret?: string): Promise<string> {
  try {
    const input = parseInput(data);
    let result: unknown;

    switch (input.action) {
      case "load_records":
        result = await runLoadRecords();
        break;
      case "put_firestore_doc":
        result = await runPutFirestoreDoc(input.description, secret);
        break;
      case "exec_ec2_command":
        result = await runExecEc2Command(secret);
        break;
      case "clear_records":
        result = await runClearRecords();
        break;
      default:
        throw new Error(`Unsupported action: ${(input as { action: string }).action}`);
    }

    return JSON.stringify({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to run record-end: ${message}` });
  }
}

declare global {
  interface Window {
    ai_edge_gallery_get_result: (data: string, secret?: string) => Promise<string>;
  }
}

window.ai_edge_gallery_get_result = async (data: string, secret?: string) => run(data, secret);

export {};
