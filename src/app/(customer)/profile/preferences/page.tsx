'use client';
// P3 — Member 3 owns this page
// Sub-module: C2 Preferences + Rule Recommendation

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

const INTERESTS = ['food', 'nature', 'cultural', 'adventure', 'nightlife', 'wellness', 'shopping', 'family'];
const STYLES    = [
  { value: 'budget',    label: 'Budget Backpacker' },
  { value: 'mid_range', label: 'Mid-Range Explorer' },
  { value: 'luxury',    label: 'Luxury Traveller' },
  { value: 'business',  label: 'Business Traveller' },
  { value: 'family',    label: 'Family Group' },
];
const BUDGETS = [
  { value: 'under_20', label: 'Under RM20/activity' },
  { value: '20_80',    label: 'RM20–80' },
  { value: '80_200',   label: 'RM80–200' },
  { value: '200_plus', label: 'RM200+' },
];

export default function PreferencesPage() {
  const supabase = createClient();
  const [interests, setInterests] = useState<string[]>([]);
  const [style,    setStyle]      = useState('');
  const [budget,   setBudget]     = useState('');
  const [radius,   setRadius]     = useState(20);
  const [loading,  setLoading]    = useState(false);
  const [saved,    setSaved]      = useState(false);

  function toggleInterest(tag: string) {
    setInterests(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function handleSave() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('user_preferences').upsert({
      user_id:              user!.id,
      interest_tags:        interests,
      travel_style:         style || null,
      budget_range:         budget || null,
      preferred_radius_km:  radius,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id' });
    // TODO P3/C2: trigger recommendation snapshot regeneration
    setSaved(true);
    setLoading(false);
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">Travel Preferences</h1>
      <p className="text-sm text-gray-500">Help us personalise your discovery feed.</p>

      {/* Interests */}
      <section>
        <h2 className="font-medium text-sm mb-3">What interests you?</h2>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleInterest(tag)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors capitalize
                ${interests.includes(tag)
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Travel style */}
      <section>
        <h2 className="font-medium text-sm mb-3">Travel style</h2>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map(s => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              className={`p-2.5 rounded-lg border text-sm transition-colors text-left
                ${style === s.value
                  ? 'bg-primary-50 border-primary-500 text-primary-700'
                  : 'bg-white border-gray-200 hover:border-gray-300'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Budget */}
      <section>
        <h2 className="font-medium text-sm mb-3">Budget range</h2>
        <div className="grid grid-cols-2 gap-2">
          {BUDGETS.map(b => (
            <button
              key={b.value}
              onClick={() => setBudget(b.value)}
              className={`p-2.5 rounded-lg border text-sm transition-colors text-left
                ${budget === b.value
                  ? 'bg-primary-50 border-primary-500 text-primary-700'
                  : 'bg-white border-gray-200 hover:border-gray-300'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {/* Radius */}
      <section>
        <h2 className="font-medium text-sm mb-2">Max distance: {radius} km</h2>
        <input
          type="range" min={1} max={100} value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          className="w-full accent-primary-600"
        />
      </section>

      {saved && <p className="text-sm text-green-600">Preferences saved! Your discovery feed will update.</p>}

      <Button onClick={handleSave} loading={loading} className="w-full">
        Save Preferences
      </Button>
    </div>
  );
}
