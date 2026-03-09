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

  // TODO: ここから先は今後実装
  // html変数にレンダリング済みのHTMLが格納されています。
  // cheerio等を使用してデータを抽出する処理を実装してください。
  console.log("HTMLの取得が完了しました（データ抽出処理は未実装です）。");
  console.log(`取得したHTMLのサイズ: ${html.length} 文字`);
}

main().catch((error) => {
  console.error("エラーが発生しました:", error);
  process.exit(1);
});
