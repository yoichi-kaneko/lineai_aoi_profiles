import { normalizeMessageText, parseArgs, pushMessagesToDestinations, handleCliError } from "./client";

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const rawMessage = remaining[0];

  if (!rawMessage) {
    console.error("使用方法: npx tsx src/line/send_text.ts [--destination user|group|both] <message>");
    console.error('例: npx tsx src/line/send_text.ts "こんにちは"');
    console.error('例: npx tsx src/line/send_text.ts --destination group "こんにちは"');
    process.exit(1);
  }

  const message = normalizeMessageText(rawMessage);

  await pushMessagesToDestinations(destination, [{ type: "text", text: message }]);

  console.log("メッセージを送信しました。");
}

main().catch(handleCliError);
