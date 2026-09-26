export function remoteDemoSeedBlockReason(environment) {
  if (environment.REMOTE_DEMO_SEED !== '1') {
    return 'Refusing to seed a remote database without REMOTE_DEMO_SEED=1.';
  }
  if (environment.VERCEL_ENV === 'production'
    || environment.MYWISATA_ENV === 'production'
    || environment.NODE_ENV === 'production') {
    return 'Remote demo seeding is disabled in production.';
  }
  if (environment.MYWISATA_ENV !== 'staging') {
    return 'Remote demo seeding requires MYWISATA_ENV=staging.';
  }
  return null;
}
