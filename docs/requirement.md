# Tourism Discovery & Commerce Portal


*Full-Stack Multi-Vendor Platform with AI Recommendations, Map
Navigation, Live Chat, Affiliate Engine & Verified Earning System*

Version 3.0 | July 2026

## 1. Executive Summary

This proposal outlines the development of a Tourism Discovery & Commerce
Portal — a comprehensive full-stack platform connecting travellers,
local vendors, and community contributors in a single unified ecosystem.

Version 3 introduces six major new capabilities on top of the core
commerce and reward engine:

- Interactive map navigation powered by Google Maps / Mapbox API to
  guide customers to vendor locations with real-time routing

- In-app chatbot between customers and vendors for pre-booking inquiries
  and support

- Admin chatbot portal for platform-wide support, moderation assistance,
  and vendor onboarding guidance

- Wallet withdrawal approval workflow — all withdrawal requests require
  designated approver sign-off before processing

- Verified User Profile system — customers must complete identity and
  profile validation before they can recommend vendors or earn rewards

- AI-powered personalised recommendation engine that surfaces vendors
  and activities based on declared user preferences and live GPS
  location

- One-tap social sharing — portal content shareable directly to
  WhatsApp, Instagram, Facebook, TikTok, and more

## 2. Project Overview

|                       |                                                                                       |
|-----------------------|---------------------------------------------------------------------------------------|
| **Project Title**     | Tourism Discovery & Commerce Portal                                                   |
| **Version**           | 3.0 — Enhanced Intelligence & Trust Layer                                             |
| **Project Type**      | Full-Stack Web & Mobile Application                                                   |
| **Primary Users**     | Tourists, Local Vendors, Community Contributors, Admins                               |
| **Platform**          | Web (Responsive) + iOS & Android Native App                                           |
| **Proposed Duration** | 14 Months (4 Phases)                                                                  |
| **Tech Stack**        | React/Next.js · Node.js · PostgreSQL · Redis · Google Maps API · OpenAI API · AWS/GCP |

## 3. Problem Statement

Existing tourism platforms fail to address several critical user needs
simultaneously:

- No integrated map navigation from discovery to physical vendor
  location

- No real-time communication channel between customer and vendor before
  a booking is committed

- No structured admin communication layer for support and moderation
  workflows

- Wallet payout systems lack governance — withdrawals are processed
  without oversight, risking fraud

- Open recommendation systems allow unverified users to earn money
  without identity accountability

- Discovery feeds are generic, not personalised to individual traveller
  interests or real-time location

- Content sharing requires leaving the app and manually copying links —
  friction reduces virality

## 4. Complete Feature Set

### 4.1 Vendor Registration & Multi-Outlet Shop Management

- Vendors self-register or are recommended by customers; admin reviews
  and approves before going live

- Single vendor account manages multiple outlets with independent
  product, pricing, and operating hour configurations

- Fully customizable shop page per outlet: hero banner, brand colours,
  fonts, featured products, gallery

- Drag-and-drop page builder with mobile preview and per-page SEO
  settings

### 4.2 Product, Pricing & Inventory

- Product/service catalogue per outlet: physical goods, digital
  products, activities, experiences, F&B

- Variable pricing: peak/off-peak, group, bundle, tiered; real-time
  inventory with auto-disable on stock-out

### 4.3 Activity Booking & Product Purchase

- Mixed cart checkout combining bookings and products in a single
  transaction

- Multiple payment methods: card, e-wallet, bank transfer, portal wallet
  balance

- Order history, booking calendar, and digital receipts in customer
  dashboard

### 4.4 Vendor Voucher Management

- Create vouchers: percentage off, fixed amount, BOGO, minimum spend;
  set validity dates and usage caps

- Bulk voucher upload via CSV or auto-generate unique codes; real-time
  checkout validation

- Voucher performance analytics per vendor: redemption rate, revenue
  impact

## 5. Interactive Map Navigation

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>🗺️ Feature Principle</strong></p>
<p>Every vendor listing on the portal includes a live map view powered
by Google Maps or Mapbox API. Customers can get step-by-step navigation
from their current GPS location to the vendor's physical address —
directly within the app, without switching to an external maps
application.</p></td>
</tr>
</tbody>
</table>

### 5.1 Map API Integration

- Google Maps Platform API (or Mapbox GL JS as alternative) integrated
  into both web and mobile app

- Vendor registration form requires submission of verified physical
  address and GPS coordinates

