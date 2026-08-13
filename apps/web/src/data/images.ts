// Where a photograph comes from.
//
// Every picture in the app used to be a file in src/assets/images/, bundled and
// hashed by Vite through an import.meta.glob. That made the catalogue part of
// the build: adding a place meant committing a .webp and cutting a release,
// which is the same wrong shape the calendar had before it moved into the
// database. Photographs now live in R2 and are served by the Worker's /img/
// route, so the Board can replace the picture of a tirtha without a deploy.
//
// The keys did not change. A place document says `img: "brahma-sarovar"`, and
// that is still the id — it is simply resolved to a URL now instead of to a
// bundled asset, so the move required no edit to a single row.
//
// WHAT THIS COSTS, stated plainly: a photograph is now a network request where
// it used to be a bundled file. That is a smaller change than it sounds — the
// bundled images were never precached either (the service worker's glob covers
// js/css/html/ico/png/svg, and every one of these is .webp), so they always
// came over the network. What is new is that the service worker now caches them
// at runtime, so a picture survives being seen once. See vite.config.ts.
//
// The `?.` is not decoration: Vite replaces import.meta.env with an object
// literal at build time, but the check scripts import this module under plain
// node where it is undefined, and the unguarded form throws at module load.
import logo from "../assets/images/logo.webp";
import logoSm from "../assets/images/logo-sm.webp";

const MEDIA = (import.meta.env?.VITE_MEDIA_URL || "").replace(/\/$/, "");

/**
 * URL for an image id, or undefined when there is none.
 *
 * Undefined rather than a placeholder URL: every caller already draws its own
 * fallback, and a 404 on a real request is a slower, noisier way of arriving at
 * the same empty frame.
 */
export const imgUrl = (id?: string): string | undefined =>
  id ? `${MEDIA}/img/${encodeURIComponent(id)}.webp` : undefined;

/**
 * What a photograph shows, in words.
 *
 * Every picture in the app was announced as the place's name or as nothing at
 * all, because there was nowhere to say anything else: a document held ids and
 * no room for a sentence about one. The dashboard now writes an `alt` map on
 * the record, keyed by photograph id, and this is the one place that reads it.
 *
 * The fallback is the record's name rather than "" — for the FIRST picture,
 * where the name is a true description of what is on screen. A caller drawing a
 * second or third shot of the same place passes "" instead, because repeating
 * the name three times tells a screen reader nothing it has not just heard.
 */
export const photoAlt = (
  rec: { alt?: Record<string, string> } | undefined,
  id: string | undefined,
  fallback: string,
): string => (id && rec?.alt?.[id]) || fallback;

/**
 * The seal, and it stays in the bundle.
 *
 * Deliberately not in R2 with the rest. This is not content — nobody is going
 * to edit the Board's own mark from a dashboard — and it is drawn in the header
 * of every screen and on the splash, which is the first paint on the slowest
 * connection this app is built for. A logo that arrives over the network is a
 * masthead that flickers in. Twenty-one kilobytes is the right price for that
 * not happening.
 */
export const LOGO = logo;
export const LOGO_SM = logoSm;
