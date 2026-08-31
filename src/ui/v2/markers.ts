/**
 * Chart marker copy (M4.5 D.1 adjustments): short labels on the lines
 * ("401k stop", "IPO", "7% → 5%"), full engine labels in the crosshair
 * readout. No "+1" internal-convention leaks.
 */

import type { MarkerEvent } from '../../engine/types';

export function shortMarkerLabel(e: MarkerEvent, singleFiler: boolean): string {
  if (e.kind === 'returnChange') return e.label.replace(/^return /, '');
  if (e.kind === 'contributionChange') {
    let s = e.label.replace(' contributions', '');
    if (singleFiler) s = s.replace(/ \(filer \d+\)/, '');
    return s;
  }
  return e.label; // windfalls: the user's own label; others: engine label
}

/** Combine multiple markers at one x position without leaking counts as "+1". */
export function joinMarkerLabels(labels: string[]): string {
  if (labels.length <= 2) return labels.join(' · ');
  return `${labels[0]} · ${labels[1]} · +${labels.length - 2} more`;
}
