# Malaysia Tourism Discovery & Commerce System

## Complete Implementation Plan For Figma Prototype And Development

### Purpose

This document converts the provided tourism system documents into one complete Malaysia-wide tourism system implementation plan. It is written as a handoff for Figma prototype design and future development planning.

The system should be designed as one complete tourism platform for the whole of Malaysia.

## 1. Product Vision

Build a Malaysia-wide tourism discovery and commerce platform where travellers can discover local attractions, food, activities, accommodation, retail experiences and hidden gems, then chat with vendors, navigate by map, book activities, buy products, share listings, earn rewards and manage wallet withdrawals.

The system connects four sides:

- Travellers and tourists who want to discover and book tourism experiences.
- Local vendors who want to publish tourism products, activities and services.
- Verified contributors who recommend vendors or hidden gems and earn rewards.
- Admins who manage trust, approvals, support, moderation, wallet withdrawals and platform operations.

## 2. Target Users

### Tourist / Customer

- Browse tourism listings across Malaysia.
- Search by state, destination, category, budget and distance.
- Get AI-personalised recommendations.
- View listings on a map and get directions.
- Chat with vendors before booking.
- Book activities or buy products.
- Use vouchers.
- Share listings to social platforms.
- Complete verification to earn rewards.
- Manage wallet and request withdrawal.

### Vendor / Merchant

- Register business and wait for admin approval.
- Manage one or multiple outlets.
- Create products, services, activities and packages.
- Manage pricing, capacity, availability and inventory.
- Create vouchers and promotions.
- Receive bookings and orders.
- Chat with customers.
- Track analytics and listing performance.

### Verified Contributor

- Submit vendor or hidden gem recommendations.
- Generate affiliate links.
- Share listings with tracking links.
- Earn reward or commission when conversion happens.
- Track earnings in wallet.

### Admin / Approver

- Review vendor applications.
- Review KYC verification.
- Moderate submitted recommendations.
- Manage withdrawal approvals.
- Review fraud and duplicate flags.
- Use admin chatbot for support and moderation assistance.
- Manage users, roles, categories, content and analytics.

## 3. Malaysia-Wide Scope

The platform should cover the whole of Malaysia, not only one area.

### Main Destination Coverage

Use Malaysia states and territories as first-level browsing filters:

- Kuala Lumpur
- Selangor
- Penang
- Kedah / Langkawi
- Melaka
- Johor
- Perak
- Pahang
- Negeri Sembilan
- Terengganu
- Kelantan
- Perlis
- Sabah
- Sarawak
- Putrajaya
- Labuan

### Tourism Categories

Use these as primary categories in the design:

- Food and Dining
- Heritage and Culture
- Nature and Hiking
- Island and Beach
- Adventure and Outdoor
- Family Activities
- Accommodation
- Shopping and Local Retail
- Wellness and Spa
- Nightlife
- Hidden Gems
- Events and Seasonal Experiences

### Currency And Local Payment Context

- Display all prices in RM / MYR.
- Show payment options such as card, FPX online banking, Touch 'n Go eWallet, GrabPay, DuitNow and platform wallet balance.

## 4. Product Positioning

This system is not just a booking app. It is a tourism discovery, commerce, trust and growth ecosystem.

Core promise:

> Discover Malaysia like a local, book with confidence, and turn trusted recommendations into measurable rewards.

## 5. Visual Design Direction

Use the `frontend-design` direction: the UI must not feel like a generic travel template.

### Design Subject

Subject: a practical Malaysia tourism operating system for travellers, vendors and admins.

Audience:

- Tourists who need fast discovery and confidence.
- Local vendors who need a clear business dashboard.
- Admins who need operational control.

Main job of the interface:

- Help users move from discovery to trust to booking to reward without confusion.

### Design Personality

The design should feel:

- Local, Malaysia-wide and place-rich.
- Trustworthy enough for payment, KYC and wallet workflows.
- Visual enough for tourism discovery.
- Operationally clean for vendor and admin dashboards.

### Visual Token System

Recommended palette:

- Rainforest Green: `#0F5D4A` for trust, verification and primary actions.
- Straits Teal: `#087E8B` for maps, location and navigation.
- Hibiscus Red: `#C7363D` for highlights, alerts and Malaysian identity.
- Harvest Gold: `#F2B84B` for rewards, wallet and affiliate earnings.
- Cloud White: `#F8FAF7` for app background.
- Charcoal Slate: `#24313A` for text and dashboard structure.

Avoid using only blue or only green. The palette should feel like Malaysia: rainforest, sea, city, food, culture and movement.

### Typography

For Figma, use Google Fonts or similar available fonts:

