
# SHOPLINE Quantity Breaks - Codex Project Rules

## Skills

Use installed skills according to their actual instructions:

- Superpowers: requirements, planning, TDD, debugging, reviews.
- UI UX Pro Max: design system, UX, responsive design.
- Frontend Design: UI components and visual implementation.

## UI Fidelity Rules

1. Shopify 原应用是 UI/UX 参考基准。UI UX Pro Max 和 Frontend Design 只能辅助分析与实现，不允许擅自重新设计参考界面。

2. 每个页面必须同时满足视觉还原与功能验收。必须保留参考截图和本地截图，不能只凭代码检查判断完成。

3. 每次开发完成一个页面后，必须更新 APP_PROGRESS.md，并自动继续下一个未验收页面。禁止因为部分页面完成就宣称整个应用已完成。

4. 优先复用共享组件和 Design Tokens，确保新页面与已完成页面风格一致。

5. 任何未实际访问、未实际执行或未实际测试的功能，不得标记为已验证。

6. 仅在用户明确确认后允许执行 git push。未经确认可以继续本地开发和测试。
7. 后续 CSS 不得新增或修改 `:focus`、`:focus-visible` 及相关焦点伪类规则；除非用户在具体任务中明确要求。


## Requirements

Read and follow:
- REQUIREMENTS.md
- DESIGN_SPEC.md
- USER_FLOWS.md
- COMPONENTS.md

Audit missing features and inconsistent requirements.
Do not invent SHOPLINE API capabilities.
Do not silently change confirmed business rules.

## SHOPLINE Admin Request Rules

All store-scoped SHOPLINE Admin REST and Admin GraphQL requests in the Worker
must use `shoplineAdminHeaders()`. It must include `Authorization: Bearer ...`,
`Accept: application/json`, `Content-Type: application/json; charset=utf-8`,
and `User-Agent: SHOPLINE-Quantity-Breaks-App/1.0`. Missing `Accept` or
`User-Agent` can trigger SHOPLINE HTTP 436 security policy responses.

Do not use Partner-only `X-Shopline-Access-Token` for store Admin APIs, and do
not forward browser-only `X-Requested-With` to SHOPLINE.

## Git Repository

Remote:
https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git

Default branch: main, unless the repository uses another branch.

## Mandatory Git Approval Workflow

EVERY completed code or documentation change set
must go through explicit user approval before pushing.

After making changes:

1. Inspect git status and all changed files.
2. Include newly created and untracked files in the review.
3. Summarize additions, modifications and deletions.
4. Show the affected files and proposed commit message.
5. Ask the user in Chinese:
   "本次代码/文档已在本地更新，是否推送到 GitHub？"
6. STOP and wait for the user's response.

If the user replies "推送" or explicitly approves:

1. Stage only the reviewed and approved files.
2. Check staged changes for secrets and unrelated files.
3. Create a descriptive Git commit.
4. Push to the configured remote and current branch.
5. Report the actual push result and commit hash.
6. If push fails, report the error and request necessary action.

If the user replies "不推送":

1. Keep changes locally.
2. Do not push.
3. Do not discard or reset changes.
4. Do not automatically include rejected changes
   in a later push without new approval.

## Strict Git Restrictions

- NEVER push without approval for that specific change set.
- NEVER interpret earlier approval as permanent approval.
- NEVER use git push --force.
- NEVER silently rewrite Git history.
- NEVER delete branches without approval.
- NEVER commit API keys, access tokens, .env or secrets.
- NEVER use git add -A without reviewing untracked files.
- NEVER report a push as successful unless it succeeded.
- NEVER make destructive changes to the remote without approval.

## Development Workflow

1. Audit requirements.
2. Complete and confirm UI design.
3. Prepare and confirm implementation plan.
4. Implement features using tests.
5. Run automated checks.
6. Perform feature-gap and UI reviews.
7. Fix verified issues within the approved scope.
8. Ask whether to push the completed change set.

## Completion Rules

A feature is complete only when:
- Requirements are implemented.
- UI interactions work.
- Tests pass.
- Data persistence works where required.
- SHOPLINE integration is verified where applicable.
- No unresolved critical issues remain.

Mock functionality must never be labeled production-ready.
