import { resolve } from "path";
import { fileURLToPath } from "url";
import { createTwitterClient, handleCliError, readMessageText } from "./client";

// src/twitter/ -> src/ -> project root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "../../");

async function main() {
  const textFilePath = process.argv[2];
  const imageFilePath = process.argv[3];

  if (!textFilePath) {
    console.error("使用方法: npx tsx src/twitter/post.ts <textFilePath> [imageFilePath]");
    console.error('例: npx tsx src/twitter/post.ts "tmp/twitter_message.txt"');
    console.error('例: npx tsx src/twitter/post.ts "tmp/twitter_message.txt" "tmp/image.png"');
    process.exit(1);
  }

  const text = readMessageText(textFilePath).trim();
  if (!text) {
    console.error("テキストが空です");
    process.exit(1);
  }

  const client = createTwitterClient();

  if (imageFilePath) {
    const absoluteImagePath = resolve(projectRoot, imageFilePath);
    const mediaId = await client.v1.uploadMedia(absoluteImagePath);
    const result = await client.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    });
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  const result = await client.v2.tweet(text);
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch(handleCliError);
