import { normalizeMessageText, parseArgs, pushMessagesToDestinations, handleCliError } from "./client";

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const originalContentUrl = remaining[0];
  const durationArg = remaining[1];
  const rawMessage = remaining[2];

  if (!originalContentUrl || !durationArg || !rawMessage) {
    console.error(
      "使用方法: npx tsx src/line/send_audio.ts [--destination user|group|both] <originalContentUrl> <duration> <message>"
    );
    console.error(
      '例: npx tsx src/line/send_audio.ts "https://example.com/song.mp3" "180000" "メッセージ本文"'
    );
    process.exit(1);
  }

  const duration = parseInt(durationArg, 10);
  if (isNaN(duration)) {
    console.error("duration はミリ秒単位の整数で指定してください");
    process.exit(1);
  }

  const message = normalizeMessageText(rawMessage);

  await pushMessagesToDestinations(destination, [
    { type: "audio", originalContentUrl, duration },
    { type: "text", text: message },
  ]);

  console.log("音声とテキストメッセージを送信しました。");
}

main().catch(handleCliError);
