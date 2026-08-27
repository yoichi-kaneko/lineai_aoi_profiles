import { describe, expect, it, vi } from "vitest";
import type { Task } from "@doist/todoist-sdk";
import {
  COMPLETED_MAX_PAGES,
  COMPLETED_PAGE_LIMIT,
  fetchTaskIncludingCompleted,
  findTaskById,
  isTaskNotFoundError,
  type TaskLookupApi,
} from "../../src/todoist/get_task.js";

function task(id: string, content: string): Task {
  return { id, content } as Task;
}

function notFound(): Error & { httpStatusCode: number } {
  const error = new Error("Not Found") as Error & { httpStatusCode: number };
  error.httpStatusCode = 404;
  return error;
}

describe("isTaskNotFoundError", () => {
  it("httpStatusCode が 404 なら true", () => {
    expect(isTaskNotFoundError({ httpStatusCode: 404 })).toBe(true);
  });

  it("404 以外は false", () => {
    expect(isTaskNotFoundError({ httpStatusCode: 401 })).toBe(false);
    expect(isTaskNotFoundError(new Error("Not Found"))).toBe(false);
    expect(isTaskNotFoundError(null)).toBe(false);
  });
});

describe("findTaskById", () => {
  it("一致する ID のタスクを返す", () => {
    const tasks = [task("aaa", "A"), task("bbb", "B")];
    expect(findTaskById(tasks, "bbb")?.content).toBe("B");
  });

  it("無ければ undefined", () => {
    expect(findTaskById([task("aaa", "A")], "zzz")).toBeUndefined();
  });
});

describe("fetchTaskIncludingCompleted", () => {
  it("未完了として取れたら完了済みは探さない", async () => {
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => task("abc", "active")),
      getAllCompletedTasks: vi.fn(async () => ({ items: [] })),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).resolves.toMatchObject({
      id: "abc",
      content: "active",
    });
    expect(api.getAllCompletedTasks).not.toHaveBeenCalled();
  });

  it("404 のときは完了済み一覧から ID を照合する", async () => {
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => {
        throw notFound();
      }),
      getAllCompletedTasks: vi.fn(async () => ({
        items: [task("other", "別件"), task("abc", "完了済み")],
      })),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).resolves.toMatchObject({
      id: "abc",
      content: "完了済み",
    });
    expect(api.getAllCompletedTasks).toHaveBeenCalledWith({
      limit: COMPLETED_PAGE_LIMIT,
      offset: 0,
      annotateItems: true,
    });
  });

  it("1ページ目に無ければ次ページを辿る", async () => {
    const firstPage = Array.from({ length: COMPLETED_PAGE_LIMIT }, (_, i) =>
      task(`p0-${i}`, "page0")
    );
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => {
        throw notFound();
      }),
      getAllCompletedTasks: vi.fn(async ({ offset }) => {
        if (offset === 0) {
          return { items: firstPage };
        }
        return { items: [task("abc", "2ページ目")] };
      }),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).resolves.toMatchObject({
      content: "2ページ目",
    });
    expect(api.getAllCompletedTasks).toHaveBeenCalledTimes(2);
    expect(api.getAllCompletedTasks).toHaveBeenNthCalledWith(2, {
      limit: COMPLETED_PAGE_LIMIT,
      offset: COMPLETED_PAGE_LIMIT,
      annotateItems: true,
    });
  });

  it("直近の完了済みにも無ければエラーにする", async () => {
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => {
        throw notFound();
      }),
      getAllCompletedTasks: vi.fn(async () => ({ items: [task("other", "別件")] })),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).rejects.toThrow(/タスクが見つかりません: abc/);
    expect(api.getAllCompletedTasks).toHaveBeenCalledTimes(1);
  });

  it("完了済みの走査は最大ページ数で打ち切る", async () => {
    const fullPage = Array.from({ length: COMPLETED_PAGE_LIMIT }, (_, i) =>
      task(`x-${i}`, "full")
    );
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => {
        throw notFound();
      }),
      getAllCompletedTasks: vi.fn(async () => ({ items: fullPage })),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).rejects.toThrow(/タスクが見つかりません/);
    expect(api.getAllCompletedTasks).toHaveBeenCalledTimes(COMPLETED_MAX_PAGES);
  });

  it("404 以外のエラーは完了済みを探さず再送出する", async () => {
    const api: TaskLookupApi = {
      getTask: vi.fn(async () => {
        throw Object.assign(new Error("Unauthorized"), { httpStatusCode: 401 });
      }),
      getAllCompletedTasks: vi.fn(async () => ({ items: [] })),
    };

    await expect(fetchTaskIncludingCompleted("abc", api)).rejects.toThrow(/Unauthorized/);
    expect(api.getAllCompletedTasks).not.toHaveBeenCalled();
  });
});
