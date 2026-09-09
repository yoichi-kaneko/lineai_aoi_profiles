#!/bin/bash
# Claude Code のセッション開始時に実行環境を用意する（クラウドセッション専用）。
#
# ブラウザ（Claude Code on the web）のセッションは node_modules が無い状態で始まるため、
# `pnpm exec tsx` を使う各スキルや `pnpm test:all` がそのままでは動かない。
# ローカルのターミナルセッションでは既存の node_modules に触れないよう何もしない。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"}"
cd "$PROJECT_DIR"

# CI（.github/workflows/test.yml）と揃える Node.js のメジャーバージョン。
NODE_MAJOR=24

# クラウドコンテナに同梱される Node.js は 20 / 21 / 22 だけで、既定は 22。
# CI と同じメジャーで検査できるよう、nvm で目的のバージョンを導入して既定に据える。
ensure_node_major() {
  local major="$1"

  if [ "$(node -v 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/')" = "$major" ]; then
    return 0
  fi

  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    return 1
  fi
  set +u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh" --no-use
  set -u

  if ! nvm which "$major" >/dev/null 2>&1; then
    nvm install "$major" >&2 || return 1
  fi
  nvm alias default "$major" >/dev/null 2>&1 || return 1

  local bin_dir
  bin_dir="$(dirname "$(nvm which "$major" 2>/dev/null)")" || return 1
  [ -x "$bin_dir/node" ] || return 1

  # Claude Code の Bash ツールはセッション開始時点の PATH を引き継ぐため、
  # このスクリプト内の PATH 変更やシェルの初期化ファイルでは以降のコマンドへ届かない。
  # PATH の先頭にある ~/.local/bin へ symlink を張り、既定の node を差し替える。
  local link_dir="$HOME/.local/bin"
  case ":$PATH:" in
    *":$link_dir:"*)
      mkdir -p "$link_dir"
      local cmd
      for cmd in node npm npx corepack; do
        if [ -x "$bin_dir/$cmd" ]; then
          ln -sfn "$bin_dir/$cmd" "$link_dir/$cmd"
        fi
      done
      ;;
  esac

  export PATH="$bin_dir:$PATH"
}

if ensure_node_major "$NODE_MAJOR"; then
  echo "Node.js $(node -v) を使用します。"
else
  echo "warning: Node.js ${NODE_MAJOR} を用意できませんでした。$(node -v) のまま続行します。" >&2
fi

# ルートで実行すれば functions ワークスペースの依存もあわせて入る。
pnpm install --frozen-lockfile
