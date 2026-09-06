#!/bin/bash
# Claude Code のセッション開始時に依存関係を用意する（クラウドセッション専用）。
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

# ルートで実行すれば functions ワークスペースの依存もあわせて入る。
pnpm install --frozen-lockfile
