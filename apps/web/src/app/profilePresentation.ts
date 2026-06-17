export function profileFirstName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function formatDashboardGreeting(name: string | null | undefined): string {
  const first = profileFirstName(name);
  return first ? `Hey ${first}` : "Hey there";
}

export function profileAvatarInitial(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toLocaleUpperCase();
}
