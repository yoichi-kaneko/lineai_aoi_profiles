import { readFileSync } from "fs";

/** テキストを保存したファイルを読み込んで返す */
export function readTextFile(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(
      `テキストファイルを読み込めませんでした: ${filePath}`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