- Admin can manually pin or adjust vendor location on the map during the
  approval process

- Each vendor shop page and listing displays an embedded map widget
  showing the outlet's location

### 5.2 Navigation Features

- 'Get Directions' button on every vendor page launches turn-by-turn
  navigation using the customer's current GPS location

- Supports multiple travel modes: driving, walking, cycling, public
  transit

- Estimated travel time and distance displayed on listing before
  navigation is launched

- Near Me discovery view shows a radius-based map of all nearby vendors,
  activities, and recommended spots

- Cluster markers group dense vendor areas at low zoom; individual pins
  appear as user zooms in

- Map filter overlay: filter by category (food, activities,
  accommodation, retail, hidden gems) directly on the map

### 5.3 API Configuration

|                     |                                                                                          |
|---------------------|------------------------------------------------------------------------------------------|
| **Primary API**     | Google Maps Platform (Maps JavaScript API, Directions API, Geocoding API, Places API)    |
| **Alternative**     | Mapbox GL JS + Mapbox Directions API (lower cost at scale)                               |
| **Mobile**          | React Native Maps (wraps Google Maps SDK on Android, Apple Maps on iOS)                  |
| **Geocoding**       | Address → GPS coordinates on vendor registration; reverse geocoding for Near Me          |
| **Rate Management** | API key restrictions by domain/bundle ID; quota alerts; caching geocode results in Redis |

## 6. In-App Chat — Customer to Vendor

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>💬 Feature Principle</strong></p>
<p>Customers can open a real-time chat thread with any vendor directly
from the shop page or listing, before or after a booking. This replaces
the need to find external contact details and keeps all communication
within the platform for accountability and dispute resolution.</p></td>
</tr>
</tbody>
</table>

### 6.1 Chat Architecture

- WebSocket-based real-time messaging (Socket.io or AWS API Gateway
  WebSocket)

- Each chat thread is linked to a specific vendor outlet and customer
  account

- Message history is persisted in the database and accessible to both
  parties at any time

- Vendor Portal has a dedicated Inbox view showing all active customer
  threads with unread counts

- Outlet Managers can only see threads for their assigned outlet; Vendor
  Owner sees all outlets

### 6.2 Chat Features

- Text messages, image attachments, and file sharing (e.g. booking
  confirmation, menu PDF)

- Customer can initiate chat from any product, activity, or shop page
  with one tap

- Automated welcome message from the vendor when a new thread is opened

- Read receipts and online/offline status indicators

- Admin can view flagged or reported chat threads for moderation

- Chat threads are archived after 90 days of inactivity (configurable)

- Push and in-app notifications for new messages on both customer and
  vendor side

## 7. Admin Chatbot & Support Portal

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>🤖 Feature Principle</strong></p>
<p>The Admin Portal includes an AI-powered chatbot (built on OpenAI GPT
or equivalent LLM) that assists admins with moderation tasks, answers
platform policy questions, drafts vendor outreach messages, and provides
a customer-facing support chat for general inquiries — reducing manual
workload across the team.</p></td>
</tr>
</tbody>
</table>

### 7.1 Admin-Side Chatbot

- AI assistant embedded in the Admin Portal dashboard, trained on
  platform policies and data

- Admins can ask natural language questions: 'How many recommendations
  are pending approval this week?', 'Show me vendors with withdrawal
  requests over \$500'

- AI can draft vendor onboarding emails, rejection notices, and
  recommendation approval messages with one prompt

- Moderation assistant: flags potentially fraudulent recommendation
  submissions and summarises them for admin review

- Escalation routing: AI categorises incoming support tickets and routes
  them to the correct admin team

### 7.2 Customer-Facing Support Chat

- AI chatbot widget available on all customer-facing pages for general
  inquiries

- Handles FAQs: how to earn rewards, how affiliate links work,
  withdrawal timelines, booking help

- Escalates unresolved queries to a live admin agent with full
  conversation context handed over

- Tracks unresolved query categories to identify content gaps in the
  Help Centre

### 7.3 AI Integration

|                     |                                                                                                |
|---------------------|------------------------------------------------------------------------------------------------|
| **LLM Provider**    | OpenAI GPT-4o (primary) or Anthropic Claude API (alternative)                                  |
| **Framework**       | LangChain or custom prompt orchestration layer                                                 |
| **Knowledge Base**  | Platform documentation, policy docs, FAQs indexed via vector embeddings (Pinecone / pgvector)  |
| **Admin Chat Auth** | Admin credentials required; chatbot context limited to non-PII aggregate data                  |
| **Compliance**      | No customer PII passed to external LLM APIs; on-premise model option for sensitive deployments |

