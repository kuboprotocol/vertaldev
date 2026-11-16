/** Lista de donos do canal (CHANNEL_OWNER_USER_IDS). Pura, sem I/O. */

export function channelOwnerIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s)),
  );
}
