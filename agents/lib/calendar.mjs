// Publishing calendar.
//
// Peak windows are a *starting heuristic*, not measured data for this site:
// weekday mornings and late afternoons in UTC, Tuesday–Thursday weighted
// highest. After 30 days of your own analytics, replace PEAKS with the hours
// your readers actually arrive — the rest of the system does not change.

export const PEAKS = [
  { days: [2, 3, 4], hour: 8, weight: 3, label: 'Tue–Thu morning' },
  { days: [2, 3, 4], hour: 17, weight: 2, label: 'Tue–Thu afternoon' },
  { days: [1, 5], hour: 9, weight: 1, label: 'Mon/Fri morning' },
];

const DAY_MS = 86400000;

/** All peak slots after `from`, ordered, as UTC ISO strings. */
export function nextSlots({ count = 10, from = new Date(), minLeadHours = 12 } = {}) {
  const slots = [];
  const start = new Date(from.getTime() + minLeadHours * 3600000);
  for (let d = 0; d < 120 && slots.length < count; d++) {
    const day = new Date(start.getTime() + d * DAY_MS);
    const dow = day.getUTCDay();
    const todays = PEAKS.filter((p) => p.days.includes(dow)).sort((a, b) => a.hour - b.hour);
    for (const peak of todays) {
      const slot = new Date(Date.UTC(
        day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), peak.hour, 0, 0,
      ));
      if (slot.getTime() <= start.getTime()) continue;
      slots.push({
        at: slot.toISOString().replace('.000Z', 'Z'),
        date: slot.toISOString().slice(0, 10),
        hour: peak.hour,
        weight: peak.weight,
        label: peak.label,
      });
      if (slots.length >= count) break;
    }
  }
  return slots;
}

/** Is this slot still in the future? */
export const isFuture = (iso) => new Date(iso).getTime() > Date.now();

/** Human line for logs: "Tue 20 Oct, 08:00 UTC (Tue–Thu morning)". */
export function describeSlot(slot) {
  const d = new Date(slot.at);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${String(slot.hour).padStart(2, '0')}:00 UTC (${slot.label})`;
}
