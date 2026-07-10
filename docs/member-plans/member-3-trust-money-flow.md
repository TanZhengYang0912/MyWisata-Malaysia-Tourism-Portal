# Member Plan — Trust & Money Flow (P-TMF)

> **Domain narrative**: 用户验证身份 → 获得信任 → 提交推荐 → 转化奖励 → 奖励入钱包 → 提现审批 → 到账。
> 这个成员负责**整条信任 → 钱流**，是 demo 里唯一能让 4 条 story line 全部闭环的关键路径。

---

## 1. Scope 决定（已砍到可执行）

### 保留（4 大子模块）
| 子模块 | 说明 | 表数 | Mock 边界 |
|--------|------|------|----------|
| **TMF-1 Identity Trust** | KYC 提交 + Admin 审核 | 4 | 上传文件用文件名占位；OTP 固定 123456 |
| **TMF-2 Recommendation Trust** | 用户推荐商家 + Admin 审核 + Mock 转化 | 4 | Admin 点"Mock Convert"按钮触发首次销售，不等真订单 |
| **TMF-3 Wallet Ledger** | 钱包余额 + Ledger + 奖励入账 helper | 2 | 只在自己 domain 内写，跨 domain 通过 `creditWallet()` helper 调用 |
| **TMF-4 Withdrawal Governance** | 提现请求 + 单/双审批 + Ledger 冻结/释放 | 3 | 无真实银行转账，approve 后只改状态 |

**总计 13 张表**（是我原方案给的 15 张，砍了 2 个 later 表）。

### 明确不做（还给其他成员或延后）
- ❌ Affiliate link 生成 / click tracking → 属于 P3 discovery，让另一个人做
- ❌ Email verification 的真实 email 发送 → mock 为 seed 已 verified
- ❌ Phone SMS → mock 为固定 code 123456
- ❌ Real payment gateway → 属于 order/cart 那个人的 D1 mock pay
- ❌ Payout gateway → 完全不做，状态到 `completed` 即结束

---

## 2. AI/启发式 决定（把"AI 三件套"改诚实）

原 plan 三个 AI 组件全部改名并明确算法，避免 demo 被问"模型是什么"时说不清。

| 原名 | 改为 | 实际做法 | Demo 讲稿 |
|------|------|---------|----------|
| ~~AI-assisted KYC review~~ | **KYC Completeness Checklist** | 规则：4 项字段 + 文档 URL 存在与否 → 打 "low_risk / needs_review / high_risk" | "这不是黑盒 AI，是可解释的合规检查表——每一条都能追溯" |
| ~~AI recommendation quality scoring~~ | **Recommendation Quality Score (rule-v1)** | 3 分项加权：completeness(0.4) + description_quality(0.3) + duplicate_risk(0.3)，0-1 分 | "打分函数完全透明，输出附拆解" |
| ~~Fraud/risk flagging~~ | **Duplicate Submission Flag** | SQL：`COUNT(recommendation) WHERE recommender_id = X AND created_at > NOW() - 7d`，超过 5 条标 suspicious | "基于滑动窗口计数，可以调阈值" |

**唯一保留"AI"字样的地方**（如果老师明确要看 AI）：**Recommendation Quality Score** 里 description_quality 可以升级——用免费的 `Xenova/all-MiniLM-L6-v2` 在浏览器端跑 embedding，与已有 5 条高质量推荐样本对比余弦相似度。这个是真 AI 且**零 API 费用**。**若时间不够，退化为文本长度 + 关键字命中率，公开叫 heuristic-v1**。

### 打分函数（可以直接抄进代码）

