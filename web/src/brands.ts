// Merchant marks: every transaction and merchant shows the company's real icon as an app-icon tile.
// Three sources, in order: simple-icons (vector, drawn here in the brand's colours), a logo saved
// once into web/public/brands/ (never fetched from the network at runtime), else a generic Charade
// glyph for things that aren't brands (Rent, Payroll) or a monogram. One tile size per context,
// set by the caller's --bs; every tile has the same footprint and hairline, so none outweighs another.
import "./brands.css";
import {
  siAirbnb, siApple, siChase, siClaude, siDoordash, siIcloud, siInstacart, siLyft,
  siNetflix, siNewyorktimes, siNike, siRobinhood, siShell, siSpotify, siStarbucks, siTarget,
  siTicketmaster, siUber, siUbereats, siUniqlo, siVerizon,
} from "simple-icons";
import { icon } from "./icons.ts";

type Si = { path: string; hex: string };
/** [icon, tile background, glyph colour, glyph size]: the app icon's colours where they differ from
 *  the mark's; wordmarks (Uber, Venmo) run wider than a symbol, so they get more of the tile. */
const SI: Record<string, [Si, string?, string?, number?]> = {
  airbnb: [siAirbnb],
  apple: [siApple],
  chase: [siChase],
  claude: [siClaude],
  doordash: [siDoordash],
  icloud: [siIcloud, "#ffffff", "#3693F3"],
  instacart: [siInstacart],
  lyft: [siLyft],
  netflix: [siNetflix, "#000000", "#E50914"],
  nyt: [siNewyorktimes, "#ffffff", "#000000"],
  nike: [siNike],
  robinhood: [siRobinhood],
  shell: [siShell, "#FFD500", "#DD1D21"],
  spotify: [siSpotify, "#000000", "#1ED760"],
  starbucks: [siStarbucks],
  target: [siTarget, "#ffffff", "#CC0000"],
  ticketmaster: [siTicketmaster],
  uber: [siUber, undefined, undefined, 76],
  ubereats: [siUbereats, "#000000", "#06C167", 80],
  uniqlo: [siUniqlo, "#ffffff", "#FF0000", 100],
  verizon: [siVerizon, "#ffffff", "#CD040B"],
};

/** Logos saved in web/public/brands/<slug>.png. `true` = a full-bleed app icon (fills the tile);
 *  `false` = a mark on transparency (sits on white with a little inset). */
const IMG: Record<string, boolean> = {
  // full-bleed app icons
  alaska: true, amazon: true, amc: true, amex: true, bluebottle: true, calm: true, chasecenter: true,
  chevron: true, comcast: true, equinox: true, geico: true, hertz: true, hulu: true, invesco: true,
  moma: true, nopalito: true, omny: true, philz: true, rei: true, safeway: true, sweetgreen: true,
  vanguard: true, zuni: true,
  // marks on transparency
  burmasuperstar: false, chipotle: false, clipper: false, delfina: false, fillmore: false, hudson: false,
  ishares: false, katz: false, kinkhao: false, mixt: false, pge: false, propertyfood: false, roundhill: false,
  sightglass: false, smugglerscove: false, souvla: false, tacolicious: false, traderjoes: false,
  nobu: false, venmo: false, viacarota: false, walgreens: false, wholefoods: false,
};
/** App icons that carry their own rounded corners: drawn a touch larger so ours crop them. */
const ROUNDED = new Set(["calm", "omny"]);

/** Not brands: a Charade glyph on the neutral tile. */
const GENERIC: Record<string, string> = {
  rent: "home",
  payroll: "briefcase",
  transfertosavings: "bank",
  gym: "activity",
  carinsurance: "shield",
  sneakers: "bag",
  matcha: "coffee",
  chaseatm: "wallet",
  cashfund: "bank",
};

