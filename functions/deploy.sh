#!/bin/bash

FUNCTION_NAME=${1:?"Usage: ./deploy.sh <function_name>"}

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
