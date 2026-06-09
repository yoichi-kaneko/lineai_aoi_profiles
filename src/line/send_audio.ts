import { readMessageText, parseArgs, pushMessagesToDestinations, handleCliError } from "./client";

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const originalContentUrl = remaining[0];
  const durationArg = remaining[1];
  const messageFilePath = remaining[2];

  if (!originalContentUrl || !durationArg || !messageFilePath) {
    console.error(
      "使用方法: npx tsx src/line/send_audio.ts [--destination user|group|both] <originalContentUrl> <duration> <messageFilePath>"
    );
    console.error(
      '例: npx tsx src/line/send_audio.ts "https://example.com/song.mp3" "180000" "tmp/line_message.txt"'
    );
    process.exit(1);
  }

  const duration = parseInt(durationArg, 10);
  if (isNaN(duration)) {
    console.error("duration はミリ秒単位の整数で指定してください");
    process.exit(1);
  }

  const message = readMessageText(messageFilePath);

  await pushMessagesToDestinations(destination, [
    { type: "audio", originalContentUrl, duration },
    { type: "text", text: message },
  ]);

  console.log("音声とテキストメッセージを送信しました。");
}

main().catch(handleCliError);
