# 订阅无缝接续修复 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User has authorized fixing, pushing and deploying this change set. Preserve unrelated CSS/TOML edits.

**Goal:** 已核验且连续的下一期不会因旧本期到期而被误拦截或误删除折扣。

**Architecture:** 权益核验始终全量分页读取店铺订阅；本地访问允许已核验且当前正在覆盖的连续下一期。复用既有D1锁表，以独立订阅键串行核验和失效执行；失效前重新核验、检查任务版本与绑定，平台失败时只重试。锁使用20分钟租期（长于单次Worker最长15分钟执行窗口），数据库写入校验持有者，异常最终释放；崩溃后等待租期到期，避免冒险并发删除。

**Tech Stack:** TypeScript, Cloudflare Worker/D1, Vitest Worker pool, React/Vite.

**Spec:** docs/audits/2026-11-24-subscription-period-handoff.md 与用户本轮“推送并部署 并且修复”。

## Global Constraints

- 所有商家Admin请求继续使用shoplineAdminHeaders；不改套餐价格、权限功能键或显式撤销规则。
- 本地接续必须已核验、时间连续、下一期已开始且未结束；不跨越空档，不绕过权限/状态。
- 平台核验失败或锁/任务版本过期，不执行删除；平台删除结果不确定仍沿用现有重试/核验方式。
- 保留用户CSS和SHOPLINE CLI配置，部署从本批已提交代码构建；不发布app-block或Discount Function。

## Review Focus

- 旧ID通知/重复通知与分页第二页的有效下一期。
- 下一期取消、缺少功能权限、空档及精确开始/结束时刻。
- Partner失败、旧失效任务、核验与删除并发。
- 租约过期后的迟到写入以及商家手动编辑同一活动。
- 真正无权益时仍可确认删除、记录实际结束时间，429退避保持。

## Task 1: 接续访问与全量核验

- [x] 写回归：hasSubscriptionAccess在旧end+1时允许连续next，但拒绝gap、next结束、撤销和无功能权限；reconcile收到旧ID仍请求完整列表，忽略已结束但仍标active的本期。
- [x] 运行 worker 的 subscription-access、entitlements 测试；Expected: 新用例失败。
- [x] 改访问判定并去掉核验中的subIds过滤；当前候选检查endAt，过期active记录走原24小时宽限。
- [x] 运行同样测试；Expected: 全部通过。更新支付pending测试，subscriptionId仅作为关联信息保留。

## Task 2: 失效执行防护

- [x] 写回归：旧任务版本跳过；重新核验查到下一期不删；Partner失败不删；真实失效仍删；两个核验/删除执行互斥；过期锁持有者不能写入。
- [x] 运行 subscription-operations、subscription-repository、entitlements-cancellation 测试；Expected: 新用例失败。
- [x] D1SubscriptionRepository增加 withEntitlementLock 与租约断言，返回有租约上下文的仓库；写权益SQL校验租约。
- [x] EntitlementService在租约内核验，requireFresh模式失败向任务抛错；失效执行检查版本、重新全量核验并在真正DELETE前再次检查租约/任务，复用活动锁防止重发竞争。
- [x] 运行相关测试；Expected: 新旧用例通过，真正无权益的删除与Retry-After测试保持。

## Task 3: 验证、文档、发布

- [x] 运行Worker完整测试、类型检查和dry-run；运行前端相关测试及生产构建。Expected: 本批回归通过；任何基线失败先验证归属再报告。
- [x] 独立最终审查，修复实际重要问题。更新排查结论、APP_PROGRESS。
- [ ] 检查全部变更/未跟踪文件，按用户本批授权只提交本批源码/测试/文档；推送main。
- [ ] 从已提交代码构建部署，确认Worker版本及线上静态资源/无敏感只读探测。Expected: 推送与部署实际成功。

## Execution Ledger

- 2026-11-24: 用户已授权实施、推送及部署；在现有main继续，保留未授权CSS/TOML。此前两行提示的测试和本地视觉QA已完成。

- Task 1: 完成 RED→GREEN；当前/下期精确边界、空档、旧ID分页、结束仍active的情况均有覆盖。
- Task 2: 完成 RED→GREEN；API失败、旧任务版本、租约抢占、并发删除及真实失效/429覆盖。
- Final review: 独立只读审查发现1项Important（核验提升版本导致多活动漏清理和退避丢失）；新增多活动及429第二次执行用例RED→GREEN后修复，最终完整492/492通过，无其他重要/次要项。
- Ruling: 在既有main按用户授权继续；部署用干净提交快照排除未授权用户CSS/TOML，避免覆盖其本地修改。
- Ruling: 新锁的GDPR清理属于本次新增持久数据的必要收尾；实测先失败后修复，商家隔离保持。
- Task 3: 类型检查、完整Worker回归及本地前端QA通过；等待实际Git推送与Worker部署结果。
