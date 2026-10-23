import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// formatDuration writes a span of time in the reader's language, as precise as people read it: hours and minutes ("3 Std., 10 Min." / "3 hr, 10 min"), only minutes below an hour, "< 1 min" below a minute. Intl.DurationFormat does the wording; where a browser lacks it, dayjs says it in one rounded unit ("3 Stunden").
export function formatDuration(ms, lang) {
    const total = Math.max(0, Math.round(ms / 60000));
    if (total < 1) return lang?.startsWith('de') ? '< 1 Min.' : '< 1 min';
    const parts = { hours: Math.floor(total / 60), minutes: total % 60 };
    if (!parts.hours) delete parts.hours;
    if (!parts.minutes) delete parts.minutes;
    if (typeof Intl !== 'undefined' && Intl.DurationFormat) {
        try {
            return new Intl.DurationFormat(lang, { style: 'short' }).format(parts);
        } catch {
            // an unknown language falls through to dayjs
        }
    }
    return dayjs().add(ms, 'ms').fromNow(true);
}
