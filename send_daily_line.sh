#!/bin/bash

# ==========================================
# 設定エリア
# ==========================================

# 1. スクリプト自身のディレクトリに移動
cd "$(dirname "$0")" || exit 1

# モードの判定（引数1: morning / night など）
# 響（talk）モードのみ、応答対象を特定するために引数2・3を必要とする。
#   send_daily_line.sh talk <対象ドキュメントID> <投稿日(YYYY-MM-DD)>
MODE=${1:-"morning"}
TARGET_DOC_ID=${2:-""}
POSTED_DATE=${3:-""}

# 廃止済み・未対応のモードを暁モードとして誤起動しないよう、
# トリガーの組み立てより前に許可値を検証する。
case "$MODE" in
  morning | noon | night | up_mountain | stay_mountain | off_mountain | talk) ;;
  *)
    echo "[ERROR] 未対応のモードです。MODE=${MODE}" >&2
    exit 1
    ;;
esac

# claude バイナリのパス（検証時にスタブへ差し替えられるよう環境変数で上書き可）
CLAUDE_BIN="${CLAUDE_BIN:-/home/ec2-user/.local/bin/claude}"

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

# 2-2. 響（talk）モードの起動情報を検証する
# ------------------------------------------------------------------
# Cloud Functions から SSM 経由で渡される対象ドキュメントIDと投稿日を、シェル側でも
# 検証する。値が欠けている・書式が不正な場合は、別のメッセージを代用して応答させない
# ため、claude を起動せずに終了する。日付は投稿日を基準にすることで、日跨ぎの起動でも
# 元のメッセージを読めるようにする。本文はここへ渡さず、ログにも出さない。
# ------------------------------------------------------------------
if [ "$MODE" = "talk" ]; then
  if ! printf '%s' "$TARGET_DOC_ID" | grep -Eq '^[A-Za-z0-9_-]{1,128}$'; then
    echo "[ERROR] talk モードには対象ドキュメントIDが必要です（英数字・ハイフン・アンダースコアのみ）。MODE=${MODE}" >&2
    exit 1
  fi
  if ! printf '%s' "$POSTED_DATE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    echo "[ERROR] talk モードには投稿日(YYYY-MM-DD)が必要です。MODE=${MODE}" >&2
    exit 1
  fi
  # 書式だけでなく実在する暦日かを検証する（2026-02-30 などを拒否）
  # EC2 は GNU date、-d が無い環境（macOS 等）は BSD date -j にフォールバックする
  parsed_date=""
  if parsed_date=$(date -d "$POSTED_DATE" +%F 2>/dev/null); then
    :
  elif parsed_date=$(TZ=UTC date -j -f "%Y-%m-%d" "$POSTED_DATE" +%F 2>/dev/null); then
    :
  else
    echo "[ERROR] talk モードの投稿日が不正です（存在する日付を YYYY-MM-DD で指定）。MODE=${MODE}" >&2
    exit 1
  fi
  if [ "$parsed_date" != "$POSTED_DATE" ]; then
    echo "[ERROR] talk モードの投稿日が不正です（存在する日付を YYYY-MM-DD で指定）。MODE=${MODE}" >&2
    exit 1
  fi
  # 響の基準日は「実行日」ではなく「呼びかけが届いた日」
  TARGET_DATE="$POSTED_DATE"
fi

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
elif [ "$MODE" = "talk" ]; then
  TRIGGER_PROMPT="daily message (響): ${TARGET_DATE} target_doc_id=${TARGET_DOC_ID}"
else
  TRIGGER_PROMPT="daily message (暁): ${TARGET_DATE}"
fi

# 3-2. モードに応じて effort レベルを決定
# 画像生成を伴うモード（小夜・帰灯）は xhigh、それ以外は medium に抑える
# 響（talk）は依頼によって画像生成まで含みうるため xhigh とする
if [ "$MODE" = "night" ] || [ "$MODE" = "off_mountain" ] || [ "$MODE" = "talk" ]; then
  EFFORT="xhigh"
else
  EFFORT="medium"
fi

# 3-3. tmp/ を使う処理全体を直列化する
# ------------------------------------------------------------------
# 複数のスキルが `tmp/line_message.txt` `tmp/firestore_doc.txt` などの固定名を使い、
# 各試行の冒頭で refresh_tmp.sh が tmp/ を掃除する。響（talk）は同日に何度でも起動でき、
# 定期モードと重なることもあるため、そのまま並走すると互いの一時ファイルを消去・上書き
# してしまう。ここで排他ロックを取り、実行そのものを直列化することで衝突を防ぐ。
#
# これは作業領域の直列化であり、二重実行そのものを防ぐ機構ではない（待っている実行は
# 順番が来れば実行される）。二重送信の抑止は従来どおり run_logs のベストエフォートに委ねる。
# ------------------------------------------------------------------
mkdir -p tmp
LOCK_FILE="tmp/.runner.lock"
LOCK_WAIT_SEC=${RUNNER_LOCK_WAIT_SEC:-3600}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE" || {
    echo "[ERROR] ロックファイルを開けませんでした: ${LOCK_FILE}" >&2
    exit 1
  }
  if ! flock -w "$LOCK_WAIT_SEC" 9; then
    echo "[ERROR] 他の実行が tmp/ を使用中で、${LOCK_WAIT_SEC}秒待っても解放されませんでした。作業領域の衝突を避けるため中断します。MODE=${MODE}, DATE=${TARGET_DATE}" >&2
    exit 1
  fi
else
  echo "[WARN] flock が見つからないため実行の直列化を行いません。他の実行と重なると tmp/ の一時ファイルが競合する可能性があります。MODE=${MODE}" >&2
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


# 5. claude を実行（タイムアウト: 1800秒 / リトライ: 最大2回）
MAX_RETRIES=2
TIMEOUT_SEC=1800
EXIT_CODE=0

for i in $(seq 1 $MAX_RETRIES); do
  # 各試行の冒頭で tmp/ を掃除し、前プロセス・前試行の残骸を残さない
  # （碧衣が古い一時ファイルを検知・内容確認する無駄を防ぐ）
  bash refresh_tmp.sh >&2 || exit 1

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