## 8. Verified User Profile — Earn-Eligibility Gate

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>✅ Feature Principle</strong></p>
<p>To recommend a vendor or earn money through recommendations and
affiliate commissions, a customer must first complete a verified
profile. This protects the platform's integrity, reduces fraudulent
reward claims, and ensures all earnings are tied to a real, accountable
identity.</p></td>
</tr>
</tbody>
</table>

### 8.1 Verification Requirements

| **Verification Step**       | **Required For**                          | **Method**                                                                 |
|-----------------------------|-------------------------------------------|----------------------------------------------------------------------------|
| Email Verification          | Basic account creation                    | One-time email OTP confirmation                                            |
| Phone Number Verification   | Booking & purchasing                      | SMS OTP via Twilio                                                         |
| Profile Completion          | Recommendation submission                 | Full name, profile photo, short bio, location (city/country)               |
| Identity Verification (KYC) | Wallet withdrawals & affiliate earnings   | Upload govt-issued ID; automated OCR + manual admin review                 |
| Preference Survey           | AI-powered recommendation personalisation | 5-minute onboarding quiz (interests, travel style, budget range, mobility) |

### 8.2 Verification Flow

- New users can browse and purchase without verification

- When a user attempts to submit a recommendation or generate an
  affiliate link, the system checks their verification tier

- If unverified, a step-by-step verification wizard is shown with clear
  progress indicators

- KYC documents are reviewed within 24–48 hours; status shown as Pending
  / Approved / Rejected in the user profile

- Verified users receive a 'Verified Contributor' badge visible on their
  public profile and recommendation posts

- Rejected KYC submissions receive a reason and a re-submission option

### 8.3 Verification Status & Feature Access

| **User Status**         | **Browse & Buy**    | **Submit Recommendation** | **Generate Affiliate Link** | **Wallet Withdrawal** |
|-------------------------|---------------------|---------------------------|-----------------------------|-----------------------|
| Guest (not logged in)   | Yes (browse only)   | No                        | No                          | No                    |
| Registered (email only) | Yes                 | No                        | No                          | No                    |
| Phone Verified          | Yes (full checkout) | No                        | No                          | No                    |
| Profile Complete        | Yes                 | Yes                       | Yes (limited)               | No                    |
| KYC Verified            | Yes                 | Yes                       | Yes (full tiers)            | Yes (with approval)   |

## 9. Wallet System & Withdrawal Approval Workflow

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>💰 Feature Principle</strong></p>
<p>All wallet withdrawal requests are subject to a structured approval
workflow. No funds are disbursed without a designated Approver reviewing
and confirming the request. This ensures financial compliance, fraud
prevention, and full audit traceability for every payout.</p></td>
</tr>
</tbody>
</table>

### 9.1 Wallet Overview

- Every registered customer has an in-app wallet that consolidates
  recommendation payouts and affiliate commissions

- Wallet balance can be used to pay for bookings and products on the
  platform

- Earned credits are held in 'Pending' status during a configurable
  clearance window (default: 7 days) before becoming 'Available'

### 9.2 Withdrawal Request Flow

| **Step**          | **Actor**        | **Action**                                                            | **System Response**                                                             |
|-------------------|------------------|-----------------------------------------------------------------------|---------------------------------------------------------------------------------|
| 1. Initiate      | Customer         | Submits withdrawal request: amount, destination bank/e-wallet details | Request logged as 'Pending Approval'; funds reserved in wallet                  |
| 2. Notify        | System           | Auto-notification sent to designated Approver(s)                      | Approver receives email + in-app alert with request summary                     |
| 3. Review        | Approver (Admin) | Reviews request: KYC status, transaction history, fraud flags         | Approver sees full wallet ledger and source of funds                            |
| 4a. Approve       | Approver         | Marks request as Approved with optional note                          | Payment processing initiated via payout gateway; customer notified              |
| 4b. Reject / Hold | Approver         | Rejects with reason or places on Hold pending more info               | Customer notified with reason; funds released back to Available balance or held |
| 5. Process       | System           | Payout gateway executes bank transfer or e-wallet credit              | Transaction receipt generated; wallet ledger updated; customer notified         |