/** Name variants → one slug (after lowercasing and dropping everything but letters and digits). */
const ALIAS: Record<string, string> = {
  americanexpress: "amex", amexgold: "amex",
  newyorktimes: "nyt", thenewyorktimes: "nyt",
  icloudplus: "icloud", applecom: "apple", appleone: "apple",
  claudepro: "claude", anthropic: "claude",
  chasechecking: "chase", chasesapphire: "chase",
  xfinity: "comcast", comcastxfinity: "comcast",
  philzcoffee: "philz", bluebottlecoffee: "bluebottle",
  traderjoes: "traderjoes", wholefoodsmarket: "wholefoods",
  amcmetreon: "amc", amctheatres: "amc",
  pge: "pge", pgande: "pge", pacificgaselectric: "pge",
  sfohudsonnews: "hudson", hudsonnews: "hudson",
  zunicafe: "zuni", thefillmore: "fillmore", katzsdelicatessen: "katz",
  alaskaairlines: "alaska", sfmuni: "clipper", muni: "clipper",
  dimeinvest: "dime",
  properfood: "propertyfood", russdaughters: "russanddaughters", equinoxfitness: "equinox",
  // funds → their issuers (the picker and fund rows)
  voo: "vanguard", sandp500: "vanguard", qqq: "invesco", nasdaq100: "invesco",
  soxx: "ishares", semiconductors: "ishares", dram: "roundhill", memory: "roundhill",
  cash: "cashfund", highyieldsavings: "cashfund",
  iphone: "apple", iphone17pro: "apple", macbook: "apple", airpods: "apple", applewatch: "apple",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const flat = (s: string) =>
  s.normalize("NFKD").toLowerCase().replace(/\+/g, "plus").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const known = (s: string) => s in SI || s in IMG || s in GENERIC;

/** The slug a merchant name resolves to: whole name, an alias, then its first word ("Venmo · Maya",
 *  "Safeway Truckee", "Chase ATM" falls back to Chase only when it has no entry of its own). */
export function slug(merchant: string): string {
  const whole = flat(merchant);
  if (known(whole)) return whole;
  const alias = ALIAS[whole] ?? ALIAS[whole.replace(/plus$/, "")];
  if (alias) return alias;
  const first = flat(merchant.split(/[\s·]+/)[0] ?? "");
  return ALIAS[first] ?? first;
}

/** Whether a name resolves to a real mark (or a known generic), not a monogram. */
export const hasBrand = (merchant: string) => known(slug(merchant)) || slug(merchant) === "dime";

/** Relative luminance of a #rrggbb colour (WCAG). */
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** A merchant's tile as markup. Decorative: the name always sits beside it, so it is aria-hidden. */
export function brand(merchant: string): string {
  const s = slug(merchant);
  const si = SI[s];
  if (si) {
    const [ic, bgIn, fgIn, size = 56] = si;
    const bg = bgIn ?? `#${ic.hex}`;
    const fg = fgIn ?? (lum(bg) > 0.4 ? "#111111" : "#ffffff");
    // White tiles pick up the hairline harder in light mode, black ones in dark: both get one.
    return `<span class="brand" style="--b:${bg};--g:${fg};--gs:${size}%" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ic.path}"/></svg></span>`;
  }
  if (s in IMG)
    return `<span class="brand img${IMG[s] ? "" : " mark"}${ROUNDED.has(s) ? " round" : ""}" aria-hidden="true"><img src="/brands/${s}.${s === "roundhill" ? "svg" : "png"}" alt="" decoding="async"></span>`;
  if (s === "dime") return `<span class="brand plain" aria-hidden="true">${icon("cue")}</span>`;
  if (GENERIC[s]) return `<span class="brand plain" aria-hidden="true">${icon(GENERIC[s])}</span>`;
  const letter = merchant.trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "·";
  return `<span class="brand plain mono" aria-hidden="true">${esc(letter)}</span>`;
}

/** Spending categories → Charade glyphs (the dashboard's category rows). */
const CAT: Record<string, string> = {
  coffee: "coffee", food: "utensils", dining: "utensils", groceries: "cart", transport: "car", shopping: "bag",
  fun: "ticket", bills: "receipt", travel: "plane", personal: "scissors", cash: "wallet", gifts: "gift",
  health: "first-aid", income: "coin", transfer: "repeat", subscriptions: "repeat",
};
export const categoryIcon = (category: string) => icon(CAT[category.toLowerCase()] ?? "tag");
