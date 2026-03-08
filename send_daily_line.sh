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
  "push_text_message"
  "list-calendars"
  "search-events"
  "todoist_get_all_tasks"
  "todoist_get_completed_tasks_by_date"
  "todoist_get_comments_by_task_id"
  "todoist_create_task_to_inbox"
  "maps_geocode"
  "get_forecast"
  "get_checkins_by_date_range"
  "get_recent_checkins"
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
TARGET_DATE=$(TZ='Asia/Tokyo' date +%Y-%m-%d)

# 3. モードに応じてトリガーを分岐
if [ "$MODE" = "night" ]; then
  TRIGGER_PROMPT="daily message (小夜): ${TARGET_DATE}"
elif [ "$MODE" = "noon" ]; then
  TRIGGER_PROMPT="daily message (望): ${TARGET_DATE}"
else
  TRIGGER_PROMPT="daily message (暁): ${TARGET_DATE}"
fi

# 4. claude を実行
/usr/bin/claude \
  -p "$TRIGGER_PROMPT" \
  --allowed-tools "$ALLOWED_TOOLS_STR" \
  --permission-mode bypassPermissions