- Display / hero: `Fraunces` or `Playfair Display` for destination names and editorial tourism moments.
- UI / body: `Inter` or `Plus Jakarta Sans` for readable product UI.
- Data / dashboard: `IBM Plex Sans` or `Roboto Mono` only for short metrics, codes and wallet ledger values.

Use display type sparingly. Dashboards should use clean UI typography, not decorative tourism typography.

### Signature Design Element

Use a "Malaysia Journey Ribbon" as the unique visual signature.

This is a thin route-like line that connects map pins, listing cards, booking steps and reward states. It should appear in:

- Onboarding preference flow.
- Map/listing transitions.
- Booking stepper.
- Wallet earning timeline.
- Admin approval timeline.

This gives the prototype a distinctive identity tied to travel routes across Malaysia, instead of a generic tourism card layout.

### Layout Principle

Customer screens should be mobile-first and image-rich. Vendor and admin screens should be desktop-first and work-focused.

Recommended structure:

```text
Customer mobile:
[location + search]
[category rail]
[AI recommendation card]
[Malaysia map/listing entry]
[bottom navigation]

Vendor desktop:
[sidebar navigation] [top status bar]
[metrics row]
[work table / calendar / editor]
[right detail panel]

Admin desktop:
[sidebar navigation] [global search + AI assistant]
[approval queues]
[risk/status panels]
[detail drawer]
```

## 6. High-Level System Modules

### Module 1: Account, Login And Role Access

Functions:

- User registration and login.
- Email verification.
- Phone verification.
- Role-based access control.
- Profile management.
- Guest browsing mode.

Roles:

- Guest
- Customer
- Verified Contributor
- Vendor Owner
- Outlet Manager
- Admin
- Approver
- Super Admin

Key screens:

- Login / Register
- OTP Verification
- Profile
- Role Switcher
- Permission Settings

### Module 2: Tourism Discovery And Search

Functions:

- Search tourism listings across Malaysia.
- Browse by state, city, category and interest.
- View trending destinations.
- Filter by price, distance, rating, opening status and accessibility.
- Save favourite listings.

Key screens:

- Explore Malaysia Home
- Search Results
- Category Browse
- State Destination Page
- Saved Listings

### Module 3: AI Personalised Recommendation

Functions:

- Preference survey during onboarding.
- Personalised feed using interests, location, budget, group type and past behaviour.
- Reason tags such as "Near you", "Matches your food interest", "Popular with families", "Hidden gem".
- Surprise Me mode for discovery outside usual preferences.

Prototype behavior:

- The AI can be represented as ranking and reason tags, not only a chatbot.
- Show a visible explanation for why each listing is recommended.

Key screens:

- Preference Survey
- Recommended For You Feed
- Recommendation Detail Reason
- AI Recommendation Monitoring for Admin

### Module 4: Map Navigation And Near Me

Functions:

- Map view for all listings.
- Near Me discovery.
- Cluster markers for dense areas.
- Filter by category on map.
- Show distance and estimated travel time.
- Get Directions using current GPS location.
- Support driving, walking, cycling and public transit.

Key screens:

- Full Map View
- Listing Bottom Sheet
- Route Preview
- Location Permission State
- No Nearby Results State

### Module 5: Vendor Registration And Multi-Outlet Management

Functions:

- Vendor registration.
- Business information submission.
- Outlet address and GPS pin.
- Admin approval before going live.
- Multiple outlets under one vendor account.
- Assign outlet managers.

Key screens:

- Vendor Sign Up
- Business Profile Form
- Outlet Setup
- Admin Vendor Approval
- Multi-Outlet Dashboard

### Module 6: Product, Activity, Pricing And Inventory

Functions:

- Vendor creates tourism products, activities, packages and food items.
- Manage category, title, description, media, price and availability.
- Support time slots, capacity, inventory and stock-out state.
- Support peak/off-peak pricing, group pricing and bundles.

Key screens:

- Product / Activity List
- Add Product / Activity
- Pricing Rules
- Availability Calendar
- Inventory Table

### Module 7: Listing Detail And Shop Page

Functions:

- Display vendor or activity information.
- Show gallery, location, rating, operating hours, description, reviews and price.
- Show vendor verified badge.
- Provide actions: Book Now, Chat, Share, Save, Get Directions.
- Support multiple outlets if vendor has branches.

Key screens:

- Vendor Listing Detail
- Activity Detail
- Product Detail
- Reviews
- Outlet Selector

### Module 8: Cart, Booking, Checkout And Payment

Functions:

- Add activity bookings and products to one cart.
- Select date, time, quantity and add-ons.
- Apply voucher.
- Pay using card, FPX, e-wallet or wallet balance.
- Generate receipt and booking confirmation.
- View order and booking history.

