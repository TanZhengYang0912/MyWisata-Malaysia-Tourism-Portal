do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'users','roles','user_roles','email_verifications','phone_verifications','kyc_submissions',
      'notifications','audit_logs','chat_threads','chat_messages','chat_message_reads','chatbot_sessions',
      'chatbot_messages','chatbot_kb_documents','chatbot_message_kb_refs','support_tickets','platform_settings',
      'categories','vendors','outlets','outlet_pages','outlet_managers','products','product_variants',
      'price_rules','inventory','booking_slots','vouchers','media_assets','user_preferences',
      'vendor_recommendations','recommendation_conversions','commission_rules','recommendation_commissions',
      'affiliate_links','affiliate_clicks','affiliate_attributions','reviews','share_events',
      'user_interactions','recommendation_snapshots','geocode_cache','carts','cart_items','orders',
      'order_items','voucher_redemptions','bookings','payments','refunds','wallets','wallet_ledger',
      'payout_destinations','withdrawal_requests','withdrawal_approvals','payout_transactions','idempotency_keys'
    ])
  loop
    execute format(
      'create policy "demo_allow_all" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
;
