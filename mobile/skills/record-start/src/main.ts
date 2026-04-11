type RecordStartInput = {
  date?: string;
  source?: string;
};

type RecordStartResult = {
  date: string;
  source: string;
};

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeInput(input: RecordStartInput): RecordStartResult {
  const date = input.date ?? todayIsoDate();
  if (!isValidDate(date)) {
    throw new Error("`date` must be YYYY-MM-DD format.");
  }

  const source = input.source?.trim() || "manual";

  return { date, source };
}

async function run(data: string): Promise<string> {
  try {
    const parsed = (data ? JSON.parse(data) : {}) as RecordStartInput;
    const normalized = normalizeInput(parsed);

    return JSON.stringify({
      result: `record-start accepted for ${normalized.date} (${normalized.source})`,
      payload: normalized,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to run record-start: ${message}` });
  }
}

declare global {
  interface Window {
    ai_edge_gallery_get_result: (data: string) => Promise<string>;
  }
}

window.ai_edge_gallery_get_result = async (data: string) => run(data);

export {};
