#!/bin/bash

FUNCTION_NAME=${1:?"Usage: ./deploy.sh <function_name>"}

# package-lock.json の再生成手順を表示する
print_lock_recipe() {
  cat >&2 <<'RECIPE'

package-lock.json を再生成してください。
functions/ の中で直接 npm install を実行すると、pnpm が作った functions/node_modules を
npm が取り込んでしまい、依存が .pnpm へのシンボリックリンクとして記録された
壊れたロックになります。必ず node_modules の無い一時ディレクトリで生成してください。

  cd functions
  TMP=$(mktemp -d)
  cp package.json "$TMP/"
  (cd "$TMP" && npm install --package-lock-only)
  cp "$TMP/package-lock.json" ./package-lock.json
  rm -rf "$TMP"

RECIPE
}

# package-lock.json の健全性を検証する
# Cloud Build は npm ci でインストールするため、ロックが無い・pnpm のリンクを
# 取り込んでいる・package.json とずれている場合は、依存が入らないままビルドが
# 進み tsc: not found などで失敗する。デプロイ前にここで止める。
check_package_lock() {
  if [ ! -f package-lock.json ]; then
    echo "ERROR: functions/package-lock.json がありません。" >&2
    print_lock_recipe
    return 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "WARNING: node が見つからないため package-lock.json の検証をスキップします。" >&2
    return 0
  fi

  node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const entries = lock.packages || {};
const errors = [];

const linked = Object.keys(entries).filter(function (key) {
  return entries[key].link === true || key.indexOf(".pnpm") !== -1;
});
if (linked.length > 0) {
  errors.push("pnpm のシンボリックリンクを取り込んだロックです (" + linked.length + " 件)");
}

const root = entries[""] || {};
["dependencies", "devDependencies"].forEach(function (field) {
  const declared = pkg[field] || {};
  const locked = root[field] || {};
  Object.keys(declared).forEach(function (name) {
    if (locked[name] !== declared[name]) {
      errors.push(field + " の " + name + " が package.json (" + declared[name] + ") とロック (" + (locked[name] || "未登録") + ") で不一致");
    }
  });
  Object.keys(locked).forEach(function (name) {
    if (!(name in declared)) {
      errors.push(field + " の " + name + " がロックにのみ存在");
    }
  });
});

const direct = Object.assign({}, pkg.dependencies, pkg.devDependencies);
Object.keys(direct).forEach(function (name) {
  const entry = entries["node_modules/" + name];
  if (!entry) {
    errors.push(name + " の実体がロックにありません");
  } else if (typeof entry.resolved !== "string" || entry.resolved.indexOf("http") !== 0) {
    errors.push(name + " がレジストリ以外を参照しています: " + (entry.resolved || "resolved なし"));
  }
});

if (errors.length > 0) {
  console.error("ERROR: functions/package-lock.json が不正です。");
  errors.forEach(function (message) {
    console.error("  - " + message);
  });
  process.exit(1);
}
' || {
    print_lock_recipe
    return 1
  }
}

if [ "${SKIP_LOCK_CHECK:-}" != "1" ]; then
  check_package_lock || exit 1
fi

ENV_VARS_FILE="src/${FUNCTION_NAME}/.env.yaml"
ENV_VARS_OPTION=""
if [ -f "${ENV_VARS_FILE}" ]; then
  ENV_VARS_OPTION="--env-vars-file ${ENV_VARS_FILE}"
fi

SECRETS_FILE="src/${FUNCTION_NAME}/.secrets"
SECRETS_OPTION=""
if [ -f "${SECRETS_FILE}" ]; then
  SECRETS_VALUE=$(awk '
    BEGIN { ORS=""; first=1 }
    /^[[:space:]]*$/ { next }
    /^[[:space:]]*#/ { next }
    {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      if (!first) printf ","
      printf "%s", $0
      first=0
    }
  ' "${SECRETS_FILE}")
  if [ -n "${SECRETS_VALUE}" ]; then
    SECRETS_OPTION="--set-secrets ${SECRETS_VALUE}"
  fi
fi

gcloud functions deploy "${FUNCTION_NAME}" \
  --runtime nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-northeast1 \
  --gen2 \
  --entry-point "${FUNCTION_NAME}" \
  ${ENV_VARS_OPTION} \
  ${SECRETS_OPTION} \
  --source .
