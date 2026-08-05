#!/bin/bash

# ==========================================
# 設定エリア
# ==========================================

# 1. スクリプト自身のディレクトリに移動
cd "$(dirname "$0")" || exit 1

# モードの判定（引数1: morning / night）
MODE=${1:-"morning"}

# claude バイナリのパス
CLAUDE_BIN="/home/ec2-user/.local/bin/claude"

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

# 共通: run_logs（二重実行防止）の対象モードかどうかを判定する
# 許可される mode 値は src/firebase/runLogModes.ts の RUN_LOG_MODE を正とする
is_run_log_mode() {
  case "$1" in
    morning | noon | night) return 0 ;;
    *) return 1 ;;
  esac
}

# 共通: claude を timeout 付きで実行するヘルパー
# 使い方: run_claude "<trigger>" "<effort>" "<timeout_sec>"
run_claude() {
  local trigger="$1"
  local effort="$2"
  local tmo="$3"
  timeout "$tmo" "$CLAUDE_BIN" \
    -p "$trigger" \
    --effort "$effort" \
    --allowed-tools "$ALLOWED_TOOLS_STR" \
    --permission-mode bypassPermissions
}

# 3. モードに応じてトリガーを分岐
if [ "$MODE" = "night" ]; then
  TRIGGER_PROMPT="daily message (小夜): ${TARGET_DATE}"
elif [ "$MODE" = "noon" ]; then
  TRIGGER_PROMPT="daily message (望): ${TARGET_DATE}"
elif [ "$MODE" = "up_mountain" ]; then
  TRIGGER_PROMPT="daily message (門灯): ${TARGET_DATE}"
elif [ "$MODE" = "stay_mountain" ]; then
  TRIGGER_PROMPT="daily message (継灯): ${TARGET_DATE}"
elif [ "$MODE" = "off_mountain" ]; then
  TRIGGER_PROMPT="daily message (帰灯): ${TARGET_DATE}"
elif [ "$MODE" = "song" ]; then
  TRIGGER_PROMPT="daily message (調べ): ${TARGET_DATE}"
else
  TRIGGER_PROMPT="daily message (暁): ${TARGET_DATE}"
fi

# 3-2. モードに応じて effort レベルを決定
# 画像・楽曲などファイル生成を伴うモード（小夜・帰灯・調べ）は xhigh、それ以外は medium に抑える
if [ "$MODE" = "night" ] || [ "$MODE" = "off_mountain" ] || [ "$MODE" = "song" ]; then
  EFFORT="xhigh"
else
  EFFORT="medium"
fi

# 4. morning / noon / night は run_logs を確認し、実行済みならスキップ
if is_run_log_mode "$MODE"; then
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