Key screens:

- Booking Selection
- Cart
- Voucher Applied / Invalid Voucher
- Checkout
- Payment Method
- Payment Success
- Payment Failed
- Booking Confirmation
- Order History

### Module 9: Vendor Voucher And Promotion

Functions:

- Vendor creates voucher.
- Voucher types: percentage, fixed discount, BOGO, minimum spend.
- Set validity dates, usage caps and outlet restrictions.
- Validate voucher during checkout.
- Track redemption performance.

Key screens:

- Voucher List
- Create Voucher
- Voucher Performance
- Checkout Voucher Input

### Module 10: Customer-To-Vendor Chat

Functions:

- Customer can chat with vendor from listing or booking.
- Vendor inbox shows customer threads.
- Attach image/file.
- Automated welcome message.
- Read receipts and online/offline indicators.
- Admin can review flagged chats.

Key screens:

- Customer Chat Thread
- Vendor Inbox
- Chat With Booking Context
- Report Chat
- Admin Flagged Chat Review

### Module 11: Verified Profile And KYC

Functions:

- Verification levels control feature access.
- Email verification for account.
- Phone verification for booking.
- Profile completion for recommendations.
- KYC verification for earning and withdrawal.
- Admin review for rejected or suspicious submissions.

Feature access:

- Guest: browse only.
- Registered: browse and save.
- Phone verified: book and pay.
- Profile complete: submit recommendations and limited affiliate.
- KYC verified: earn full rewards and withdraw.

Key screens:

- Verification Progress
- Profile Completion
- KYC Upload
- KYC Pending
- KYC Approved
- KYC Rejected With Reason
- Admin KYC Review

### Module 12: Community Recommendation Rewards

Functions:

- Verified users recommend vendors or hidden gems.
- Admin reviews submissions.
- Admin can mark duplicate, reject or approve.
- Approved recommendation can become a listing or vendor invitation.
- Reward is credited when defined conversion condition is met.

Reward examples:

- One-time reward when recommended vendor joins.
- Commission after first successful booking.
- Bonus for high-quality hidden gem submission.

Key screens:

- Submit Recommendation
- Recommendation Status
- Admin Recommendation Review
- Reward Pending In Wallet

### Module 13: Affiliate Link And Social Sharing

Functions:

- KYC verified user receives affiliate ID.
- Share button on vendor, activity, product and recommendation pages.
- Shared link includes affiliate tracking.
- Track clicks, conversions and commission.
- Share to WhatsApp, Instagram, Facebook, TikTok and copy link.

Key screens:

- Share Sheet
- Affiliate Link Card
- Affiliate Dashboard
- Conversion Funnel
- Vendor Share Analytics

### Module 14: Wallet And Withdrawal Approval

Functions:

- Wallet shows pending balance, available balance and lifetime earnings.
- Earnings come from rewards, affiliate commission and refunds.
- Pending balance clears after hold period.
- Customer requests withdrawal to bank/e-wallet.
- Admin/Approver reviews request.
- High-value withdrawal requires dual approval.
- Full audit log for approval, rejection or hold.

Key screens:

- Wallet Home
- Wallet Ledger
- Withdrawal Request
- Withdrawal Pending
- Withdrawal Approved
- Withdrawal Rejected
- Admin Withdrawal Approval
- Dual Approval State

### Module 15: Admin Chatbot And Support Portal

Functions:

- Admin AI assistant helps with moderation and support.
- Customer support chatbot answers FAQs.
- Escalate unresolved issues to live admin.
- Admin chatbot can summarize pending approvals, draft vendor messages and flag suspicious activity.

Key screens:

- Customer Support Chatbot
- Admin AI Assistant
- Support Ticket Queue
- Ticket Detail
- Escalation View

### Module 16: Admin Operations And Analytics

Functions:

- Admin dashboard for platform health.
- Manage users, vendors, categories, listings, KYC, withdrawals and recommendations.
- View booking, revenue, sharing and reward metrics.
- Manage fraud flags and duplicate submissions.

Key screens:

- Admin Dashboard
- User Management
- Vendor Management
- Listing Moderation
- Category Management
- Platform Analytics
- Fraud Review

## 7. Figma File Structure

Create these Figma pages:

1. Cover
2. Design System
3. Customer Mobile App
4. Customer Web Responsive
5. Vendor Dashboard
6. Admin Dashboard
7. Prototype Flows
8. Component Library
9. System Notes

Recommended frame sizes:

- Mobile app: 393 x 852.
- Desktop web/dashboard: 1440 x 1024.
- Tablet optional: 834 x 1194.

## 8. Complete Figma Screen List

### Customer Mobile App

#### C01 - Splash / App Entry

Purpose:

