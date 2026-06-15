import { resolveDailyRunLogModeFromTokyoTime } from "./runLogModes";

function main() {
  const mode = resolveDailyRunLogModeFromTokyoTime();

  if (!mode) {
    console.error(
      "現在の Asia/Tokyo 時刻に該当するデイリーモードがありません。morning (03:00-08:59) / noon (12:00-14:59) / night (20:00-23:59) のいずれかの時間帯で実行してください。"
    );
    process.exit(1);
  }

  console.log(mode);
}

main();
