// Contract #3: all money is RM; rounding happens in exactly this one function.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(n: number): string {
  return `RM ${round2(n).toFixed(2)}`;
}
