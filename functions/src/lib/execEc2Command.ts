import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

/**
 * 起動対象のメッセージ（響モードの「今回の依頼」）。
 *
 * `docId` は `notes` へ保存した `line_text` のドキュメントID、`postedDate` は
 * LINE イベントの timestamp を基準にした JST の暦日（YYYY-MM-DD）。
 * 日跨ぎで起動しても投稿日の記録から対象を引けるように、両方を渡す。
 */
export interface Ec2CommandTarget {
  docId: string;
  postedDate: string;
}

const MODE_PATTERN = /^[a-z][a-z0-9_]*$/;
/** Firestore の自動生成ドキュメントIDは英数20文字。手動採番も想定して幅を持たせる。 */
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MODE_PLACEHOLDER = "{MODE}";
const TARGET_DOC_ID_PLACEHOLDER = "{TARGET_DOC_ID}";
const POSTED_DATE_PLACEHOLDER = "{POSTED_DATE}";

function replaceAll(text: string, placeholder: string, value: string): string {
  return text.split(placeholder).join(value);
}

/**
 * コマンドテンプレートへ起動情報を埋め込む。
 *
 * 埋め込む値は事前に検証済みのものだけを受け取る（LINE 本文など任意の文字列は渡さない）。
 * `target` が必要なモードでテンプレートに受け取り口が無い場合は、ID・投稿日が失われたまま
 * 起動してしまうため例外を投げる（Functions だけ先に更新された配備順を検知するため）。
 */
export function buildEc2Command(
  template: string,
  mode: string,
  target?: Ec2CommandTarget,
): string {
  if (!MODE_PATTERN.test(mode)) {
    throw new Error(`Invalid mode for EC2 command: ${mode}`);
  }

  if (target) {
    if (!DOC_ID_PATTERN.test(target.docId)) {
      throw new Error("Invalid target document id for EC2 command");
    }
    if (!DATE_PATTERN.test(target.postedDate)) {
      throw new Error("Invalid target posted date for EC2 command");
    }
    if (
      !template.includes(TARGET_DOC_ID_PLACEHOLDER) ||
      !template.includes(POSTED_DATE_PLACEHOLDER)
    ) {
      throw new Error(
        `EC2_COMMAND_TEMPLATE must contain ${TARGET_DOC_ID_PLACEHOLDER} and ` +
          `${POSTED_DATE_PLACEHOLDER} to trigger mode ${mode}`,
      );
    }
  }

  let command = replaceAll(template, MODE_PLACEHOLDER, mode);
  command = replaceAll(command, TARGET_DOC_ID_PLACEHOLDER, target?.docId ?? "");
  command = replaceAll(command, POSTED_DATE_PLACEHOLDER, target?.postedDate ?? "");
  return command;
}

export async function execEc2Command(mode: string, target?: Ec2CommandTarget): Promise<void> {
  const requiredEnv = [
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "AWS_REGION",
    "EC2_INSTANCE_ID",
    "EC2_COMMAND_TEMPLATE",
  ] as const;
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  const command = buildEc2Command(process.env.EC2_COMMAND_TEMPLATE!, mode, target);

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY!,
      secretAccessKey: process.env.AWS_SECRET_KEY!,
    },
  });

  await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [process.env.EC2_INSTANCE_ID!],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [command],
      },
    })
  );
}