- Introduce the Malaysia tourism system quickly.
- Show app identity and continue to onboarding or explore.

Content:

- App logo.
- Malaysia Journey Ribbon visual.
- Buttons: Explore as guest, Sign in, Create account.

#### C02 - Onboarding Preference Survey

Purpose:

- Collect data for AI recommendations.

Fields:

- Travel interests.
- Preferred states or destinations.
- Budget range.
- Travel style.
- Group type.
- Accessibility needs.
- Preferred distance.

#### C03 - Explore Malaysia Home

Purpose:

- Main customer landing screen.

Content:

- Current location.
- Search bar.
- Malaysia state selector.
- Category shortcuts.
- Recommended For You.
- Near Me.
- Hidden Gems.
- Trending in Malaysia.

Primary actions:

- Search.
- Open map.
- Tap listing.
- Change state.

#### C04 - Search Results

Purpose:

- Let tourist compare listings.

Filters:

- State/city.
- Category.
- Price.
- Distance.
- Rating.
- Open now.
- Accessibility.
- Family-friendly.

#### C05 - Category Browse

Purpose:

- Browse by tourism category.

Example:

- Food and Dining in Penang.
- Island Experiences in Langkawi.
- Nature and Hiking in Sabah.

#### C06 - Malaysia Map / Near Me

Purpose:

- Discover listings visually by location.

Content:

- Map pins.
- Cluster markers.
- Category overlay.
- Bottom sheet listing card.
- Distance and ETA.

States:

- Location allowed.
- Location denied.
- No nearby result.

#### C07 - Route Preview / Get Directions

Purpose:

- Preview route before navigation.

Content:

- Current location.
- Vendor destination.
- Travel mode selector.
- Estimated time and distance.

#### C08 - Listing Detail

Purpose:

- Main conversion screen for vendor/activity/product.

Content:

- Hero image gallery.
- Vendor/activity name.
- Verified badge.
- Category.
- State/city.
- Rating/reviews.
- Price in RM.
- Distance.
- Opening hours.
- Description.
- Map preview.
- Reviews.

Actions:

- Book Now.
- Chat.
- Share.
- Save.
- Get Directions.

#### C09 - Booking Selection

Purpose:

- Select date, time, package and quantity.

Content:

- Calendar.
- Time slots.
- Package options.
- Add-ons.
- Availability.
- Cancellation note.

#### C10 - Cart

Purpose:

- Review mixed cart.

Content:

- Activity booking item.
- Product purchase item.
- Voucher input.
- Wallet balance toggle.
- Price breakdown.

#### C11 - Checkout

Purpose:

- Complete payment.

Content:

- Customer info.
- Payment method.
- Voucher discount.
- Wallet deduction.
- Total in RM.
- Confirm payment button.

#### C12 - Booking Confirmation

Purpose:

- Confirm booking and guide next action.

Content:

- Booking ID.
- QR code placeholder.
- Date/time.
- Location.
- Get Directions.
- Chat Vendor.
- Share trip.

#### C13 - Customer Chat

Purpose:

- Let customer ask vendor before/after booking.

Content:

- Vendor profile.
- Online/offline.
- Automated welcome message.
- Message bubbles.
- Image/file attachment.
- Booking context card.

#### C14 - Profile

Purpose:

- Manage account and verification.

Content:

- Profile info.
- Saved listings.
- Bookings.
- Wallet shortcut.
- Verification progress.
- Settings.

#### C15 - Verification / KYC

Purpose:

- Unlock earning and withdrawal.

Content:

- Email verified.
- Phone verified.
- Profile complete.
- KYC upload.
- Status: pending, approved, rejected.

#### C16 - Recommend Vendor / Hidden Gem

Purpose:

- Let verified user submit new tourism recommendation.

Fields:

- Place/vendor name.
- Category.
- State/city.
- Location pin.
- Photos.
- Reason for recommendation.
- Contact if known.

#### C17 - Affiliate Dashboard

Purpose:

- Track sharing and commission.

Content:

- Affiliate ID.
- Copy link.
- Clicks.
- Conversions.
- Commission rate.
- Earnings.
- Leaderboard preview.

#### C18 - Share Sheet

Purpose:

- One-tap sharing.

Content:

- WhatsApp.
- Instagram.
- Facebook.
- TikTok.
- Copy link.
- Affiliate link preview.

#### C19 - Wallet

Purpose:

- Manage earnings.

Content:

- Available balance.
- Pending balance.
- Lifetime earnings.
- Ledger.
- Withdraw button.

#### C20 - Withdrawal Request

Purpose:

- Request payout.

Fields:

- Amount.
- Bank/e-wallet destination.
- Confirmation.
- Status after submission.

