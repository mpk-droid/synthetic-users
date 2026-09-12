/** Strip a trailing " — …" role suffix from persona names. */
export function personaShortName(name: string): string {
  const idx = name.indexOf(' — ');
  return idx === -1 ? name : name.slice(0, idx).trim();
}
