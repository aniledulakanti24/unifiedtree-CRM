// Time zones and sample history for working across countries.
export const allZones = () => {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']; }
};
export const localTime = (zone, locale) => { try { return new Date().toLocaleTimeString(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit', weekday: 'short' }); } catch { return ''; } };

const CITY_ZONE = { Boston: 'America/New_York', 'New York': 'America/New_York', Austin: 'America/Chicago', Seattle: 'America/Los_Angeles', Denver: 'America/Denver', Toronto: 'America/Toronto', London: 'Europe/London', Berlin: 'Europe/Berlin', Mumbai: 'Asia/Kolkata', Singapore: 'Asia/Singapore' };

// Gives the sample company's customers a time zone, and spreads its invoices' tax out of their totals. Totals stay as they are.
export const upgradeSampleTax = (d) => {
  if (d.taxV1) return d;
  const rate = Number(d.settings.taxRate) || 0;
  const invoices = (d.invoices || []).map((i) => {
    if (i.taxes) return i;
    const taxable = Math.round((i.total / (1 + rate / 100)) * 100) / 100;
    return { ...i, taxes: { taxable, tax: Math.round((i.total - taxable) * 100) / 100, rate, inclusive: true } };
  });
  return { ...d, taxV1: true, invoices, companies: (d.companies || []).map((c) => (c.timezone || !CITY_ZONE[c.city] ? c : { ...c, timezone: CITY_ZONE[c.city] })) };
};

// How much a change in exchange rate has been worth. Amounts are in the main currency.
export const exchangeDifferences = (db, invoices, rateOf) => {
  const realised = db.payments.filter((p) => p.currency && p.rateAtPayment && p.fxRate).map((p) => {
    const inDoc = p.amount * p.fxRate;
    return { id: p.id, number: p.number, currency: p.currency, date: p.date, booked: p.amount, atPayment: inDoc / p.rateAtPayment, diff: inDoc / p.rateAtPayment - p.amount, companyId: p.companyId, fromRate: p.fxRate, toRate: p.rateAtPayment };
  });
  const open = invoices.filter((i) => i.currency && i.fxRate && i.total - (i.paid || 0) > 0.005 && rateOf(i.currency)).map((i) => {
    const bal = i.total - (i.paid || 0);
    const atToday = (bal * i.fxRate) / rateOf(i.currency);
    return { id: i.id, number: i.number, currency: i.currency, date: i.date, booked: bal, atToday, diff: atToday - bal, companyId: i.companyId, fromRate: i.fxRate, toRate: rateOf(i.currency) };
  });
  return { realised, open };
};
