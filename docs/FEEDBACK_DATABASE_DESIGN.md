# 需求与建议数据库设计

**阶段：** 设计，尚未创建迁移或写入数据库。
**现有基础：** Cloudflare D1（SQLite 语义）；可信商店标识来自 OAuth 已写入的 `shopline_sessions.store_id` / `admin_stores.store_id`。

## 表与职责

| 表 | 职责 | 私有字段 |
| --- | --- | --- |
| `feedback_requests` | 建议、状态、可见性和投票聚合 | `submitter_store_id`、规范化内容 hash、隐藏原因。 |
| `feedback_votes` | 按店铺的一票关系 | `store_id`。 |
| `feedback_submission_keys` | POST 幂等与短时完全重复防护 | `store_id`、key/hash、到期时间。 |
| `feedback_status_history` | 商家可见状态历史 | `changed_by_admin_id`。 |
| `feedback_replies` | 多条官方回复 | `author_admin_id`。 |
| `feedback_admin_audit_logs` | 隐藏、恢复、状态和回复管理审计 | 操作者、目标、理由/差异。 |

## 建议 schema

```sql
CREATE TABLE feedback_requests (
  id TEXT PRIMARY KEY,
  submitter_store_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  normalized_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','in_progress','released','rejected')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','hidden')),
  hidden_reason TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_by_admin_id TEXT
);

CREATE TABLE feedback_votes (
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, store_id)
);

CREATE TABLE feedback_submission_keys (
  store_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, idempotency_key)
);
```

状态历史、回复和审计表使用自增整数主键或 UUID；所有外键在真实 D1 迁移与测试环境中开启/验证。迁移应增加两条投票触发器：插入票时 `vote_count + 1`，删除票时在不小于零的前提下减一。触发器与复合主键共同避免并发下的重复计数或负数。

## 索引与查询

```sql
CREATE INDEX idx_feedback_public_newest
  ON feedback_requests (visibility, created_at DESC, id DESC);
CREATE INDEX idx_feedback_public_status_newest
  ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX idx_feedback_public_votes
  ON feedback_requests (visibility, vote_count DESC, created_at DESC, id DESC);
CREATE INDEX idx_feedback_requests_submitter_hash
  ON feedback_requests (submitter_store_id, content_hash, created_at DESC);
CREATE INDEX idx_feedback_history_request_created
  ON feedback_status_history (request_id, created_at ASC, id ASC);
CREATE INDEX idx_feedback_replies_public
  ON feedback_replies (request_id, visibility, created_at ASC, id ASC);
CREATE INDEX idx_feedback_audit_target_created
  ON feedback_admin_audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX idx_feedback_submission_keys_expires
  ON feedback_submission_keys (expires_at);
```

搜索/相似建议一期使用绑定参数的 `LIKE`，并对 `%`、`_`、`\\` 做 LIKE escape，限制查询长度、结果数和响应字段。`LIKE '%term%'` 无法从普通 B-tree 索引获得理想性能，因此当公开建议规模或 p95 延迟超过项目阈值时，先确认 D1 支持的全文检索能力，再进行独立可回滚迁移；现在不引入 AI/向量服务。

## 隐私、保留和回滚

- 商家 SELECT 只投影公开列，不能 `SELECT *` 后依赖前端过滤。
- 公开详情的投票关系用请求所属 `store_id` 加载；绝不返回所有 voter 的身份。
- 隐藏不删除建议、投票、状态历史或审计。商家查询把隐藏项视为不存在；管理端按权限读取。
- 迁移新增表和索引，不修改现有业务表。回滚由单独的、经批准的 down-migration/备份策略决定；生产迁移必须另获批准。
- `feedback_submission_keys` 和旧限流行可由受控清理任务删除过期数据；删除前不影响审计、建议或投票。