#### C21 - Customer Support Chatbot

Purpose:

- Help customer resolve issues.

Topics:

- Booking help.
- How rewards work.
- Withdrawal timeline.
- Voucher issues.
- Escalate to admin.

### Vendor Dashboard

#### V01 - Vendor Dashboard Home

Content:

- Revenue.
- Bookings.
- Active listings.
- Voucher redemptions.
- Unread chats.
- Pending tasks.

#### V02 - Vendor Registration

Content:

- Business details.
- Documents.
- Contact.
- Category.
- Outlet address.
- GPS pin.
- Submit for approval.

#### V03 - Multi-Outlet Management

Content:

- Outlet list.
- Status.
- Operating hours.
- Manager assignment.
- Add outlet.

#### V04 - Product / Activity Catalogue

Content:

- Listings table.
- Status.
- Price.
- Stock/capacity.
- Edit button.
- Create listing button.

#### V05 - Add / Edit Listing

Fields:

- Title.
- Category.
- Description.
- Media.
- Price.
- Package type.
- Booking slots.
- Inventory.
- Location.

#### V06 - Pricing And Availability

Content:

- Calendar.
- Time slots.
- Peak/off-peak rules.
- Group pricing.
- Capacity.

#### V07 - Voucher Management

Content:

- Voucher list.
- Create voucher.
- Discount type.
- Validity.
- Usage cap.
- Redemption performance.

#### V08 - Bookings And Orders

Content:

- Calendar/list view.
- Booking status.
- Customer details.
- Payment status.
- Contact customer.

#### V09 - Vendor Chat Inbox

Content:

- Thread list.
- Unread count.
- Outlet filter.
- Booking context.
- Attachments.

#### V10 - Vendor Analytics

Content:

- Sales.
- Booking trend.
- Top listings.
- Voucher performance.
- Share count.
- Customer rating.

### Admin Dashboard

#### A01 - Admin Overview

Content:

- Pending vendor approvals.
- Pending KYC reviews.
- Pending withdrawal requests.
- Recommendation submissions.
- Support tickets.
- Fraud flags.

#### A02 - Vendor Approval

Content:

- Vendor details.
- Business documents.
- Outlet map.
- Approve/reject.
- Rejection reason.

#### A03 - Listing Moderation

Content:

- Submitted listings.
- Category.
- Media.
- Status.
- Approve/reject.

#### A04 - KYC Review

Content:

- User verification details.
- Document status placeholder.
- OCR result placeholder.
- Manual review.
- Approve/reject.

#### A05 - Recommendation Moderation

Content:

- Submitted vendor/hidden gem.
- Duplicate flag.
- Quality score.
- Approve/reject/contact vendor.

#### A06 - Withdrawal Approval

Content:

- Request amount.
- Destination.
- Wallet ledger.
- KYC status.
- Fraud flags.
- Approve/reject/hold.
- Dual approval for high-value requests.

#### A07 - Support Tickets

Content:

- Ticket queue.
- AI category.
- Priority.
- Assigned admin.
- Conversation context.

#### A08 - Admin AI Assistant

Example prompts:

- Show pending withdrawals above RM 500.
- Summarize suspicious recommendation submissions.
- Draft a vendor rejection message.
- Which support issues are increasing this week?

#### A09 - User And Role Management

Content:

- Users table.
- Role assignment.
- Permission groups.
- Account status.

#### A10 - Platform Analytics

Content:

- Booking revenue.
- Active users.
- Vendor growth.
- Share-to-conversion.
- Reward payout trend.
- Top states/categories.

#### A11 - Category And Content Management

Content:

- Manage tourism categories.
- Featured states.
- Homepage banners.
- FAQ content.

#### A12 - Fraud And Risk Review

Content:

- Duplicate recommendation flags.
- Suspicious click patterns.
- High-value withdrawal flags.
- Chat/report flags.

## 9. Core Prototype Flows

### Flow 1: Tourist Discovers And Books

1. C01 Splash / App Entry
2. C02 Preference Survey
3. C03 Explore Malaysia Home
4. C06 Malaysia Map / Near Me
5. C08 Listing Detail
6. C13 Customer Chat
7. C09 Booking Selection
8. C10 Cart
9. C11 Checkout
10. C12 Booking Confirmation

### Flow 2: Search By Malaysia Destination

1. C03 Explore Malaysia Home
2. Select state: Penang / Sabah / Langkawi
3. C04 Search Results
4. C05 Category Browse
5. C08 Listing Detail

### Flow 3: Verified User Earns Reward

1. C14 Profile
2. C15 Verification / KYC
3. Admin reviews in A04 KYC Review
4. C16 Recommend Vendor / Hidden Gem
5. Admin reviews in A05 Recommendation Moderation
6. Reward appears in C19 Wallet as pending balance