```ts
// src/lib/scoring/kyc-completeness.ts
export function kycCompletenessScore(sub: KycSubmissionRow, profile: UserRow) {
  const checks = {
    document_uploaded:   !!sub.document_url,
    document_type_valid: ['national_id','passport'].includes(sub.document_type),
    full_name_present:   !!profile.full_name && profile.full_name.length > 3,
    phone_verified:      !!profile.phone_verified_at,
    email_verified:      !!profile.email_verified_at,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const level = passed >= 5 ? 'low_risk' : passed >= 3 ? 'needs_review' : 'high_risk';
  return { checks, passed, level };
}

// src/lib/scoring/recommendation-quality.ts
export async function recommendationQualityScore(rec: VendorRecommendationRow, db: SupabaseClient) {
  // 1. Completeness (0-1)
  const fields = [rec.vendor_name, rec.vendor_address, rec.description, rec.category_id];
  const completeness = fields.filter(Boolean).length / fields.length;

  // 2. Description quality (0-1) — heuristic-v1
  const desc = rec.description ?? '';
  const lengthScore = Math.min(desc.length / 200, 1);       // 200 chars = full
  const wordScore   = Math.min(desc.split(/\s+/).length / 30, 1);
  const descQuality = (lengthScore + wordScore) / 2;

  // 3. Duplicate risk (0-1, lower is better) — SQL count
  const { count } = await db.from('vendor_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('recommender_id', rec.recommender_id)
    .ilike('vendor_name', `%${rec.vendor_name.slice(0, 10)}%`)
    .neq('id', rec.id);
  const duplicateRisk = Math.min((count ?? 0) / 3, 1);      // 3 similar = max risk

  const score = 0.4 * completeness + 0.3 * descQuality + 0.3 * (1 - duplicateRisk);
  return {
    score: Math.round(score * 100) / 100,
    breakdown: { completeness, descQuality, duplicateRisk },
    version: 'rule-v1',
  };
}
```

---

## 3. 状态机（每个 approve 前必须画）

### KYC 状态机
```
unverified ──submit──▶ pending ──admin_approve──▶ approved  ┐
                            │                                │  unlocks:
                            └──admin_reject──▶ rejected      │  • affiliate link generation
                                              │              │  • withdrawal requests
                                              └─24h_cooldown─▶ (re-submit → pending)
```
**规则**：
- `rejected → pending` 必须等 24h（platform_settings 里存 `kyc.resubmit_cooldown_hours=24`）
- `approved` 是终态但可被 admin 手动 downgrade 到 `suspended`（后期）

### Recommendation 状态机
```
pending ──admin_approve──▶ approved ──mock_convert──▶ converted (触发 wallet credit)
       └──admin_reject──▶ rejected
```
**规则**：
- `converted` 只能从 `approved` 触发，且必须写 `recommendation_conversions` 行
- convert 触发 `creditWallet(recommender_id, bonus_amount, 'reward_pending')`

### Withdrawal 状态机
```
                            ┌── amount < RM500 ──▶ single_approval ──approve──▶ completed
pending (funds reserved) ──┤                                          └──reject──▶ released
                            └── amount ≥ RM500 ──▶ dual_approval ────approve(1/2)──▶ pending
                                                                    approve(2/2)──▶ completed
                                                                    hold ──▶ pending (48h escalate)
```
**规则**：
- 提交 request 立刻在 ledger 写 `withdrawal_reserve`（-amount, available）
- `completed` 写 `withdrawal_complete`（0 effect on available，因为已经 reserve 掉了）
- `rejected` 写 `withdrawal_release`（+amount, available）
- hold 状态不释放资金，仅暂停

---

## 4. 事务边界（demo 会翻车的地方，一定要包）

### 提现审批必须原子（用 Supabase RPC）

```sql
-- supabase/migrations/002_withdrawal_approve.sql
CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id UUID,
  p_approver_id UUID,
  p_action VARCHAR,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_request withdrawal_requests%ROWTYPE;
  v_approve_count INT;
  v_final_status VARCHAR;
BEGIN
  -- 1. Lock request row
  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request not in pending state';
  END IF;

  -- 2. Insert approval action
  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  -- 3. Determine final status
  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    -- Release reserved funds
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (v_request.wallet_id, 'withdrawal_release', v_request.amount, 'available',
            p_request_id, 'Rejected: ' || COALESCE(p_note, ''));

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      v_final_status := 'pending';   -- still needs 2nd approver
    ELSE
      v_final_status := 'completed';
      -- Debit ledger (funds already reserved)
      INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
      VALUES (v_request.wallet_id, 'withdrawal_complete', -v_request.amount, 'available',
              p_request_id, 'Withdrawal completed');
    END IF;
  END IF;

  UPDATE withdrawal_requests SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('status', v_final_status, 'action', p_action);
EXCEPTION WHEN OTHERS THEN
  RAISE;   -- rollback on any error
END;
$$;
```

