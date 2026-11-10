const kshNumberFormat = new Intl.NumberFormat('en-KE', {
  maximumFractionDigits: 2
});

export function formatKsh(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'KSh 0';
  return `KSh ${kshNumberFormat.format(value)}`;
}
