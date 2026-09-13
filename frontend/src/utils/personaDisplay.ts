/** Strip a trailing " — …" role suffix from persona names. */
export function personaShortName(name: string): string {
  const idx = name.indexOf(' — ');
  return idx === -1 ? name : name.slice(0, idx).trim();
}


export function personaDisplayLabel(
  name: string,
  roleLabel?: string | null,
): string {
  const short = personaShortName(name);
  const role = roleLabel?.trim();
  return role ? `${short} — ${role}` : short;
}
