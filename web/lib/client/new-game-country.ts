export const NEW_GAME_COUNTRY = "Беларусь";

// Only new ordinary campaigns are restricted. Saves are resumed without this policy.
// Daily cases keep the country chosen by the shared client/server scenario.
export function countryForNewRun(daily: { country: string } | null = null): string {
  return daily ? daily.country : NEW_GAME_COUNTRY;
}
