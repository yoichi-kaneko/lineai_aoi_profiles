# Bugbot レビュー指針

レビューコメント・指摘・説明はすべて日本語で書いてください。

レビュー開始前に、次の共通正本を読み、その内容に従ってください。

- [AGENTS.md](../AGENTS.md) の `Code Review Rules`
- [docs/agent/review-policy.md](../docs/agent/review-policy.md)

`node_modules/**`、`functions/dist/**`、`tmp/**` はレビュー対象外です。`pnpm-lock.yaml` の機械生成部分は原則として指摘せず、依存関係変更との不整合や不審な変更だけを確認してください。

`.claude/skills/dev_ship_change/**` と `.claude/skills/dev_apply_pr_review/**` は生成物です。内容の重複レビューはせず、`.agents/skills/` の正本と一致するかを `pnpm agent-config:check` で確認してください。
