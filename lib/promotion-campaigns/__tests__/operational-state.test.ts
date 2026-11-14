import { describe, expect, it } from 'vitest';
import { campaignRunsOn, countLocationStalls, getEventOperationalLabelKey, getAdminEventScheduleStatus, getEventSessionOn, getNextEventSession } from '@/lib/promotion-campaigns/locations';

describe('location based operational labels', () => {
  it('separates approval from Malaysia operational dates and daily hours', () => {
    const campaign = { starts_at: '2026-10-01T00:00:00+08:00', ends_at: '2026-10-20T23:59:59+08:00', locations: [{ status: 'active', starts_on: '2026-10-12', ends_on: '2026-10-13', opens_at: '10:00', closes_at: '18:00' }] };
    expect(getAdminEventScheduleStatus(campaign, new Date('2026-10-12T09:00:00+08:00'))).toBe('upcoming');
    expect(getAdminEventScheduleStatus(campaign, new Date('2026-10-12T10:00:00+08:00'))).toBe('operating');
    expect(getAdminEventScheduleStatus(campaign, new Date('2026-10-12T18:00:00+08:00'))).toBe('between_sessions');
    expect(getAdminEventScheduleStatus(campaign, new Date('2026-10-13T18:00:00+08:00'))).toBe('ended');
    expect(getAdminEventScheduleStatus({ ...campaign, locations: [{ ...campaign.locations[0], status: 'cancelled' }] }, new Date('2026-10-12T11:00:00+08:00'))).toBe('unconfigured');
  });
  it('shows a break between sessions even within the overall event dates', () => {
    expect(getEventOperationalLabelKey({ visibility: 'live', operationalStatus: 'between_sessions' })).toBe('ui.promotionCampaigns.betweenSessions');
  });
  it('uses the operational location status and supports older projections', () => {
    expect(getEventOperationalLabelKey({ visibility: 'live', operationalStatus: 'operating' })).toBe('ui.promotionCampaigns.operating');
    expect(getEventOperationalLabelKey({ visibility: 'live', operationalStatus: 'upcoming' })).toBe('ui.promotionCampaigns.upcoming');
    expect(getEventOperationalLabelKey({ visibility: 'live' })).toBe('ui.promotionCampaigns.live');
  });
});

describe('next event session', () => {
  const at = (id: string, startsOn: string, endsOn: string, opensAt = '10:00', closesAt = '18:00') => ({ id, name: id, address: null, lat: null, lng: null, startsOn, endsOn, opensAt, closesAt });
  const bangsar = at('bangsar', '2026-10-12', '2026-10-13');
  it('is open now during opening hours', () => {
    expect(getNextEventSession([bangsar], new Date('2026-10-12T11:00:00+08:00'))).toEqual({ location: bangsar, date: '2026-10-12', openNow: true });
  });
  it('is later today before opening', () => {
    expect(getNextEventSession([bangsar], new Date('2026-10-12T09:00:00+08:00'))).toEqual({ location: bangsar, date: '2026-10-12', openNow: false });
  });
  it('moves to the next day after closing', () => {
    expect(getNextEventSession([bangsar], new Date('2026-10-12T18:00:00+08:00'))).toEqual({ location: bangsar, date: '2026-10-13', openNow: false });
  });
  it('has no session after the last day closes', () => {
    expect(getNextEventSession([bangsar], new Date('2026-10-13T18:30:00+08:00'))).toBeNull();
  });
  it('picks the earliest session across locations', () => {
    const penang = at('penang', '2026-10-20', '2026-10-21');
    const early = at('early', '2026-10-15', '2026-10-15', '08:00', '12:00');
    expect(getNextEventSession([penang, early, bangsar], new Date('2026-10-14T12:00:00+08:00'))?.location.id).toBe('early');
  });
});

describe('event session on a chosen day', () => {
  const at = (id: string, startsOn: string, endsOn: string, opensAt = '10:00', closesAt = '18:00') => ({ id, name: id, address: null, lat: null, lng: null, startsOn, endsOn, opensAt, closesAt });
  const bangsar = at('bangsar', '2026-11-12', '2026-11-14');
  const night = at('night', '2026-11-13', '2026-11-13', '19:00', '23:00');
  const morning = at('morning', '2026-11-13', '2026-11-13', '08:00', '12:00');
  it('has no session on a day no location runs', () => {
    expect(getEventSessionOn([bangsar], '2026-11-20', new Date('2026-11-13T14:30:00+08:00'))).toBeNull();
  });
  it('is open now today within opening hours', () => {
    expect(getEventSessionOn([bangsar], '2026-11-13', new Date('2026-11-13T14:30:00+08:00'))).toEqual({ location: bangsar, openNow: true });
  });
  it('is closed now today after closing', () => {
    expect(getEventSessionOn([bangsar], '2026-11-13', new Date('2026-11-13T18:30:00+08:00'))).toEqual({ location: bangsar, openNow: false });
  });
  it('leaves openNow unset for another day or an unknown now', () => {
    expect(getEventSessionOn([bangsar], '2026-11-14', new Date('2026-11-13T14:30:00+08:00'))).toEqual({ location: bangsar });
    expect(getEventSessionOn([bangsar], '2026-11-13')).toEqual({ location: bangsar });
  });
  it('prefers the location open now, then the next one still to close', () => {
    expect(getEventSessionOn([night, bangsar], '2026-11-13', new Date('2026-11-13T14:30:00+08:00'))).toEqual({ location: bangsar, openNow: true });
    expect(getEventSessionOn([morning, night], '2026-11-13', new Date('2026-11-13T14:30:00+08:00'))).toEqual({ location: night, openNow: false });
  });
  it('picks the earlier opening when only the opening time differs', () => {
    expect(getEventSessionOn([night, morning], '2026-11-13')).toEqual({ location: morning });
  });
  it('runs on the first and last day inclusive', () => {
    expect(campaignRunsOn({ locations: [bangsar] }, '2026-11-12')).toBe(true);
    expect(campaignRunsOn({ locations: [bangsar] }, '2026-11-14')).toBe(true);
    expect(campaignRunsOn({ locations: [bangsar] }, '2026-11-15')).toBe(false);
  });
  it('counts only the stalls at that location', () => {
    const stall = (locationId: string) => ({ registrationId: locationId, locationId, stallNumber: '1', stallDescription: '', stallPosterUrl: '', products: [] });
    const vendor = (stalls: ReturnType<typeof stall>[]) => ({ vendorId: 'v', vendorName: 'V', vendorLogoUrl: null, vendorKind: 'shop' as const, stalls });
    expect(countLocationStalls({ vendors: [vendor([stall('bangsar'), stall('night')]), vendor([stall('bangsar')])] }, 'bangsar')).toBe(2);
  });
});
