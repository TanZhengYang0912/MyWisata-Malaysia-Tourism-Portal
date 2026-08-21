# 成熟开源电商项目的支付与钱包混合支付模式

日期：2026-08-21
范围：仅作只读研究。以下结论来自各项目的第一方 GitHub 源码（固定 commit），不代表这些项目已替 MyWisata 接入任何本地支付渠道。

## 结论先行

成熟项目不会把「钱包优先 + 卡补差」当成一个单独、只会跳 Stripe 的付款方式。它是**一张订单上的多笔 payment allocation**：

1. 先由服务端计算订单尚未覆盖的金额；
2. 钱包足够时，直接由内部钱包 payment 结算，**不创建外部卡付款**；
3. 钱包不足时，钱包只覆盖可用部分，外部 provider 只收 remainder；
4. 外部部分只有在已验签的 provider 成功事件到达后，才能把整个订单标记为 paid；失败、取消、过期则释放钱包 reservation；
5. 每个 provider attempt / event 都要可幂等地关联到订单与 payment allocation。

MyWisata 当前 `wallet_split` 已能用数据库锁和 reservation 算出 `external_amount_sen`，但前端只把纯 `wallet` 当作可直接 finalize 的方式。因此当余额完全覆盖订单、`external_amount_sen = 0` 时，流程没有 Stripe URL，却被前端当成错误。这是状态分支缺失，不是 Stripe 的限制。

## 项目对照

| 项目 | 已由源码确认的模式 | 对 MyWisata 的直接启示 |
|---|---|---|
| Solidus | Store Credit 是内部 payment source；订单依次处理未完成 payment，支付总额达到订单总额即停止。 | 全钱包覆盖是正常结算分支，不能继续要求卡。 |
| Vendure | 支付是可插拔 handler；订单可有多笔 payment，新增 payment 时只计算未被既有 payments 覆盖的余额。 | 把 wallet / card 当作同一订单下的 allocations，而不是互斥的页面选项。 |
| Saleor | provider 的异步事件经签名校验、事务锁和 `psp_reference + type` 去重后才更新交易；处理中事件不等于成功。 | Stripe redirect 成功页不能入账；webhook + 幂等 settlement 才能最终 paid。 |
| Medusa | 当前源码明确声明默认 payment-collection workflow **不支持 split payments**，创建新 session 前会删旧 session。 | 如果未完整实现 reserve / remainder / rollback / webhook，成熟做法是暂时不展示 split，而不是半完成地开放。 |

## 1. Solidus：内部 Store Credit 与外部 payment 共同覆盖订单

Solidus 把 Store Credit 建模为 `PaymentSource`。其余额以 `amount - amount_used - amount_authorized` 计算；authorize 会检查余额和币种；capture 只会扣已授权额度并记录使用额度。

