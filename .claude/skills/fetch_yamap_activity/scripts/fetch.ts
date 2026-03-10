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

  // チェックポイント通過時間
  lines.push("--------");
  lines.push("チェックポイント通過時間");

  const allDays = $(".ActivitiesId__CourseTime .CourseTime__Item");
  const totalPoints = $(".ActivitiesId__CourseTime .CourseTimeItem__PassedPoint").length;
  let globalPointIndex = 0;
  let isFirst = true;

  allDays.each((_, dayItem) => {
    const dayNumber = $(dayItem).find(".CourseTimeItem__Title__Number").text().trim();
    lines.push(`${dayNumber}日目`);

    $(dayItem).find(".CourseTimeItem__PassedPoints > .CourseTimeItem__PassedPoint").each((_, point) => {
      globalPointIndex++;
      const isLast = globalPointIndex === totalPoints;

      const times = $(point)
        .find("time.CourseTimeItem__PassedPoint__Time")
        .map((_, t) => $(t).text().trim())
        .get();
      const timeStr = times.length >= 2 ? `${times[0]} - ${times[1]}` : (times[0] ?? "");

      const name = $(point).find(".CourseTimeItem__PassedPoint__Name").text().trim().replace(/\s+/g, " ");

      let label: string;
      if (isFirst) {
        label = "行動開始";
        isFirst = false;
      } else if (isLast) {
        label = "行動終了";
      } else {
        label = name;
      }

      lines.push(`${timeStr}: ${label}`);
    });
  });

  // 活動詳細（本文）
  lines.push("--------");
  lines.push("活動詳細（本文）");
  const activityDetail = $(".ActivitiesId__Description__Body").text().trim();
  lines.push(activityDetail);

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
