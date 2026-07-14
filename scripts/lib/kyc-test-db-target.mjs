const PROJECT_REF = /^[a-z0-9]{20}$/;

export function parseKycTestProjectRef(apiUrl) {
  const url = new URL(apiUrl);
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  const canonicalOrigin = match ? `https://${match[1]}.supabase.co` : '';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !match || !PROJECT_REF.test(match[1]) || (apiUrl !== canonicalOrigin && apiUrl !== `${canonicalOrigin}/`)) {
    throw new Error('KYC_TEST_SUPABASE_URL must be a Supabase project API URL with a valid project ref.');
  }
  return match[1];
}

export function parseKycTestDatabaseRef(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('KYC_TEST_DATABASE_URL must use a PostgreSQL connection URI.');
  }

  const direct = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  if (direct) return direct[1];

  const pooler = url.hostname.match(/^[a-z0-9-]+\.pooler\.supabase\.com$/);
  const poolerUser = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]{20})$/);
  if (pooler && poolerUser) return poolerUser[1];

  throw new Error('KYC_TEST_DATABASE_URL must be a recognised Supabase direct or pooler URI.');
}

export function validateKycTestResetTarget({ apiUrl, connectionString, confirmation }) {
  const apiRef = parseKycTestProjectRef(apiUrl);
  const databaseRef = parseKycTestDatabaseRef(connectionString);
  if (databaseRef !== apiRef) {
    throw new Error('KYC_TEST_DATABASE_URL project ref must exactly match KYC_TEST_SUPABASE_URL.');
  }
  if (confirmation !== apiRef) {
    throw new Error(`Refusing destructive replay: set KYC_TEST_DB_RESET_CONFIRM=${apiRef} explicitly for this KYC test project.`);
  }
  return apiRef;
}
