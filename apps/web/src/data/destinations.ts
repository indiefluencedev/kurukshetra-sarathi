import data from "@/content/data/destinations.json";
import type { Destination } from "@/shared/types";

// The 36 tirthas. Source of truth: src/content/data/destinations.json (each
// text field is { en, hi } so a place can't be added without its Hindi). See docs/04.
export const D = data as unknown as Destination[];
