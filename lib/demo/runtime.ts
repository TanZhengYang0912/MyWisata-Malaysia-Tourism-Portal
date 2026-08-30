type DemoRuntimeEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "MYWISATA_DEMO_TOOLS" | "MYWISATA_ENV" | "NODE_ENV" | "VERCEL_ENV"
>>;

export function isDemoToolRuntimeEnabled(
  environment: DemoRuntimeEnvironment = process.env,
): boolean {
  if (environment.MYWISATA_DEMO_TOOLS !== "true") return false;
  if (environment.VERCEL_ENV === "production" || environment.MYWISATA_ENV === "production") return false;

  if (environment.NODE_ENV === "production") {
    return environment.VERCEL_ENV === "preview" || environment.MYWISATA_ENV === "staging";
  }

  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}
