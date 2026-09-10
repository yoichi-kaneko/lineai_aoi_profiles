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

# Node.js のバージョンは .nvmrc を正本とし、CI（.github/workflows/test.yml）の
# actions/setup-node も node-version-file で同じファイルを読む。
NODE_VERSION_FILE="$PROJECT_DIR/.nvmrc"

# .nvmrc の内容（例: 24）を返す。空白と改行は取り除く。
read_node_version_spec() {
  local spec
  [ -f "$NODE_VERSION_FILE" ] || return 1
  spec="$(tr -d '[:space:]' < "$NODE_VERSION_FILE")" || return 1
  [ -n "$spec" ] || return 1
  printf '%s\n' "$spec"
}

# "v24.21.0" や "24" からメジャーバージョン（"24"）を取り出す。
version_major() {
  printf '%s\n' "${1#v}" | cut -d. -f1
}

# クラウドコンテナに同梱される Node.js は 20 / 21 / 22 だけで、既定は 22。
# nvm で目的のバージョンを導入し、その bin ディレクトリを標準出力へ返す。
install_node_version() {
  local spec="$1"

  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "error: nvm が見つかりません（${NVM_DIR}）。" >&2
    return 1
  fi
  set +u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh" --no-use
  set -u

  if ! nvm which "$spec" >/dev/null 2>&1; then
    nvm install "$spec" >&2 || return 1
  fi
  nvm alias default "$spec" >/dev/null 2>&1 || return 1

  local node_path
  node_path="$(nvm which "$spec" 2>/dev/null)" || return 1
  [ -x "$node_path" ] || return 1
  dirname "$node_path"
}

# Claude Code の Bash ツールはセッション開始時点の PATH を引き継ぐため、このスクリプト内の
# PATH 変更やシェルの初期化ファイルでは以降のコマンドへ届かない。PATH の先頭にある
# ~/.local/bin へ symlink を張ることで、セッション全体の既定の node を差し替える。
link_node_as_default() {
  local bin_dir="$1"
  local link_dir="$HOME/.local/bin"

  case ":$PATH:" in
    *":$link_dir:"*) ;;
    *)
      echo "error: ${link_dir} が PATH に含まれないため、既定の node を差し替えられません。" >&2
      return 1
      ;;
  esac

  mkdir -p "$link_dir" || return 1
  local cmd
  for cmd in node npm npx corepack; do
    if [ -x "$bin_dir/$cmd" ]; then
      ln -sfn "$bin_dir/$cmd" "$link_dir/$cmd" || return 1
    fi
  done
}

node_ready=0
node_bin=""
node_spec=""
if ! node_spec="$(read_node_version_spec)"; then
  echo "error: ${NODE_VERSION_FILE} を読めないため、Node.js のバージョンを決められません。" >&2
elif [ "$(version_major "$(node -v 2>/dev/null)")" = "$(version_major "$node_spec")" ]; then
  node_ready=1
elif node_bin="$(install_node_version "$node_spec")"; then
  # このスクリプト内の pnpm install も導入した Node.js で実行する。
  export PATH="$node_bin:$PATH"
  if link_node_as_default "$node_bin"; then
    node_ready=1
  fi
fi

# 依存関係の導入は Node.js のメジャーに依らず同じ内容になるため、バージョンを揃えられ
# なかった場合でも実行する。ここを飛ばすと node_modules が無いまま、どのスキルも
# `pnpm test:all` も動かないセッションになり、かえって不完全な状態になる。
# ルートで実行すれば functions ワークスペースの依存もあわせて入る。
pnpm install --frozen-lockfile

if [ "$node_ready" -ne 1 ]; then
  echo "error: .nvmrc の Node.js をセッションの既定にできませんでした。依存関係は $(node -v) で導入済みですが、CI と同じバージョンでの検査はできません。" >&2
  exit 1
fi

echo "Node.js $(node -v) を使用します。"
