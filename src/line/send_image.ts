import { normalizeMessageText, parseArgs, pushMessagesToDestinations, handleCliError } from "./client";

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const originalContentUrl = remaining[0];
  const previewImageUrl = remaining[1];
  const rawMessage = remaining[2];

  if (!originalContentUrl || !previewImageUrl || !rawMessage) {
    console.error(
      "使用方法: npx tsx src/line/send_image.ts [--destination user|group|both] <originalContentUrl> <previewImageUrl> <message>"
    );
    console.error(
      '例: npx tsx src/line/send_image.ts "https://example.com/image.jpg" "https://example.com/preview.jpg" "メッセージ本文"'
    );
    process.exit(1);
  }

  const message = normalizeMessageText(rawMessage);

  await pushMessagesToDestinations(destination, [
    { type: "image", originalContentUrl, previewImageUrl },
    { type: "text", text: message },
  ]);

  console.log("画像とテキストメッセージを送信しました。");
}

main().catch(handleCliError);
