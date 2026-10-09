#!/bin/sh
set -eu

# reset でこのファイル自身が更新されても、読み込み済みの処理を最後まで実行する。
deploy() {
  cd "$(dirname "$0")"

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "ERROR: pnpm が見つかりません。事前に Node.js と pnpm を導入してください。" >&2
    exit 1
  fi

  git fetch --depth 1 origin main
  git reset --hard origin/main
  git reflog expire --expire=now --all
  git gc --prune=now --quiet

  exec pnpm install --frozen-lockfile
}

deploy