### Flow 4: Affiliate Sharing

1. C08 Listing Detail
2. C18 Share Sheet
3. Share to WhatsApp / Instagram / Facebook / TikTok
4. C17 Affiliate Dashboard shows clicks and conversions
5. C19 Wallet shows commission

### Flow 5: Wallet Withdrawal

1. C19 Wallet
2. C20 Withdrawal Request
3. A06 Withdrawal Approval
4. C19 Wallet ledger updated

### Flow 6: Vendor Publishes Tourism Listing

1. V02 Vendor Registration
2. A02 Vendor Approval
3. V03 Multi-Outlet Management
4. V05 Add / Edit Listing
5. V06 Pricing And Availability
6. Listing appears on C03 Explore and C08 Listing Detail

### Flow 7: Admin Handles Support With AI

1. C21 Customer Support Chatbot
2. Escalate to A07 Support Tickets
3. A08 Admin AI Assistant summarizes issue
4. Admin replies or resolves ticket

## 10. Prototype States To Design

Design these states in Figma because they make the prototype feel complete:

- Guest browsing without login.
- Guest trying to book.
- User with incomplete verification trying to earn.
- KYC pending.
- KYC approved.
- KYC rejected with reason.
- Voucher valid.
- Voucher invalid / expired.
- Payment success.
- Payment failed.
- Location permission denied.
- No nearby results.
- Vendor offline in chat.
- Unread chat.
- Withdrawal pending.
- Withdrawal approved.
- Withdrawal rejected.
- Withdrawal on hold.
- High-value withdrawal needs second approval.
- Recommendation marked as duplicate.
- Empty vendor catalogue.
- Empty booking history.
- Admin queue with no pending items.

## 11. Sample Malaysia Data For Figma

Create 12 realistic sample listings:

1. Penang Street Food Trail
   - Category: Food and Dining
   - Location: George Town, Penang
   - Price: RM 68
   - AI reason: Matches your food interest

2. Langkawi Island Hopping
   - Category: Island and Beach
   - Location: Langkawi, Kedah
   - Price: RM 120
   - AI reason: Popular with couples

3. Melaka Heritage Walk
   - Category: Heritage and Culture
   - Location: Melaka City
   - Price: RM 45
   - AI reason: Cultural experience near your route

4. Kinabalu Nature Day Trip
   - Category: Nature and Hiking
   - Location: Kota Kinabalu, Sabah
   - Price: RM 180
   - AI reason: Matches your outdoor preference

5. Sarawak Cultural Village Experience
   - Category: Culture
   - Location: Kuching, Sarawak
   - Price: RM 95
   - AI reason: Hidden gem

6. KL Craft Market
   - Category: Shopping and Local Retail
   - Location: Kuala Lumpur
   - Price: RM 20
   - AI reason: Trending in Kuala Lumpur

7. Johor Family Theme Park Day Pass
   - Category: Family Activities
   - Location: Iskandar Puteri, Johor
   - Price: RM 160
   - AI reason: Family-friendly

8. Selangor Wellness Spa
   - Category: Wellness and Spa
   - Location: Petaling Jaya, Selangor
   - Price: RM 138
   - AI reason: Relaxation pick

9. Perak Waterfall Hidden Gem
   - Category: Hidden Gems
   - Location: Ipoh, Perak
   - Price: RM 35
   - AI reason: Surprise Me

10. Terengganu Turtle Conservation Visit
   - Category: Nature and Conservation
   - Location: Kuala Terengganu
   - Price: RM 75
   - AI reason: Seasonal experience

11. Pahang Highlands Tea Walk
   - Category: Nature and Leisure
   - Location: Cameron Highlands, Pahang
   - Price: RM 55
   - AI reason: Cool weather escape

12. Putrajaya Lake Cruise
   - Category: City Experience
   - Location: Putrajaya
   - Price: RM 50
   - AI reason: Near you

Each listing card should include:

- Hero image.
- Name.
- State/city.
- Category.
- Rating.
- Price in RM.
- Distance.
- Opening status.
- AI reason tag.
- Verified vendor badge.
- Share/save actions.

## 12. Database Implementation Plan

Use these main tables or collections:

### User And Access

- users
- user_profiles
- roles
- permissions
- user_verifications
- kyc_submissions

### Vendor And Listing

- vendors
- outlets
- outlet_managers
- listings
- listing_categories
- listing_media
- listing_availability
- pricing_rules
- inventory

### Booking And Payment

- carts
- cart_items
- bookings
- orders
- order_items
- payments
- payment_methods
- receipts

### Voucher And Promotion

- vouchers
- voucher_rules
- voucher_redemptions

