export function formatUsd(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (value === 0) {
    return '$0.00';
  }

  return `${sign}$${formatted}`;
}

export function formatWallet(address: string): string {
  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