- [StoreCredit 的余额、authorize 与余额/币种检查](https://github.com/solidusio/solidus/blob/1f5bf5c638f5fe9fbda4d480bdb7ebcfa39a9a5e/core/app/models/spree/store_credit.rb#L54-L92)
- [StoreCredit capture：以授权额为上限，更新 `amount_used` / `amount_authorized`](https://github.com/solidusio/solidus/blob/1f5bf5c638f5fe9fbda4d480bdb7ebcfa39a9a5e/core/app/models/spree/store_credit.rb#L94-L118)

订单处理并不假设单一付款渠道。`process_payments_with` 在 payment total 已覆盖订单 total 时立即返回；否则依次处理 checkout 状态 payment，并在覆盖后停止。

- [Order payments：达到订单总额后停止继续处理](https://github.com/solidusio/solidus/blob/1f5bf5c638f5fe9fbda4d480bdb7ebcfa39a9a5e/core/app/models/spree/order/payments.rb#L40-L48)

**对 MyWisata 的含义：** `wallet_split` 的全额覆盖分支应与纯钱包结算等价：在同一服务端事务中把 reservation commit、订单/payment/session 标为 paid，并直接进入订单页。不得生成 RM0.00 Stripe Checkout，也不得把「没有 Stripe URL」解释为失败。

## 2. Vendure：provider abstraction 与多 payment 的余额计算

Vendure 的支付方式通过 `PaymentMethodHandler` 实现。handler 返回 payment 的金额、状态、provider transaction reference 与 metadata；接口注释明确指出 payment amount 通常等于订单总额，**除非订单使用多个 payment methods**。

- [PaymentMethodHandler / `CreatePaymentResult`：金额、状态、provider reference、multiple methods 语义](https://github.com/vendure-ecommerce/vendure/blob/2bab619e988c9e62e59d65dd69016cf937f6587b/packages/core/src/config/payment/payment-method-handler.ts#L30-L73)

`OrderService.addPaymentToOrder` 会先读既有 payments，再用 `totalWithTax - totalCoveredByPayments` 计算 `amountToPay`，创建该笔 payment；当 payments 覆盖 total 时，订单自动转为 payment-authorized 或 payment-settled。结算也要求 handler 明确返回成功，所有 payments settled 才推动订单状态。

- [新增 payment 时以「订单总额 - 已覆盖金额」计算剩余](https://github.com/vendure-ecommerce/vendure/blob/2bab619e988c9e62e59d65dd69016cf937f6587b/packages/core/src/service/services/order.service.ts#L1446-L1519)
- [所有 payments settled 后才转订单状态](https://github.com/vendure-ecommerce/vendure/blob/2bab619e988c9e62e59d65dd69016cf937f6587b/packages/core/src/service/services/order.service.ts#L1719-L1735)
- [第三方 handler 调用在 DB transaction 外；若随后 DB 写入失败，需要上层 reconciliation](https://github.com/vendure-ecommerce/vendure/blob/2bab619e988c9e62e59d65dd69016cf937f6587b/packages/core/src/service/services/payment.service.ts#L123-L162)

**对 MyWisata 的含义：** 订单应能表达至少两笔逻辑 payment：`wallet`（已 reserve/settled 的部分）与 `stripe_card`（仅 remainder）。钱包额度、Stripe session / payment intent id、状态及失败原因应分别可审计；不要把整个混合付款只压成一个 `wallet_split` method 加一个外部金额字段。

## 3. Saleor：provider 成功必须来自已验签、幂等的异步事件

Saleor 的 Stripe webhook 使用 raw payload、`stripe-signature` 和 webhook secret 进行验签；只把已处理的事件分发给相应 handler。

- [Stripe webhook：读取 raw body、验签、按事件类型分发](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/payment/gateways/stripe/webhooks.py#L50-L105)

对重复回调，`transactionEventReport` 在数据库事务中取得 transaction lock，按 `psp_reference + type` 检查既有 event；同金额事件返回 `already_processed`，不同金额视为错误。这正是 provider 重试和重复投递所需的模式。

- [transaction event 的锁与 `pspReference + type` 幂等检查](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/graphql/payment/mutations/transaction/transaction_event_report.py#L398-L462)
- [Stripe `processing` 只写 pending transaction，而非完成订单](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/payment/gateways/stripe/webhooks.py#L390-L428)

Saleor 的 `Payment` 模型还明确说明一个 order 可使用多个 payment methods、每个 payment method 可有多个 transactions。其内置 Gift Card gateway 是内部余额支付的具体例子：先锁定 gift card row、检查币种/余额，随后在 transaction 中扣余额，并防止重复扣款。

- [Payment 模型：一个订单可有 multiple payment methods](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/payment/models.py#L273-L285)
- [Gift Card：行锁和余额/币种验证](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/giftcard/gateway.py#L135-L175)
- [Gift Card：事务内扣款与重复扣款保护](https://github.com/saleor/saleor/blob/9062d3ee1346e3f278e700bd804d74c027a5d2b1/saleor/giftcard/gateway.py#L273-L369)

**对 MyWisata 的含义：** Stripe success return URL 只能显示「正在确认」；真正的 mixed-payment commit 应只由 webhook 完成。该 webhook 必须核对 session/order、支付币种与 **remainder** 金额，并用 provider event id / payment intent id 幂等；失败和过期需要调用现有 `release_wallet_split_checkout` 一次。

## 4. Medusa：没有完整 split workflow 时，明确不支持

Medusa 的 payment collection workflow 当前主动删除已有 active payment session；源码注释明确写道这样做是因为「目前不支持 split payments」，并指出要支持 split 时还需要处理其他 workflows。

- [Medusa：明确不支持 split payments，并删除旧 session](https://github.com/medusajs/medusa/blob/a6fff7ec920f3fa15b2f35429e186ebd76d0f1d4/packages/core/core-flows/src/payment-collection/workflows/create-payment-session.ts#L197-L205)

其 webhook route 只接收 provider payload（包括 raw body 和 headers），投递为 delayed/retry event 后快速返回 HTTP 200；subscriber 无法关联 payment session、或事件为 failed/cancelled/pending 时不会完成支付 workflow。

- [webhook route：保存 raw data/headers、延迟与 retry 后返回 200](https://github.com/medusajs/medusa/blob/a6fff7ec920f3fa15b2f35429e186ebd76d0f1d4/packages/medusa/src/api/hooks/payment/%5Bprovider%5D/route.ts#L6-L38)
- [subscriber：拒绝 foreign、失败、取消和 pending event，不触发 order completion](https://github.com/medusajs/medusa/blob/a6fff7ec920f3fa15b2f35429e186ebd76d0f1d4/packages/medusa/src/subscribers/payment-webhook.ts#L36-L62)

**对 MyWisata 的含义：** `wallet_split` 目前已经有 reservation SQL，但尚未补齐全额覆盖直结、remainder Stripe session、webhook completion、failure release 与同一幂等边界时，最安全的短期产品决定是隐藏或禁用它。不要将一个看起来可选的功能交给用户测试。

## 建议的 MyWisata 目标流程

```text
prepare（服务器锁定订单、计算 amount）
  ├─ wallet >= total
  │    └─ wallet payment settle -> order/session paid -> 成功页
  └─ wallet < total
       └─ reserve wallet allocation -> 创建 Stripe Checkout(remainder only)
            ├─ 已验签的 Stripe paid webhook
            │    └─ commit reservation + settle external allocation -> order/session paid
            └─ cancelled / expired / failed webhook 或 timeout reconciliation
                 └─ release reservation -> order/session failed/expired
```

实现边界建议：

- 使用金额的最小单位（sen），在服务端重新计算，不信任浏览器传来的 wallet/remainder。
- `external_amount_sen === 0` 是成功的全钱包分支，不可创建 Stripe session。
- `external_amount_sen > 0` 时，Stripe line item 必须恰好等于这个 remainder；成功回调必须再次核对该金额和币种。
- 保留 checkout id、wallet reservation id、Stripe checkout/payment-intent id、provider event id 和状态转换的审计记录；同一 provider event 只能结算一次。
- 失败、取消、过期、Stripe callback 缺失都需要可重复执行且安全的 release/reconciliation。

## 不确定性与范围

- 本研究确认的是这些项目源码中的架构与语义，不宣称任何一个项目已内建 MyWisata 所需的「MyR wallet + Stripe Checkout」产品组合。
- Solidus/Vendure 的片段证明了多 payment 与全额覆盖的领域模型；具体 store-credit UI、gateway 的授权/捕获时机可按项目配置变化。
- Medusa 当前源码明确不支持 split，因此它提供的是「不要半实现」的反例，而不是可直接复制的实现。
- 尚未对 MyWisata 做任何代码、数据库、Stripe 配置或真实付款操作。

## 简明建议

优先修复 **全钱包覆盖直接结算**，因为它是当前可确认的阻断缺口；随后才实现真正的 mixed flow（钱包 reserve + 仅 remainder 的 Stripe session + webhook commit/release）。如果下一轮不打算完整实现后两部分，就先从 UI 移除 `Wallet first + card remainder`，保留已有的纯钱包与 Stripe card 支付。
