import { RUN_LOG_MODE, isWeeklyRunWindowInTokyoTime } from "./runLogModes";

function main() {
  if (!isWeeklyRunWindowInTokyoTime()) {
    console.error(
      "現在の Asia/Tokyo 時刻は結星（weekly）の実行時間帯ではありません。月曜 00:00-04:59 の間に実行してください。"
    );
    process.exit(1);
  }

  console.log(RUN_LOG_MODE.WEEKLY);
}

main();
