/**
 * ROUND() as Excel does it, which the department's gradebooks are written in. Client-safe.
 *
 * A plain Math.round(x * 100) / 100 disagrees with Excel at halves: 37.55 / 50 * 25 is stored
 * as 18.774999999999999, which rounds to 18.77, while Excel - working to 15 significant
 * digits - sees 18.775 and gives 18.78. So: trim to 15 significant digits first, then round
 * half away from zero (Excel's rule for negatives too).
 */
export function excelRound(x: number, places = 0): number {
  if (!Number.isFinite(x)) return x;
  const f = Math.pow(10, places);
  const scaled = Number((Math.abs(x) * f).toPrecision(15));
  return (Math.sign(x) * Math.round(scaled)) / f;
}
