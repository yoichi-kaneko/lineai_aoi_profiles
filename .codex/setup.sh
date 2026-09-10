#!/bin/bash
# Codex cloud のセッション開始時に、CI と同じ Node.js と依存関係を用意する。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "error: nvm が見つかりません（${NVM_DIR}）。" >&2
  exit 1
fi

set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
set -u

# .nvmrc を唯一のバージョン指定として、未導入ならダウンロードする。
nvm install
nvm use
NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
nvm alias default "$NODE_VERSION" >/dev/null

# 前回の setup で作ったリンクが壊れていても、以降は nvm が選んだ実体を優先する。
NODE_BIN_DIR="$(dirname "$(nvm which "$NODE_VERSION")")"
export PATH="$NODE_BIN_DIR:$PATH"

corepack enable

# setup.sh の PATH 変更は後続の Codex シェルへ引き継がれないため、Codex が PATH の
# 先頭に用意するディレクトリへ実体の symlink を置く。
CODEX_PATH_DIR="${CODEX_PATH_DIR:-/opt/codex/codex-path}"
if [ ! -d "$CODEX_PATH_DIR" ]; then
  echo "error: Codex のコマンド配置先が見つかりません（${CODEX_PATH_DIR}）。" >&2
  exit 1
fi
if [ ! -w "$CODEX_PATH_DIR" ]; then
  echo "error: Codex のコマンド配置先へ書き込めません（${CODEX_PATH_DIR}）。" >&2
  exit 1
fi

for command_name in node npm npx corepack pnpm pnpx; do
  if [ -x "$NODE_BIN_DIR/$command_name" ]; then
    ln -sfn "$NODE_BIN_DIR/$command_name" "$CODEX_PATH_DIR/$command_name"
  fi
done

pnpm install --frozen-lockfile

printf 'Node.js %s を使用します。\n' "$(node -v)"