# 5-song. 調べ（song）モードは2フェーズ + シェル待機で実行する
# ------------------------------------------------------------------
# headless（claude -p）では「バックグラウンドに sleep を投げてターンを終える／
# ウェイクアップを待つ」パターンが silent failure（exit 0 で何も送られない）に
# つながるため、楽曲生成完了の待機をエージェントの外（純粋な bash sleep）へ出す。
#
#   フェーズA（claude -p / 調べ）   : 情報収集〜作曲開始。task_id・送信本文・song_logs を書き出す
#   シェル待機                       : sleep 300 × 最大3回で楽曲をダウンロード
#   フェーズB（claude -p / 調べ送信）: ダウンロード済み楽曲 + 本文を LINE 送信し成功マーカーを残す
#   検証                             : 成功マーカーが無ければ非ゼロ終了（silent failure を検知）
# ------------------------------------------------------------------
if [ "$MODE" = "song" ]; then
  PHASE_A_TRIGGER="daily message (調べ): ${TARGET_DATE}"
  PHASE_B_TRIGGER="daily message (調べ送信): ${TARGET_DATE}"
  PHASE_A_TIMEOUT=1800
  PHASE_B_TIMEOUT=900
  PHASE_A_RETRIES=2
  DOWNLOAD_ATTEMPTS=3
  DOWNLOAD_INTERVAL=300

  TASK_ID_FILE="tmp/song_task_id.txt"
  MESSAGE_FILE="tmp/song_message.txt"
  AUDIO_PATH_FILE="tmp/song_audio_path.txt"
  LOG_MARKER="tmp/song_log.ok"
  SENT_MARKER="tmp/song_sent.ok"

  # ---- フェーズA: 情報収集〜作曲開始（task_id・送信本文・song_logs の生成） ----
  PHASE_A_OK=false
  for i in $(seq 1 $PHASE_A_RETRIES); do
    # フェーズA再試行ごとに tmp/ を掃除（待機・送信へ進む前のみ。フェーズ間では掃除しない）
    bash refresh_tmp.sh >&2

    run_claude "$PHASE_A_TRIGGER" "xhigh" "$PHASE_A_TIMEOUT"
    PHASE_A_RC=$?

    if [ $PHASE_A_RC -ne 0 ]; then
      echo "[WARN] song Phase A attempt $i failed (exit: $PHASE_A_RC). Retrying..." >&2
      [ $i -lt $PHASE_A_RETRIES ] && sleep 30
      continue
    fi

    if [ -s "$TASK_ID_FILE" ] && [ -s "$MESSAGE_FILE" ] && [ -f "$LOG_MARKER" ]; then
      PHASE_A_OK=true
      break
    fi

    echo "[WARN] song Phase A attempt $i missing Phase B prerequisites (${TASK_ID_FILE}, ${MESSAGE_FILE}, and/or ${LOG_MARKER}). Retrying..." >&2
    [ $i -lt $PHASE_A_RETRIES ] && sleep 30
  done

  if [ "$PHASE_A_OK" != "true" ]; then
    echo "[ERROR] song Phase A failed (missing task_id, message, or song_logs marker after ${PHASE_A_RETRIES} attempts). MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    exit 1
  fi

  TASK_ID=$(tr -d ' \t\r\n' < "$TASK_ID_FILE")
  echo "[INFO] song Phase A done. task_id=${TASK_ID}" >&2

  # ---- 待機とダウンロード（純粋な bash sleep。headless でも確実に待てる） ----
  # ここから先は refresh_tmp を呼ばない（task_id / 本文 / 楽曲パスを保持するため）
  SONG_AUDIO_PATH=""
  for i in $(seq 1 $DOWNLOAD_ATTEMPTS); do
    echo "[INFO] song download attempt ${i}/${DOWNLOAD_ATTEMPTS}: sleeping ${DOWNLOAD_INTERVAL}s..." >&2
    sleep "$DOWNLOAD_INTERVAL"

    DL_OUT=$(pnpm exec tsx src/mureka/download_audio.ts "$TASK_ID" 2>&1)
    echo "$DL_OUT" >&2

    # download_audio.ts は成功時に {"savedPath": "/abs/path/...mp3"} を返す
    SONG_AUDIO_PATH=$(printf '%s\n' "$DL_OUT" | sed -n 's/.*"savedPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    if [ -n "$SONG_AUDIO_PATH" ] && [ -f "$SONG_AUDIO_PATH" ]; then
      echo "[INFO] song downloaded: ${SONG_AUDIO_PATH}" >&2
      break
    fi
    SONG_AUDIO_PATH=""
  done

  if [ -z "$SONG_AUDIO_PATH" ]; then
    echo "[ERROR] song download failed after ${DOWNLOAD_ATTEMPTS} attempts. task_id=${TASK_ID}, DATE=${TARGET_DATE}" >&2
    # 楽曲ダウンロード失敗を Firestore へ記録（手動確認用）
    {
      echo "調べモードの楽曲ダウンロードが${DOWNLOAD_ATTEMPTS}回失敗しました。"
      echo "task_id: ${TASK_ID}"
      echo "対象日: ${TARGET_DATE}"
      echo "再試行または手動確認が必要です。"
    } > tmp/firestore_doc.txt
    pnpm exec tsx src/firebase/put_doc.ts "$TARGET_DATE" "song_download_failed" \
      --collection operation_logs --description-file tmp/firestore_doc.txt >&2 \
      || echo "[WARN] Firestore への楽曲ダウンロード失敗記録に失敗しました。" >&2
    exit 1
  fi

  # フェーズBへ楽曲パスを受け渡す
  printf '%s' "$SONG_AUDIO_PATH" > "$AUDIO_PATH_FILE"

  # ---- フェーズB: LINE送信（音声+テキスト） ----
  # 二重送信を避けるため自動リトライはしない。送信成否は成功マーカーで検証する。
  rm -f "$SENT_MARKER"
  run_claude "$PHASE_B_TRIGGER" "medium" "$PHASE_B_TIMEOUT"
  PHASE_B_RC=$?

  if [ -f "$SENT_MARKER" ]; then
    echo "[INFO] song sent successfully. MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    exit 0
  fi

  # マーカーが無い = 送信できていない（exit 0 でも silent failure として検知）
  echo "[ERROR] song Phase B did not produce send marker (${SENT_MARKER}). exit=${PHASE_B_RC}, MODE=${MODE}, DATE=${TARGET_DATE}" >&2
  exit 1
fi

# 5. claude を実行（タイムアウト: 1800秒 / リトライ: 最大2回）
# ※ 調べ（song）モードは上の専用ブロックで処理済みのため、ここには到達しない
MAX_RETRIES=2
TIMEOUT_SEC=1800
EXIT_CODE=0

for i in $(seq 1 $MAX_RETRIES); do
  # 各試行の冒頭で tmp/ を掃除し、前プロセス・前試行の残骸を残さない
  # （碧衣が古い一時ファイルを検知・内容確認する無駄を防ぐ）
  bash refresh_tmp.sh >&2

  run_claude "$TRIGGER_PROMPT" "$EFFORT" "$TIMEOUT_SEC"
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

# 6. morning / noon / night は実行ログを run_logs に記録する
# ------------------------------------------------------------------
# ステップ4の実行前チェック（has_log.ts）が参照するのはこのログだが、headless 実行には
# put_log.ts を呼ぶ経路が存在せず、当日分のログが残らないままだった（対話モードの
# run_aoi_daily / run_aoi_scribe スキルのみが記録していた）。そのため cron の再発火や
# 手動再実行に対して実行前スキップが機能していなかった。
#
# これは「claude が exit 0 で完了した」という事後記録であり、排他制御や原子的な実行予約の
# 代替ではない（README「二重実行防止」参照）。リトライループ内での二重送信抑止は別課題
# （issue #21）として扱う。
# ------------------------------------------------------------------
if is_run_log_mode "$MODE"; then
  if pnpm exec tsx src/firebase/put_log.ts "$TARGET_DATE" "$MODE" >&2; then
    :
  else
    put_log_status=$?
    if [ "$put_log_status" -eq 124 ]; then
      echo "[WARN] run_logs への書き込みはタイムアウトしました。結果不明のため、確認なしに再実行しないでください。MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    else
      echo "[WARN] run_logs への実行ログ記録に失敗しました。次回の実行前スキップが効かない可能性があります。MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    fi
  fi
fi
