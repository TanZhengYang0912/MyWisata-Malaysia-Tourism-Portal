// P1 — Member 1 owns profile + verification
// Sub-module: A2 Profile + Mock Verification

import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/badge';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('users')
    .select('*, user_preferences(*), kyc_submissions(*)')
    .eq('id', user!.id)
    .single();

  const kycSub = (profile?.kyc_submissions as Record<string, unknown>[])?.[0];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Profile</h1>

      {/* Identity card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xl">
          {profile?.full_name?.[0] ?? '?'}
        </div>
        <div>
          <p className="font-semibold">{profile?.full_name ?? 'No name set'}</p>
          <p className="text-sm text-gray-500">{profile?.email}</p>
          <div className="flex gap-2 mt-1">
            <StatusBadge status={profile?.kyc_status ?? 'unverified'} />
          </div>
        </div>
        {/* TODO P1/A2: Edit profile button → modal or /profile/edit */}
        <button className="ml-auto text-sm text-primary-600 hover:underline">Edit</button>
      </div>

      {/* Verification steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold">Verification Status</h2>
        <VerifStep
          step="Email"
          done={!!profile?.email_verified_at}
          description="Required for basic account"
        />
        <VerifStep
          step="Phone"
          done={!!profile?.phone_verified_at}
          description="Required for checkout (demo code: 123456)"
        />
        <VerifStep
          step="Profile"
          done={!!profile?.profile_completed_at}
          description="Required to submit vendor recommendations"
        />
        <VerifStep
          step="KYC / Identity"
          done={profile?.kyc_status === 'approved'}
          pending={profile?.kyc_status === 'pending'}
          description="Required for wallet withdrawals and affiliate earning"
        />

        {/* KYC upload (mock) */}
        {profile?.kyc_status === 'unverified' && (
          <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500 mb-2">Upload a government-issued ID to start KYC</p>
            {/* TODO P1/A2: File upload → kyc_submissions.insert() */}
            <button className="text-sm bg-primary-600 text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 transition-colors">
              Upload ID (Demo)
            </button>
          </div>
        )}
        {kycSub && (
          <p className="text-xs text-gray-400">
            KYC submitted: {String(kycSub.document_type)} — {String(kycSub.status)}
            {kycSub.rejection_reason ? ` — ${String(kycSub.rejection_reason)}` : ''}
          </p>
        )}
      </div>

      {/* Preference survey shortcut */}
      <a
        href="/profile/preferences"
        className="block bg-white rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
      >
        <p className="font-medium text-sm">Travel Preferences</p>
        <p className="text-xs text-gray-400 mt-0.5">Improve your personalised recommendations →</p>
      </a>
    </div>
  );
}

function VerifStep({ step, done, pending, description }: {
  step: string; done: boolean; pending?: boolean; description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs
        ${done ? 'bg-green-500 text-white' : pending ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
        {done ? '✓' : pending ? '…' : '○'}
      </div>
      <div>
        <p className="text-sm font-medium">{step}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </div>
  );
}