### 9.3 Approver Roles & Escalation

- Approver role is assignable to one or more Admin users in the Admin
  Portal

- Requests above a configurable high-value threshold (e.g. \$500)
  require dual approval — two Approvers must sign off

- Requests pending for more than 48 hours auto-escalate to a Super Admin
  with alert

- Full audit log maintained: who approved, timestamp, IP address, notes
  — immutable record

- Monthly payout reports auto-generated for finance reconciliation

## 10. Community Recommendation Rewards & Affiliate Link System

### 10.1 Recommendation Reward

- Verified customers submit recommendations for vendors or hidden gems
  not yet on the platform

- Admin reviews, approves, and publishes; admin contacts the recommended
  vendor to invite registration

- On vendor's first successful sale: recommender earns one-time bonus +
  ongoing commission % per transaction (admin-configurable attribution
  window)

- All payouts credited to wallet in 'Pending' state; clear to
  'Available' after hold window

### 10.2 Affiliate Link System

- Every KYC-verified customer auto-receives a unique Affiliate ID

- One-click 'Copy My Link' button on every vendor page, product, and
  activity listing

- Short link auto-generated for social sharing:
  portal.com/r/AFFILIATE_ID/listing

- 30-day cookie attribution; tiered commission: Standard 3% → Active 5%
  → Top Affiliate 7%

- Affiliate dashboard: clicks, conversions, earnings, leaderboard

## 11. AI-Powered Personalised Recommendation Engine

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>🧠 Feature Principle</strong></p>
<p>The platform's discovery feed is not a generic list — it is a
personalised, AI-curated experience that ranks and surfaces vendors,
activities, and hidden gems based on each customer's declared preference
profile, past behaviour on the platform, and their real-time GPS
location.</p></td>
</tr>
</tbody>
</table>

### 11.1 User Preference Profile

During onboarding (and editable at any time in Settings), users complete
a Preference Survey:

| **Preference Category**  | **Input Method**  | **Example Options**                                                                                                         |
|--------------------------|-------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Interest Categories      | Multi-select tags | Nature & Hiking, Food & Dining, Cultural & Heritage, Adventure Sports, Nightlife, Wellness & Spa, Shopping, Family-Friendly |
| Travel Style             | Single select     | Budget Backpacker, Mid-Range Explorer, Luxury Traveller, Business Traveller, Family Group                                   |
| Budget Range             | Slider            | Under \$20/activity · \$20–\$80 · \$80–\$200 · \$200+                                                                       |
| Group Composition        | Multi-select      | Solo, Couple, Friends Group, Family with Kids, Senior Group                                                                 |
| Mobility & Accessibility | Toggle flags      | Wheelchair accessible, Minimal walking, Pet-friendly                                                                        |
| Preferred Distance       | Slider            | Within 1km · 5km · 20km · Any distance                                                                                      |

### 11.2 AI Recommendation Logic

- Preference-based filtering: hard-filter listings that do not match
  mobility, budget, or distance constraints

- Collaborative filtering: 'Users like you also visited...' based on
  anonymised cohort behaviour patterns

- Content-based similarity: vendor tags, activity descriptions, and
  community recommendation text embedded as vectors and ranked by cosine
  similarity to user preference vector

- Location boost: listings closer to the customer's current GPS position
  receive a configurable proximity score boost in the ranking algorithm

- Recency boost: newly added listings or recently highly-rated ones are
  surfaced more prominently to encourage exploration

- Seasonal/time-of-day awareness: outdoor activities boosted on sunny
  afternoons; restaurants boosted near meal times

- Feedback loop: explicit signals (saved, booked, rated) and implicit
  signals (dwell time on listing, link share) continuously refine the
  user's preference model

### 11.3 Recommendation Feed UI

- Home feed shows 'Recommended For You' section with AI-curated cards at
  the top

- Each card shows match reason tag: 'Near you', 'Matches your
  interests', 'Popular with similar travellers', 'Hidden Gem'

- 'Surprise Me' mode: deliberately surfaces one high-quality listing
  outside the user's usual categories to encourage discovery

- Map view respects AI ranking — higher-ranked listings display with
  highlighted pins

### 11.4 AI Infrastructure

