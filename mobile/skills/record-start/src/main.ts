type RecordStartInput = {
  date?: string;
};

declare const __FUNCTION_URL__: string;
declare const __LOCAL_STORAGE_KEY__: string;

/** `mobile/.env` の LOCAL_STORAGE_KEY（ビルド時に `__LOCAL_STORAGE_KEY__` へ注入） */
const LOCAL_STORAGE_KEY = __LOCAL_STORAGE_KEY__.trim();

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDate(input: RecordStartInput): string {
  const date = input.date?.trim();
  if (!date) {
    throw new Error("`date` is required (YYYY-MM-DD).");
  }
  if (!isValidDate(date)) {
    throw new Error("`date` must be YYYY-MM-DD format.");
  }
  return date;
}

function getFunctionUrl(): string {
  const functionUrl = __FUNCTION_URL__?.trim();
  if (!functionUrl) {
    throw new Error("FUNCTION_URL is not configured.");
  }
  return functionUrl + '/getFireStoreDocs';
}

async function fetchGetFireStoreDocs(
  date: string,
  bearerToken: string
): Promise<unknown> {
  const base = getFunctionUrl();
  const url = new URL(base);
  url.searchParams.set("date", date);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : response.statusText;
    throw new Error(`getFireStoreDocs failed (${response.status}): ${errMsg}`);
  }

  return body;
}

async function run(data: string, secret?: string): Promise<string> {
  try {
    const token = secret?.trim();
    if (!token) {
      return JSON.stringify({
        error: "BEARER_TOKEN (secret) is required.",
      });
    }

    const parsed = (data ? JSON.parse(data) : {}) as RecordStartInput;
    const date = parseDate(parsed);
    const result = await fetchGetFireStoreDocs(date, token);

    if (LOCAL_STORAGE_KEY) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`localStorage.setItem failed (${LOCAL_STORAGE_KEY}):`, msg);
      }
    }

    return JSON.stringify({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to run record-start: ${message}` });
  }
}

declare global {
  interface Window {
    ai_edge_gallery_get_result: (
      data: string,
      secret?: string
    ) => Promise<string>;
  }
}

window.ai_edge_gallery_get_result = async (data: string, secret?: string) =>
  run(data, secret);

export {};