### Chat And Support

- chat_threads
- chat_messages
- message_attachments
- support_tickets
- ticket_messages

### Map And Location

- locations
- geocoding_cache
- user_location_preferences

### Recommendation And AI

- preference_surveys
- user_preference_tags
- listing_embeddings
- recommendation_events
- recommendation_feedback

### Reward, Affiliate And Wallet

- affiliate_profiles
- affiliate_links
- share_events
- click_events
- conversion_events
- commissions
- recommendation_submissions
- rewards
- wallets
- wallet_ledger
- withdrawal_requests
- withdrawal_approvals

### Admin And Audit

- admin_actions
- approval_logs
- fraud_flags
- moderation_notes
- system_settings

## 13. Backend API Implementation Plan

### Auth API

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-email`
- `POST /auth/verify-phone`
- `GET /auth/me`

### Discovery API

- `GET /listings`
- `GET /listings/:id`
- `GET /categories`
- `GET /destinations`
- `GET /search`
- `GET /near-me`

### Recommendation API

- `POST /preferences`
- `GET /recommendations`
- `POST /recommendations/feedback`

### Vendor API

- `POST /vendors`
- `GET /vendors/:id`
- `POST /vendors/:id/outlets`
- `POST /listings`
- `PATCH /listings/:id`
- `POST /availability`
- `POST /pricing-rules`

### Booking API

- `POST /cart/items`
- `GET /cart`
- `POST /checkout`
- `GET /bookings`
- `GET /bookings/:id`

### Voucher API

- `POST /vouchers`
- `POST /vouchers/validate`
- `GET /vendors/:id/vouchers`

### Chat API

- `POST /chat/threads`
- `GET /chat/threads`
- `GET /chat/threads/:id/messages`
- WebSocket event: `message:send`
- WebSocket event: `message:read`

### Verification API

- `POST /kyc/submissions`
- `GET /kyc/status`
- `PATCH /admin/kyc/:id/review`

### Recommendation Reward API

- `POST /recommendations/submissions`
- `GET /recommendations/submissions`
- `PATCH /admin/recommendations/:id/review`

### Affiliate And Sharing API

- `GET /affiliate/profile`
- `POST /affiliate/links`
- `POST /share-events`
- `GET /affiliate/analytics`

### Wallet API

- `GET /wallet`
- `GET /wallet/ledger`
- `POST /withdrawals`
- `PATCH /admin/withdrawals/:id/review`

### Admin API

- `GET /admin/dashboard`
- `GET /admin/vendor-applications`
- `PATCH /admin/vendors/:id/review`
- `GET /admin/support-tickets`
- `POST /admin/ai-assistant/query`
- `GET /admin/analytics`

## 14. AI Implementation Plan

### AI Recommendation Engine

Inputs:

- User preference survey.
- Current location.
- Listing category and tags.
- Budget.
- Travel style.
- Group type.
- Accessibility needs.
- Saved/booked/shared/rated events.

Ranking logic:

- Hard filters: accessibility, budget, location radius, availability.
- Content similarity: listing tags and description match preference profile.
- Location boost: nearer listings rank higher.
- Behaviour boost: saved, booked and highly rated listings influence future ranking.
- Freshness boost: new or seasonal listings get limited boost.
- Diversity rule: avoid showing only one category repeatedly.

Figma display:

- Show recommendation reason tags.
- Add "Why this is recommended" bottom sheet.
- Add Surprise Me action.

### Admin Chatbot

Use cases:

- Summarize pending approvals.
- Draft vendor approval/rejection messages.
- Categorize support tickets.
- Highlight suspicious withdrawals or recommendations.
- Answer internal policy questions.

Privacy rule:

- Do not send sensitive KYC documents or private customer data to external AI.
- Use summaries and masked data in prototype notes.

## 15. Map Implementation Plan

Recommended stack:

- Google Maps Platform for Maps, Directions, Geocoding and Places.
- Mapbox can be used as alternative if cost is a concern.

Functions:

- Vendor submits address and GPS pin.
- Admin can adjust map pin during approval.
- Listing page shows embedded map.
- Near Me uses customer GPS and radius filter.
- Route preview shows ETA and distance.
- Geocoding results cached to reduce cost.

Figma notes:

- Show map as a realistic mock map.
- Use custom category pins.
- Use selected pin state and cluster pin state.

## 16. Wallet And Reward Rules

### Wallet Balance Types

- Pending balance: earnings waiting for clearance.
- Available balance: can be used or withdrawn.
- Lifetime earnings: total historical earnings.

### Earning Sources

- Affiliate commission.
- Community recommendation reward.
- Vendor referral bonus.
- Refund or adjustment.

### Withdrawal Rules

- KYC approval required before withdrawal.
- Minimum withdrawal amount should be configurable.
- Admin approval required for all withdrawals.
- High-value withdrawal requires two approvers.
- Rejected withdrawal returns funds to available balance.
- On-hold withdrawal keeps funds reserved until resolved.

## 17. Security And Compliance Plan

Important requirements:

- HTTPS everywhere.
- JWT or session-based authentication.
- Role-based access control.
- Password hashing.
- KYC documents encrypted at rest.
- Wallet ledger should be append-only.
- Admin actions must be logged.
- Payment handled through trusted gateway.
- No raw card storage.
- PII masking in admin and AI workflows.
- Rate limiting for login, OTP, share tracking and affiliate clicks.
- Fraud detection for repeated clicks, duplicate recommendations and suspicious withdrawals.

## 18. Development Roadmap

### Phase 1: Foundation

Build:

- Auth and roles.
- Customer profile.
- Vendor registration.
- Admin approval basic flow.
- Listing categories.
- Basic listing CRUD.
- Explore home.
- Search and filters.

Prototype must show:

- Customer discovery.
- Vendor registration.
- Admin vendor approval.

### Phase 2: Discovery, Map And Listing Experience

Build:

- Listing detail.
- Malaysia destination filters.
- Map view.
- Near Me.
- Get Directions.
- Save listing.
- AI preference survey mock.

Prototype must show:

- Explore Malaysia to map to listing detail.
- AI reason tags.

### Phase 3: Booking And Commerce

Build:

- Booking selection.
- Cart.
- Voucher validation.
- Checkout.
- Payment success/failure states.
- Booking confirmation.
- Vendor booking dashboard.

Prototype must show:

- Full tourist booking journey.

### Phase 4: Chat And Support

Build:

- Customer-vendor chat.
- Vendor inbox.
- Customer support chatbot.
- Support ticket escalation.

Prototype must show:

- Chat before booking.
- Support escalation.

### Phase 5: Verification, Rewards And Wallet

Build:

- Verification progress.
- KYC submission.
- Admin KYC review.
- Wallet ledger.
- Recommendation submission.
- Reward pending/available.
- Withdrawal request and approval.

Prototype must show:

- User unlocks earning.
- Wallet withdrawal approval.

### Phase 6: Affiliate, Sharing And Analytics

Build:

- Affiliate profile.
- Share links.
- Share event tracking.
- Click and conversion tracking.
- Affiliate dashboard.
- Vendor share analytics.
- Admin analytics.

Prototype must show:

- Share listing to social app.
- Commission appears in wallet.

### Phase 7: AI And Admin Operations Polish

Build:

- Recommendation ranking service.
- Recommendation monitoring.
- Admin AI assistant.
- Fraud review.
- Platform analytics.
- Content management.

Prototype must show:

- Admin uses AI assistant to manage approval/support workload.

## 19. MVP Scope For FYP Prototype

If time is limited, prioritize these flows:

1. Tourist discovery and booking.
2. Map navigation.
3. Vendor registration and listing management.
4. Customer-vendor chat.
5. Verification and wallet withdrawal.
6. Affiliate sharing and reward tracking.
7. Admin approval dashboard.

Deprioritize:

- Full drag-and-drop shop builder.
- Real payment gateway integration.
- Real KYC provider integration.
- Full AI model training.
- Complete analytics depth.
- Every possible Malaysian destination page.

## 20. Figma Delivery Checklist

Before finalizing the Figma prototype, make sure it includes:

- Mobile customer app flow.
- Desktop vendor dashboard.
- Desktop admin dashboard.
- Complete design system.
- Malaysia-wide destination selector.
- Map and Near Me flow.
- Listing detail with booking, chat, share and directions.
- Cart and checkout.
- Verification / KYC flow.
- Wallet and withdrawal approval flow.
- Affiliate sharing flow.
- Admin AI assistant.
- Empty, error and approval states.
- Clickable prototype links between main flows.

## 21. Final Figma Prompt

Design a complete Malaysia-wide Tourism Discovery and Commerce System as one unified product. The prototype must include a mobile customer app for exploring Malaysian destinations, AI recommendations, map navigation, vendor chat, booking checkout, vouchers, social sharing, affiliate rewards, verified profile, wallet and withdrawal. It must also include a desktop vendor dashboard for outlet, listing, pricing, voucher, booking and chat management, plus a desktop admin dashboard for vendor approval, KYC review, recommendation moderation, withdrawal approval, support tickets, fraud review, analytics and AI assistant. Use a distinctive Malaysia-inspired design system with rainforest green, straits teal, hibiscus red, harvest gold, real tourism imagery, map route visual language and clear trust/reward states.