**从 API route 调用：**
```ts
// src/app/api/admin/withdrawals/[id]/approve/route.ts
const { data, error } = await supabase.rpc('approve_withdrawal', {
  p_request_id:  id,
  p_approver_id: user.id,
  p_action:      action,
  p_note:        note,
});
if (error) return NextResponse.json({ error }, { status: 500 });

// audit + notify AFTER successful transaction
await onWithdrawalReviewed(id, user.id, ownerId, action === 'approve');
```

同样规则适用于：
- **Recommendation convert** → 写 conversion + commission + wallet_ledger 三张表必须原子（RPC `convert_recommendation`）
- **KYC approve** → 更新 kyc_submissions + users.kyc_status 必须原子（可以用单个 UPDATE + WHERE）

---

## 5. 跨模块契约（要告知其他 3 个成员）

| 你依赖 | 谁提供 | Deadline | 契约 |
|--------|--------|----------|------|
| `AuthUser` + `useAuth()` hook | P1 | Day 2 | 已在 `src/hooks/use-auth.ts` |
| `auditAndNotify()` helper | P1 | Day 2 | 已在 `src/lib/audit.ts` |
| `vendors.id` 存在（recommendation converts to a real vendor） | P2 | Day 4 | 用 seed 的 3 家 vendor 即可 |
| `orders` 表存在（首次销售归因） | 订单负责人 | Day 6 | 可选：如果没接上，`first_sale_order_id` 允许 null |

| 你提供 | 谁依赖 | Deadline | 契约 |
|--------|--------|----------|------|
| `creditWallet(userId, amount, type, refId)` helper | P3 affiliate | Day 6 | 唯一 wallet 写入入口 |
| `kyc_status = 'approved'` 后可解锁 affiliate | P3 | Day 4 | P3 只需 `select kyc_status from users` |
| `WalletSummary` 显示组件 | 前端 layout | Day 6 | 已在 `src/types/index.ts` |

### `creditWallet` helper（唯一钱包入账入口）

```ts
// src/lib/wallet-credit.ts
export async function creditWallet(
  db: SupabaseClient,
  userId: string,
  amount: number,      // in RM, positive
  entryType: 'reward_pending' | 'affiliate_commission' | 'refund_credit',
  referenceId: string,
  note: string,
): Promise<{ ledgerEntryId: string }> {
  const { data: wallet } = await db.from('wallets').select('id').eq('user_id', userId).single();
  if (!wallet) throw new Error('Wallet not found');

  const balanceType = entryType === 'refund_credit' ? 'available' : 'pending';

  const { data, error } = await db.from('wallet_ledger').insert({
    wallet_id:    wallet.id,
    entry_type:   entryType,
    amount:       Math.round(amount * 100) / 100,   // money.ts should do this
    balance_type: balanceType,
    reference_id: referenceId,
    note,
  }).select('id').single();

  if (error) throw error;

  // Also update wallets summary (or use view/trigger)
  await db.rpc('recalculate_wallet_balance', { p_wallet_id: wallet.id });

  return { ledgerEntryId: data.id };
}
```

**规则**：P3 affiliate 想给用户加钱必须调这个函数，不允许直接 `wallets.update()`。

---

## 6. 14-Day 执行计划

