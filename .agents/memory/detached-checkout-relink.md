---
name: Detached checkout breaks workspace links
description: Why the web app shows "Failed to resolve import @workspace/..." after a git checkout, and the fix.
---

After switching the monorepo to a different commit (e.g. detached HEAD), Vite can fail with `Failed to resolve import "@workspace/<pkg>"` even though the package exists at that commit.

**Why:** pnpm's node_modules links were built for the previous commit's workspace layout; the checkout does not refresh them.

**How to apply:** Run `pnpm install` at the repo root after any checkout that changes workspace packages, then restart the affected artifact workflows. Verify the package exists under the checked-out tree before suspecting missing code.
