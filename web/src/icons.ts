// Dime's icons are Charade (charade-icons, from github.com/goodnight000/cstack/icons): at rest
// each one is the ordinary thing; hovered or focused, it acts out its verb once. `mark` (the coin)
// and `cue` (Dime's face) come from the sprite in index.html and never move.
import { icon as charade, sets } from "charade-icons";
import "charade-icons/icons.css";

/** The sets in the order the specimen page shows them. */
export const ICON_SETS = sets;

/**
 * An icon as markup: one of Charade's by name, or the sprite's `mark` / `cue`. `cls` adds classes
 * to the svg (e.g. `cue-face`). Unknown names throw, so a typo fails where it is written.
 */
export function icon(id: string, cls = ""): string {
  if (id === "mark" || id === "cue")
    return `<svg class="${cls}" aria-hidden="true"><use href="#${id}" /></svg>`;
  return charade(id, { class: cls });
}

/** Fills every `<svg data-icon>` placeholder in static markup (the sidebar) with its icon. */
export function hydrateIcons(root: ParentNode): void {
  for (const el of root.querySelectorAll<SVGElement>("svg[data-icon]"))
    el.outerHTML = icon(el.dataset.icon!, el.getAttribute("class") ?? "");
}
