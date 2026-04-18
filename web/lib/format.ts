const UTC_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
};

export function formatUTC(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', UTC_OPTS);
}
