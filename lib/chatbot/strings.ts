// P4 — Member 4: localized fixed chatbot strings (EN / BM / Chinese).
// CLAUDE-P4-EXTRAS.md Extra 1.
//
// The LLM-generated answer text already comes back in the user's language
// (generate.ts's system prompt instructs this directly) — these are the
// strings that never touch the LLM at all: the intent-gated replies
// (greeting/chitchat/unclear) and the KB-miss fallback in answer.ts, plus
// the feedback-flow chrome (chatbot-widget.tsx) that sits next to every bot
// message. Kept in one map, per the extras doc's own instruction, rather
// than scattered inline — makes it possible to audit "same meaning, three
// languages" at a glance instead of hunting through two files.

import type { ChatLanguage } from './language';

export interface ChatStrings {
  fallback: string;
  sensitiveUnavailable: string;
  greeting: string;
  chitchat: string;
  unclear: string;
  wasThisHelpful: string;
  yes: string;
  no: string;
  gladToHelp: string;
  wantTicket: string;
  creatingTicket: string;
  noProblem: string;
  ticketCreatedPrefix: string;
  ticketCreatedSuffix: string;
  viewMyTickets: string;
  ticketErrorText: string;
  somethingWrong: string;
}

export const CHAT_STRINGS: Record<ChatLanguage, ChatStrings> = {
  en: {
    fallback:
      "I'm an AI assistant and I can only help with things like bookings, vouchers, your wallet, withdrawals, and affiliate questions — I couldn't answer that one.",
    sensitiveUnavailable: "I can't confirm that from a reviewed support article or your account record. I can check your status or connect you with Support.",
    greeting:
      "Hi, I'm MYLawatan Bot. I can check your order, booking, or refund status, answer common questions, and help you find products and catalogue prices. What would you like to do?",
    chitchat: "Glad to help! Let me know if there's anything else you need.",
    unclear: "Could you tell me a bit more about what you need help with?",
    wasThisHelpful: "Was this helpful?",
    yes: "Yes",
    no: "No",
    gladToHelp: "Glad I could help.",
    wantTicket: "Want to open a support ticket?",
    creatingTicket: "Creating…",
    noProblem: "No problem. Ask me anything else.",
    ticketCreatedPrefix: "Done — ticket #",
    ticketCreatedSuffix: " created. Our team will reply; you'll see it under My Tickets.",
    viewMyTickets: "View my tickets",
    ticketErrorText: "Couldn't create a ticket right now. Please try again.",
    somethingWrong: "Sorry, something went wrong. Please try again.",
  },
  bm: {
    fallback:
      "Saya pembantu AI dan hanya boleh bantu dengan perkara seperti tempahan, baucar, dompet, pengeluaran, dan soalan affiliate — soalan itu saya tidak dapat jawab.",
    sensitiveUnavailable: "Saya tidak dapat mengesahkan perkara itu daripada artikel sokongan yang telah disemak atau rekod akaun anda. Saya boleh menyemak status atau menghubungkan anda dengan pasukan sokongan.",
    greeting:
      "Hai, saya MYLawatan Bot. Saya boleh menyemak status pesanan, tempahan atau bayaran balik, menjawab soalan lazim, serta membantu anda mencari produk dan harga katalog. Apa yang anda ingin lakukan?",
    chitchat: "Sama-sama! Beritahu saya jika ada apa-apa lagi yang awak perlukan.",
    unclear: "Boleh awak terangkan sedikit lagi apa yang awak perlukan bantuan?",
    wasThisHelpful: "Adakah ini membantu?",
    yes: "Ya",
    no: "Tidak",
    gladToHelp: "Gembira dapat membantu.",
    wantTicket: "Nak buka tiket sokongan?",
    creatingTicket: "Sedang mencipta…",
    noProblem: "Tiada masalah. Tanya saya apa-apa sahaja lagi.",
    ticketCreatedPrefix: "Selesai — tiket #",
    ticketCreatedSuffix: " telah dicipta. Pasukan kami akan membalas; anda boleh lihat di bawah Tiket Saya.",
    viewMyTickets: "Lihat tiket saya",
    ticketErrorText: "Tidak dapat mencipta tiket sekarang. Sila cuba lagi.",
    somethingWrong: "Maaf, sesuatu tidak kena. Sila cuba lagi.",
  },
  zh: {
    fallback:
      "我是AI助手，只能协助预订、优惠券、钱包、提现和联盟营销方面的问题——这个问题我无法回答。",
    sensitiveUnavailable: "我无法根据已审核的客服文章或你的账户记录确认这件事。你可以重新查询状态，或联系人工客服。",
    greeting:
      "你好，我是 MYLawatan Bot。我可以帮你查询订单、预订或退款进度，浏览常见问题，也可以按条件帮你找商品和查看目录价格。你想先做什么？",
    chitchat: "很高兴能帮到你！如果还有其他需要，请告诉我。",
    unclear: "可以再多告诉我一些你需要什么帮助吗？",
    wasThisHelpful: "这个回答有帮助吗？",
    yes: "有",
    no: "没有",
    gladToHelp: "很高兴能帮到你。",
    wantTicket: "需要提交支持工单吗？",
    creatingTicket: "创建中…",
    noProblem: "没问题，还有其他问题请随时问我。",
    ticketCreatedPrefix: "完成——工单 #",
    ticketCreatedSuffix: " 已创建。我们的团队会回复；你可以在「我的工单」中查看。",
    viewMyTickets: "查看我的工单",
    ticketErrorText: "暂时无法创建工单，请重试。",
    somethingWrong: "抱歉，出了点问题，请重试。",
  },
};
