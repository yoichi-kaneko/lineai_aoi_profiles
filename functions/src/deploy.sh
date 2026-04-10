#!/bin/bash

FUNCTION_NAME=${1:?"Usage: ./deploy.sh <function_name>"}

ENV_VARS_FILE="src/${FUNCTION_NAME}/.env.yaml"
ENV_VARS_OPTION=""
if [ -f "${ENV_VARS_FILE}" ]; then
  ENV_VARS_OPTION="--env-vars-file ${ENV_VARS_FILE}"
fi

gcloud functions deploy "${FUNCTION_NAME}" \
  --runtime nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-northeast1 \
  --gen2 \
  --entry-point "${FUNCTION_NAME}" \
  ${ENV_VARS_OPTION} \
  --source .
