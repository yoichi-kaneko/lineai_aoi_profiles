#!/bin/bash

# ==========================================
# 設定エリア
# ==========================================

# 1. スクリプト自身のディレクトリに移動
cd "$(dirname "$0")" || exit 1

# モードの判定（引数1: morning / night）
MODE=${1:-"morning"}

# 許可するツールのリスト
ALLOWED_TOOLS=(
  "WebSearch"
  "fetch"
  "Bash"
)

# ==========================================
# 処理実行エリア
# ==========================================

# 1. 配列をカンマ区切りの文字列に変換
ALLOWED_TOOLS_STR=$(IFS=,; echo "${ALLOWED_TOOLS[*]}")

# 2. 日本時間 (JST) で日付を取得
TARGET_DATE=$(TZ='JST-9' date +%Y-%m-%d)

# 3. モードに応じてトリガーを分岐
if [ "$MODE" = "night" ]; then
  TRIGGER_PROMPT="daily message (小夜): ${TARGET_DATE}"
elif [ "$MODE" = "noon" ]; then
  TRIGGER_PROMPT="daily message (望): ${TARGET_DATE}"
elif [ "$MODE" = "up_mountain" ]; then
  TRIGGER_PROMPT="daily message (門灯): ${TARGET_DATE}"
elif [ "$MODE" = "off_mountain" ]; then
  TRIGGER_PROMPT="daily message (帰灯): ${TARGET_DATE}"
elif [ "$MODE" = "song" ]; then
  TRIGGER_PROMPT="daily message (調べ): ${TARGET_DATE}"
else
  TRIGGER_PROMPT="daily message (暁): ${TARGET_DATE}"
fi

# 4. morning / noon / night は run_logs を確認し、実行済みならスキップ
if [ "$MODE" = "morning" ] || [ "$MODE" = "noon" ] || [ "$MODE" = "night" ]; then
  HAS_LOG_OUTPUT=$(pnpm exec tsx src/firebase/has_log.ts "$TARGET_DATE" "$MODE")
  HAS_LOG_EXIT=$?

  if [ $HAS_LOG_EXIT -ne 0 ]; then
    if [ "$FORCE_CONTINUE" = "true" ]; then
      echo "[WARN] run_logs の確認に失敗しました (exit: ${HAS_LOG_EXIT})。FORCE_CONTINUE=true のため処理を続行します。MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    else
      echo "[ERROR] run_logs の確認に失敗しました (exit: ${HAS_LOG_EXIT})。二重送信防止のため処理を中断します。続行する場合は FORCE_CONTINUE=true を設定してください。MODE=${MODE}, DATE=${TARGET_DATE}" >&2
      exit $HAS_LOG_EXIT
    fi
  elif [ "$HAS_LOG_OUTPUT" = "true" ]; then
    echo "[INFO] 本日の ${MODE} は実行済みのためスキップします。DATE=${TARGET_DATE}" >&2
    exit 0
  fi
fi

# 5. claude を実行（タイムアウト: 通常1800秒 / 調べモード2700秒 / リトライ: 最大2回）
# 調べモードは楽曲生成の非同期待機（sleep 300 × 最大3回）があるため長めに設定
MAX_RETRIES=2
if [ "$MODE" = "song" ]; then
  TIMEOUT_SEC=2700
else
  TIMEOUT_SEC=1800
fi
EXIT_CODE=0

for i in $(seq 1 $MAX_RETRIES); do
  timeout $TIMEOUT_SEC /home/ec2-user/.local/bin/claude \
    -p "$TRIGGER_PROMPT" \
    --allowed-tools "$ALLOWED_TOOLS_STR" \
    --permission-mode bypassPermissions
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    break
  elif [ $EXIT_CODE -eq 124 ]; then
    echo "[WARN] Attempt $i timed out (${TIMEOUT_SEC}s). Retrying..." >&2
  else
    echo "[WARN] Attempt $i failed (exit: $EXIT_CODE). Retrying..." >&2
  fi

  [ $i -lt $MAX_RETRIES ] && sleep 30
done

if [ $EXIT_CODE -ne 0 ]; then
  echo "[ERROR] All $MAX_RETRIES attempts failed. MODE=${MODE}, DATE=${TARGET_DATE}" >&2
  exit $EXIT_CODE
fi