|                        |                                                                                                        |
|------------------------|--------------------------------------------------------------------------------------------------------|
| **Embedding Model**    | OpenAI text-embedding-3-small or sentence-transformers (self-hosted)                                   |
| **Vector Database**    | pgvector (PostgreSQL extension) or Pinecone for similarity search                                      |
| **Recommendation API** | Custom Node.js microservice; results cached in Redis with 15-min TTL per user                          |
| **Retraining Cadence** | User preference vectors updated in real-time on new signals; model weights retrained weekly            |
| **Cold Start**         | New users without preferences default to trending + location-based feed until 3+ interactions recorded |

## 12. Social Sharing & One-Tap Share

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>📲 Feature Principle</strong></p>
<p>Every piece of content on the platform — vendor pages, activity
listings, hidden gems, recommendation posts — can be shared to WhatsApp,
Instagram, Facebook, TikTok, X (Twitter), and any other app via the
device's native share sheet with one tap. Shared links automatically
carry the sender's affiliate code.</p></td>
</tr>
</tbody>
</table>

### 12.1 Share Mechanics

- A 'Share' button appears on every vendor shop page, product listing,
  activity card, and recommendation post

- Tapping Share opens the device's native share sheet (Web Share API on
  mobile browsers; native share intent on iOS/Android)

- The shared URL automatically appends the logged-in user's affiliate
  code: portal.com/r/AFFILIATE_ID/listing

- If the user is not logged in, the shared URL is clean without an
  affiliate code

- Deep links ensure the shared URL opens the app directly (if installed)
  or a mobile-optimised web page with an app download prompt

### 12.2 Rich Preview (OG & WhatsApp)

- Every shareable page has dynamically generated Open Graph meta tags:
  title, description, hero image

- WhatsApp link previews show vendor name, cover photo, rating, and a
  one-line description

- Instagram and Facebook sharing generates a pre-populated story/post
  template with the listing image (via Canvas API on mobile)

- TikTok sharing opens the TikTok app with the portal link pre-filled in
  the caption field

### 12.3 Share Tracking

- Every share event is logged: content type, user ID (if logged in),
  destination platform, timestamp

- Share-to-conversion funnel visible in affiliate dashboard: how many
  shares led to clicks, and clicks to bookings

- Vendors can see share counts on their listings in the Vendor Analytics
  dashboard

## 13. User Roles & Access Control

| **Role**                        | **Key Capabilities**                                                                                                                                      |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Super Admin                     | Full platform access; vendor approval; recommendation moderation; wallet config; approver assignment; AI tuning; analytics                                |
| Approver (Admin)                | Review and approve/reject wallet withdrawal requests; view user KYC status; escalate to Super Admin                                                       |
| Vendor Owner                    | Manage all outlets; products; pricing; vouchers; chat inbox; brand page; analytics                                                                        |
| Outlet Manager                  | Manage assigned outlet's products, pricing, vouchers, bookings, and chat threads                                                                          |
| KYC Verified Customer           | Browse, book, purchase, recommend, earn wallet rewards, generate affiliate links, request withdrawals, use AI recommendations, share with affiliate links |
| Basic Customer (phone verified) | Browse, book, purchase, use AI recommendations, share (without affiliate link)                                                                            |
| Guest                           | Browse and view listings only; no booking, recommendation, or sharing with affiliate link                                                                 |

## 14. Non-Functional Requirements

| **Category**        | **Requirement**                                                                                                               |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------|
| Performance         | Page load \< 2s; API P95 \< 500ms; WebSocket chat latency \< 200ms; 10,000 concurrent users                                   |
| Security            | HTTPS; JWT + refresh tokens; PCI-DSS payments; OWASP Top 10; KYC data encrypted at rest                                       |
| Scalability         | Docker/Kubernetes horizontal scaling; Redis pub/sub for chat; AI service independently scalable                               |
| Availability        | 99.9% uptime SLA; multi-region failover; daily automated backups                                                              |
| Accessibility       | WCAG 2.1 AA; multilingual (EN + local languages); RTL support ready                                                           |
| Data Privacy        | GDPR/PDPA; explicit consent; KYC data isolated in separate encrypted store; no PII to LLM APIs                                |
| Affiliate Integrity | Click fraud detection; duplicate submission flagging; clearance hold on all payouts; dual approval for high-value withdrawals |
| Map API Resilience  | Fallback to Mapbox if Google Maps quota exceeded; geocode results cached in Redis                                             |

## 15. Development Roadmap

**Phase 1 — Foundation (Months 1–3)**

- Core infrastructure: cloud, CI/CD, database schema, auth & role system

- Vendor registration, outlet setup, product & pricing management

