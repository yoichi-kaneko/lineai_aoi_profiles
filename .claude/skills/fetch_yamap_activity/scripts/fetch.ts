import * as cheerio from "cheerio";
import { chromium } from "playwright";

// URLの検証処理
// 受け付けるフォーマット:
//   - https://yamap.com/activities/{ID}
// それ以外のURLはエラーとして扱う
function validateYamapActivityUrl(url: string): void {
  const pattern = /^https:\/\/yamap\.com\/activities\/\d+$/;

  if (!pattern.test(url)) {
    throw new Error(
      `URLのフォーマットが正しくありません。\n` +
      `受け付けるフォーマット:\n` +
      `  - https://yamap.com/activities/{ID}\n` +
      `指定されたURL: ${url}`,
    );
  }
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("使用方法: npx tsx scripts/fetch.ts <URL>");
    console.error("例: npx tsx scripts/fetch.ts \"https://yamap.com/activities/12345\"");
    process.exit(1);
  }

  // URLの検証
  try {
    validateYamapActivityUrl(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  const html = await page.content();

  await browser.close();

  const $ = cheerio.load(html);
  const lines: string[] = [];

  // 概要
  lines.push("概要");

  const title = $(".ActivityDetailTabLayout__Title").text().trim();
  lines.push(`タイトル: ${title}`);

  const date = $(".ActivityDetailTabLayout__Middle__Date").text().trim();
  const days = $(".ActivityDetailTabLayout__Middle__Days").text().trim();
  lines.push(`日付: ${date} (${days})`);

  const headerImgUrl = $(".ActivityDetailTabLayout__PrintImage").attr("src");
  lines.push(`ヘッダー画像: ${headerImgUrl}`);

  // 活動データやコース定数などからデータを取得
  lines.push("--------");
  lines.push("活動データ");

  $(".ActivityRecord__Item").each((_, item) => {
    const label = $(item).find(".ActivityRecord__Label").text().trim();
    const score = $(item).find(".ActivityRecord__Score").text().trim();
    if (label) {
      lines.push(`${label}: ${score}`);
    }
  });

  const courseHeading = $(".CourseConstant__Heading").text().trim();
  const courseDifficulty = $(".CourseConstant__DifficultyLevel").text().trim();
  const courseValue = $(".CourseConstant__Value").text().trim();
  if (courseHeading) {
    lines.push(`${courseHeading}: ${courseValue} (${courseDifficulty})`);
  }

  console.log(lines.join("\n"));

  // TODO: ここから先は今後実装
  console.log("（データ抽出処理は未実装の項目があります）");
}

main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
