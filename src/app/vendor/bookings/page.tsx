// P2 — Member 2 owns slot management
// Sub-module: B3 Booking Slots

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function VendorBookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, outlets(id)')
    .eq('owner_id', user!.id)
    .single();

  const outletIds = ((vendor?.outlets as Record<string, unknown>[]) ?? []).map(o => String(o.id));

  const { data: slots } = await supabase
    .from('booking_slots')
    .select('*, products(name)')
    .in('outlet_id', outletIds.length ? outletIds : ['none'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at');

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, order_items(product_name, quantity), users(full_name, email)')
    .in('slot_id', (slots ?? []).map(s => s.id))
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Booking Slots</h1>
        {/* TODO P2/B3: Add slot form */}
        <button className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition-colors">
          + Add Slot
        </button>
      </div>

      {/* Upcoming slots */}
      <section>
        <h2 className="font-medium text-sm mb-3 text-gray-500 uppercase tracking-wide">Upcoming Slots</h2>
        <div className="space-y-2">
          {(slots ?? []).map(slot => (
            <div key={slot.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">{(slot.products as Record<string, unknown>)?.name as string}</p>
                <p className="text-xs text-gray-400">
                  {format(new Date(slot.starts_at), 'd MMM yyyy, HH:mm')} – {format(new Date(slot.ends_at), 'HH:mm')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm">{slot.booked}/{slot.capacity} booked</p>
                <StatusBadge status={slot.status} />
              </div>
            </div>
          ))}
          {(slots ?? []).length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No upcoming slots</p>
          )}
        </div>
      </section>

      {/* Confirmed bookings */}
      <section>
        <h2 className="font-medium text-sm mb-3 text-gray-500 uppercase tracking-wide">Confirmed Bookings</h2>
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-gray-500 text-left">
                <th className="p-3">Customer</th>
                <th className="p-3">Product</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Status</th>
                <th className="p-3">Check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(bookings ?? []).map(b => (
                <tr key={b.id}>
                  <td className="p-3">{(b.users as Record<string, unknown>)?.full_name as string ?? 'Unknown'}</td>
                  <td className="p-3">{(b.order_items as Record<string, unknown>)?.product_name as string}</td>
                  <td className="p-3">{(b.order_items as Record<string, unknown>)?.quantity as number}</td>
                  <td className="p-3"><StatusBadge status={b.status} /></td>
                  <td className="p-3">
                    {/* TODO P2/B4: Check-in QR scanner / manual check-in button */}
                    {b.status === 'confirmed' && (
                      <button className="text-xs text-primary-600 hover:underline">Check In</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(bookings ?? []).length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No bookings yet</p>
          )}
        </div>
      </section>
    </div>
  );
}