- Customer discovery feed, search, basic shop pages

- Admin portal: vendor approval, content management, user management

- Email & phone OTP verification

**Phase 2 — Commerce & Map (Months 4–7)**

- Google Maps / Mapbox API integration: vendor location pins, Near Me,
  category filter overlay

- Turn-by-turn navigation from listing pages

- Activity booking and product checkout with payment gateway

- Vendor voucher management and checkout validation

- WebSocket chat: customer ↔ vendor inbox

- Basic wallet: balance, transaction ledger, clearance hold logic

**Phase 3 — Rewards, AI & Verification (Months 8–11)**

- KYC verified profile system with document upload and admin review
  workflow

- Community recommendation submission, admin review, conversion
  tracking, wallet payout automation

- Affiliate link generation, click tracking, 30-day cookie attribution,
  commission tiers

- Wallet withdrawal approval workflow: Approver role, dual approval for
  high-value, audit log

- AI recommendation engine: preference survey, embedding model, pgvector
  similarity search, proximity boost

- Admin chatbot: LLM integration, knowledge base embedding, moderation
  assistant

- Customer support chatbot with live agent escalation

**Phase 4 — Social, Polish & Launch (Months 12–14)**

- One-tap social sharing with affiliate link injection and OG meta
  generation

- Affiliate dashboard: analytics, leaderboard, share-to-conversion
  funnel

- Page customization drag-and-drop builder and brand kit

- Advanced analytics dashboards: vendor, admin, affiliate, AI
  recommendation performance

- Security audit, penetration testing, load testing, performance
  optimization

- Beta launch → public launch

## 16. Proposed Technology Stack

| **Layer**          | **Technology**                                                                                          |
|--------------------|---------------------------------------------------------------------------------------------------------|
| Frontend Web       | React.js / Next.js, Tailwind CSS, TypeScript                                                            |
| Mobile App         | React Native (iOS & Android), React Native Maps                                                         |
| Backend API        | Node.js + Express.js (REST); GraphQL for complex queries                                                |
| Real-Time Chat     | Socket.io (WebSocket); Redis Pub/Sub for horizontal scaling                                             |
| Database           | PostgreSQL + pgvector, Redis, Elasticsearch                                                             |
| Map & Navigation   | Google Maps Platform (Maps JS, Directions, Geocoding, Places APIs) / Mapbox GL JS                       |
| AI Recommendations | OpenAI Embeddings + custom ranking microservice; pgvector similarity search                             |
| AI Chatbot         | OpenAI GPT-4o API + LangChain; Pinecone or pgvector knowledge base                                      |
| KYC / Identity     | Veriff, Onfido, or Jumio API for automated document verification                                        |
| Payments & Payouts | Stripe (payments + Stripe Connect for payouts) / local payment gateway                                  |
| Cloud & Infra      | AWS / GCP, Docker, Kubernetes, Terraform (IaC), CloudFront CDN                                          |
| Storage            | AWS S3 / GCS for vendor media, voucher assets, KYC documents (isolated bucket)                          |
| Auth               | JWT + OAuth2; Auth0 or custom IAM; RBAC middleware                                                      |
| Notifications      | Firebase Cloud Messaging (push), SendGrid (email), Twilio (SMS/OTP)                                     |
| Analytics          | Mixpanel / GA4 + custom admin, vendor & affiliate dashboards                                            |
| Social Sharing     | Web Share API (mobile browsers); native share intent (React Native); OG meta via Next.js dynamic routes |

## 17. Conclusion

The Tourism Discovery & Commerce Portal Version 3 represents a fully
integrated tourism intelligence platform — one that goes far beyond a
simple booking site. By combining map-guided navigation, real-time
vendor chat, AI-curated personalised discovery, verified earning
accounts, and governed financial workflows, the platform delivers trust,
utility, and engagement at every touchpoint.

The AI recommendation engine ensures every customer sees content that is
genuinely relevant to their interests and location — not a generic feed.
The verified profile and withdrawal approval workflow build
institutional trust with vendors, partners, and financial regulators.
The one-tap social sharing with automatic affiliate link injection turns
every satisfied customer into a measurable, incentivised growth channel.

Together, these features create a self-reinforcing ecosystem: better
discovery drives more bookings, more bookings enable more community
earnings, more earnings motivate more recommendations and sharing, which
in turn brings more vendors and customers into the platform.

*— End of Research Proposal v3.0 —*