async function main() {
  const choices = process.argv.slice(2);

  if (choices.length < 2) {
    console.error("使用方法: npx tsx scripts/choose.ts <選択肢1> <選択肢2> [選択肢3 ...]");
    console.error("例: npx tsx scripts/choose.ts ラーメン カレー うどん");
    process.exit(1);
  }

  const index = Math.floor(Math.random() * choices.length);
  const selected = choices[index];

  console.log(JSON.stringify({
    selected,
    index,
    total: choices.length,
    choices,
  }, null, 2));
}

main().catch((error) => {
  console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