| Day | 交付物 | 退出条件 |
|-----|--------|----------|
| **1** | 领 3 张表所有权、状态机图、branch `feature/tmf` | 不写代码，画好状态机 + 与 P1/P2/P3 对齐依赖 |
| **2** | KYC 提交表单（customer）+ 状态展示 | `/profile` 页面显示 4 层验证进度；可上传 mock 文件名 |
| **3** | KYC admin 审核页 + `auditAndNotify` 接入 | `/admin/kyc` approve/reject 后 users.kyc_status 更新 + 通知发出 |
| **4** | Wallet 余额展示 + Ledger 读取 | `/wallet` 显示 seed 用户 Alice 的 RM 45 + RM 12.5 pending |
| **5** | Withdrawal 请求 UI + 冻结逻辑 | Alice 提 RM 30，available 变 15，pending 不变，ledger 有 reserve 记录 |
| **6** | Withdrawal admin 单审批 + RPC 事务 | Approver 点 approve 后 completed；点 reject 后 available 回到 45 |
| **7** | Dual approval (≥RM500) + hold 状态 | Alice 提 RM 600，需要 2 个 approver；1/2 后还是 pending |
| **8** | Recommendation 提交 + 列表 | Alice 推荐一家 vendor，quality score 显示在 admin 列表 |
| **9** | Recommendation admin 审核 + Mock Convert | Admin 点 "Mock Convert" 后触发 recommender wallet + RM 12.5 pending |
| **10** | **Feature freeze** — 集成 heuristic scoring | 3 个打分函数上线，可解释 |
| **11** | Bug bash：重复提交、race、幂等 | 连续点 approve 只写一条 approval 行 |
| **12** | Seed 数据固化 + reset 脚本 | `supabase db reset` 后 4 条 story line 全部可跑 |
| **13** | Rehearsal 2 次 | 10 分钟主流程 + 3 分钟 Q&A 应对 |
| **14** | Buffer | 只修 blocker，不加功能 |

### 关键 gate
- **Day 2 出**：Auth 已通 → 可以开 KYC 表单
- **Day 4 出**：Wallet 有可读余额 → P3 才能显示 "Verified Contributor" badge
- **Day 6 出**：Withdrawal 单审批链通 → E2E 首次跑通
- **Day 9 出**：Recommendation convert → wallet credit 链通 → E2E 完整

---

## 7. Definition of Done（每个子模块）

每个交付物必须满足以下 8 条才算完成：

1. **真数据库读写**：不能 hardcode 数字
2. **4 状态齐全**：Loading / Empty / Success / Validation error
3. **防重复提交**：button `disabled` 期间
4. **审批必审计**：调 `auditAndNotify()` 才算完成
5. **金额必经 money.ts**：不用原生 `+` `*`
6. **状态变更必经 state machine**：不能直接 `update({ status: 'x' })`，要经过 helper 校验
7. **可从 seed 重现**：`supabase db reset` 后能重跑
8. **Demo 文案标 DEMO/Mock**：Payment/OTP/KYC review 页面顶端有黄色 badge

---

## 8. Demo Story Line（这个成员负责的 3 条）

### Story A — 用户信任升级
```
1. 登录 customer3@demo.local (unverified)
2. 上 /profile → 看到 KYC 未验证 → 上传 mock ID
3. 切换到 admin@demo.local → /admin/kyc → 看到 KYC completeness 打分 = "needs_review"
4. Admin approve → 通知发出（audit_logs 有记录）
5. 切回 customer3 → 显示 "Verified Contributor" badge
```

### Story B — 推荐奖励入账
```
1. Verified customer 到 /discovery → 底部有 "Recommend a vendor"
2. 填表提交 → 显示 quality score 0.72（附拆解）
3. Admin → /admin/recommendations → 看到打分 + "Mock Convert" 按钮
4. Admin 点 Convert → 触发 wallet_ledger 写入 → customer /wallet 看到 pending +12.50
```

### Story C — 提现治理
```
1. Alice /wallet → 有 RM 45 available → 点 "Request Withdrawal RM 30"
2. Available 立刻变 15，ledger 显示 reserve
3. 切 approver@demo.local → /admin/withdrawals → 单审批 approve
4. Alice /wallet → 显示 completed，ledger 有 withdrawal_complete 行
5. 再演一次 RM 600 → 需要 2 个 approver → 展示 1/2 状态
6. 演一次 reject → 资金释放回 available
```

---

## 9. 我需要其他成员帮忙的清单（一次性说清）

发到团队群，让他们 Day 1 就知道：

> 我做 Trust & Money Flow。你们帮我：
>
> - **P1（Auth 那位）**：Day 2 之前把 `useAuth()` 和 `auditAndNotify()` 跑通，我这边所有审批都靠这两个
> - **P2（Vendor 那位）**：seed 里 3 家 vendor 别删，我 recommendation.converted_vendor_id 会指向它们
> - **P3（Discovery 那位）**：不要直接改 `wallets.balance`，用我提供的 `creditWallet()` helper；KYC approved 后你可以 select users.kyc_status 来解锁 affiliate 生成
> - **前端 layout**：`/wallet` 和 `/profile` 的 route 归我，路径别抢
