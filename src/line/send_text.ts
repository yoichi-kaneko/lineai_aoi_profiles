import { readMessageText, parseArgs, pushMessagesToDestinations, handleCliError } from "./client";

async function main() {
  const { destination, remaining } = parseArgs(process.argv.slice(2));
  const messageFilePath = remaining[0];

  if (!messageFilePath) {
    console.error("使用方法: npx tsx src/line/send_text.ts [--destination user|group|both] <messageFilePath>");
    console.error('例: npx tsx src/line/send_text.ts "tmp/line_message.txt"');
    console.error('例: npx tsx src/line/send_text.ts --destination group "tmp/line_message.txt"');
    process.exit(1);
  }

  const message = readMessageText(messageFilePath);

  await pushMessagesToDestinations(destination, [{ type: "text", text: message }]);

  console.log("メッセージを送信しました。");
}

main().catch(handleCliError);
