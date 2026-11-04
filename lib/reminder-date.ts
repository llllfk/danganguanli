export function daysUntil(date: string, today = new Date()) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - current) / 86_400_000);
}
export function reminderDateLabel(days: number) {
  return days < 0 ? `已超期${Math.abs(days)}天` : `剩余 ${days} 天`;
}
