#!/bin/bash

FUNCTION_NAME=${1:?"Usage: ./deploy.sh <function_name>"}

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOCK_CHECK="${REPO_ROOT}/scripts/check-functions-lock.mjs"

# package-lock.json の健全性を検証する
# Cloud Build は npm ci でインストールするため、ロックが無い・pnpm のリンクを
# 取り込んでいる・package.json とずれている場合は、依存が入らないままビルドが
# 進み tsc: not found などで失敗する。デプロイ前にここで止める。
# 検証内容と再生成手順は scripts/check-functions-lock.mjs を正本とし、CI の
# pnpm test:all も同じスクリプトを実行する。
check_package_lock() {
  if ! command -v node >/dev/null 2>&1; then
    echo "WARNING: node が見つからないため package-lock.json の検証をスキップします。" >&2
    return 0
  fi

  if [ ! -f "${LOCK_CHECK}" ]; then
    echo "ERROR: ${LOCK_CHECK} がありません。" >&2
    return 1
  fi

  node "${LOCK_CHECK}"
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
