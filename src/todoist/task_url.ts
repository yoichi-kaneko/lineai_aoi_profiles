/**
 * Todoist のタスク URL / タスク ID を、API が受け付ける ID へ正規化する。
 *
 * アプリのタスク URL は `https://app.todoist.com/app/task/{slug}-{id}` 形式で、
 * `{slug}` は content から作られる（content に ASCII が無ければ省略され、
 * 数字だけになることもある）。そのため「最後のハイフン以降」を ID として扱う。
 */

/** URL / ID の指定ミス。CLI ではメッセージを出して終了コード1で終わる。 */
export class TaskUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskUrlError";
  }
}

/** Todoist のタスク ID は英数字のみ（v1 の英数字 ID・旧来の数値 ID の双方） */
const TASK_ID_PATTERN = /^[A-Za-z0-9]+$/;

function extractIdFromSegment(segment: string): string {
  const hyphenIndex = segment.lastIndexOf("-");
  return hyphenIndex === -1 ? segment : segment.slice(hyphenIndex + 1);
}

/**
 * タスク URL またはタスク ID を受け取り、API へ渡す ID を返す。
 * ID がそのまま渡された場合は検証だけ行って返す。
 */
export function parseTaskId(input: string): string {
  const trimmed = (input ?? "").trim();

  if (!trimmed) {
    throw new TaskUrlError("タスクIDまたはタスクURLが指定されていません");
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    if (!TASK_ID_PATTERN.test(trimmed)) {
      throw new TaskUrlError(
        `タスクIDまたはタスクURLとして解釈できません: ${trimmed}（URL は https://app.todoist.com/app/task/... 形式）`
      );
    }
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TaskUrlError(`URL として解釈できません: ${trimmed}`);
  }

  const host = url.hostname.toLowerCase();
  if (host !== "todoist.com" && !host.endsWith(".todoist.com")) {
    throw new TaskUrlError(`Todoist の URL ではありません: ${trimmed}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const taskIndex = segments.lastIndexOf("task");
  if (taskIndex === -1 || taskIndex === segments.length - 1) {
    throw new TaskUrlError(
      `タスクの URL ではありません: ${trimmed}（https://app.todoist.com/app/task/{ID} 形式を想定）`
    );
  }

  const id = extractIdFromSegment(decodeURIComponent(segments[taskIndex + 1]));
  if (!TASK_ID_PATTERN.test(id)) {
    throw new TaskUrlError(`URL からタスクIDを取り出せませんでした: ${trimmed}`);
  }

  return id;
}
