// Framing policy of vertal.dev.
//
// Only the embed entry (/embed and its sub-paths) may be shown in a frame on
// any website. Every other page (auth, dashboard, builder, settings, ...)
// keeps the ecosystem allowlist (vertal.app, *.vertal.app, vertalrun.com), so
// third-party sites can't frame them (clickjacking protection).
// Sign-in from the embed happens in a popup window, never inside the frame.

export const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://vertal.app https://*.vertal.app https://vertalrun.com https://www.vertalrun.com";

export const EMBED_FRAME_ANCESTORS = 'frame-ancestors *';

export const EMBED_PATH = '/embed';

/** True for /embed, /embed/ and /embed/<anything>; never for /embedded or /embed-x. */
export function isEmbedPath(pathname: string): boolean {
  return pathname === EMBED_PATH || pathname.startsWith(`${EMBED_PATH}/`);
}

export function frameAncestorsFor(pathname: string): string {
  return isEmbedPath(pathname) ? EMBED_FRAME_ANCESTORS : FRAME_ANCESTORS;
}
