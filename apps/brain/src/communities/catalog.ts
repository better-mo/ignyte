// The community catalog: how communities show up in someone's inbox.
//
// Two layers:
//  - PLATFORMS: generic rules for community software (Mobilize, Luma, Slack, Discourse, ...).
//    They find communities nobody has catalogued yet, keyed by the sending address.
//  - KNOWN: specific public communities with canonical names, aliases and sub-groups.
//    Platform matches that hit a known entry are renamed and grouped under it.
//
// This is shared, public knowledge (no one's membership lives here), so it can grow
// into a hosted catalog later without changing the detector.

export type CommunityType =
  | "investor_portfolio"
  | "alumni"
  | "professional"
  | "local"
  | "founders"
  | "identity"
  | "product"
  | "other";

export type KnownCommunity = {
  key: string;
  name: string;
  type: CommunityType;
  url?: string;
  /** Lowercase substrings of names that mean this community ("golden ventures"). */
  aliases?: string[];
  /** Sender/recipient address matchers: exact address, "@domain", or "prefix*@domain". */
  addresses?: string[];
  /** Mobilize group address prefix ("bvp" → bvpcfo@groups.mobilize.io) and group labels. */
  mobilizePrefix?: string;
  groups?: Record<string, string>;
  /** Luma calendar slugs (slug@calendar.luma-mail.com). */
  lumaCalendars?: string[];
};

export const KNOWN: KnownCommunity[] = [
  {
    key: "bvp-cxo",
    name: "Bessemer Venture Partners CXO Community",
    type: "investor_portfolio",
    aliases: ["bessemer venture partners cxo", "bvp cxo", "bessemer cxo"],
    mobilizePrefix: "bvp",
    groups: {
      cfo: "CFO",
      gtm: "GTM",
      people: "HR / People",
      hr: "HR / People",
      cmo: "CMO",
      ctos: "CTO",
      cto: "CTO",
      cs: "Customer Success",
      customersuccess: "Customer Success",
      product: "Product",
      funded: "Funded",
    },
  },
  {
    key: "toronto-tech-week",
    name: "Toronto Tech Week",
    type: "local",
    url: "https://torontotechweek.com",
    aliases: ["toronto tech week", "#torontotechweek"],
    lumaCalendars: ["torontotechweek"],
  },
  {
    key: "led-by-community",
    name: "Led by Community",
    type: "professional",
    aliases: ["led by community", "ledbycommunity"],
    addresses: ["@ledbycommunity.com", "frankopazo@user.luma-mail.com"],
    lumaCalendars: ["ledbycommunity-meetups", "ledbycommunity"],
  },
  {
    key: "cmx",
    name: "CMX",
    type: "professional",
    url: "https://cmxhub.com",
    aliases: ["cmx connect", "cmx summit", "cmx community"],
    addresses: ["@cmxhub.com", "@cmx.bevy.com"],
  },
  {
    key: "betakit",
    name: "BetaKit",
    type: "local",
    aliases: ["betakit"],
    lumaCalendars: ["betakit"],
  },
  {
    key: "golden-ventures",
    name: "Golden Ventures",
    type: "investor_portfolio",
    aliases: ["golden ventures"],
  },
  {
    key: "inovia",
    name: "Inovia Capital",
    type: "investor_portfolio",
    aliases: ["inovia"],
    addresses: ["@inovia.vc"],
  },
  {
    key: "next-canada",
    name: "NEXT Canada",
    type: "alumni",
    aliases: ["next canada", "next 36", "next36", "next founders"],
    addresses: ["@nextcanada.com", "@thenext36.ca"],
  },
  {
    key: "webflow-community",
    name: "Webflow Community",
    type: "product",
    aliases: ["webflow community"],
    addresses: ["community@webflow.com"],
  },
  {
    key: "slack-community",
    name: "Slack Community",
    type: "professional",
    aliases: ["slack community"],
  },
];

/** A platform rule: which senders it covers and how it names the community. */
export type Platform = {
  id: string;
  label: string;
  /** Gmail search terms (used to build the detection query). */
  query: string[];
};

export const PLATFORMS: Platform[] = [
  { id: "mobilize", label: "Mobilize", query: ["from:mobilize.io", "to:groups.mobilize.io", "cc:groups.mobilize.io"] },
  { id: "luma", label: "Luma", query: ["from:luma-mail.com"] },
  { id: "slack", label: "Slack", query: ["from:slack.com"] },
  { id: "discourse", label: "Discourse", query: ["from:discoursemail.com"] },
  { id: "circle", label: "Circle", query: ["from:circle.so"] },
  { id: "meetup", label: "Meetup", query: ["from:meetup.com"] },
  { id: "bevy", label: "Bevy", query: ["from:bevy.com"] },
  { id: "mighty", label: "Mighty Networks", query: ["from:mightynetworks.com"] },
  { id: "skool", label: "Skool", query: ["from:skool.com"] },
  { id: "hivebrite", label: "Hivebrite", query: ["from:hivebrite.com"] },
  { id: "bettermode", label: "Bettermode", query: ["from:bettermode.io"] },
  { id: "googlegroups", label: "Google Groups", query: ["list:googlegroups.com"] },
];

/** Gmail query covering every platform and every known community's addresses. */
export function detectionQuery(): string {
  const terms = new Set<string>(PLATFORMS.flatMap((p) => p.query));
  for (const k of KNOWN)
    for (const a of k.addresses ?? [])
      terms.add(`from:${a.startsWith("@") ? a.slice(1) : a.replace(/^\*/, "")}`);
  return `{${[...terms].join(" ")}}`;
}

const matchAddress = (pattern: string, email: string) => {
  if (pattern.startsWith("@")) return email.endsWith(pattern) || email.endsWith(`.${pattern.slice(1)}`);
  if (pattern.includes("*")) {
    const [pre, dom] = pattern.split("*");
    return email.startsWith(pre) && email.endsWith(dom);
  }
  return email === pattern;
};

export function knownByAddress(email: string): KnownCommunity | undefined {
  return KNOWN.find((k) => k.addresses?.some((p) => matchAddress(p, email)));
}
export function knownByLuma(slug: string): KnownCommunity | undefined {
  return KNOWN.find((k) => k.lumaCalendars?.includes(slug));
}
export function knownByMobilize(groupSlug: string):
  | { community: KnownCommunity; group: string }
  | undefined {
  for (const k of KNOWN) {
    if (!k.mobilizePrefix || !groupSlug.startsWith(k.mobilizePrefix)) continue;
    const rest = groupSlug.slice(k.mobilizePrefix.length);
    return { community: k, group: k.groups?.[rest] ?? rest.toUpperCase() };
  }
  return undefined;
}
export function knownByName(name: string): KnownCommunity | undefined {
  const n = name.toLowerCase();
  return KNOWN.find(
    (k) => k.name.toLowerCase() === n || k.aliases?.some((a) => n.includes(a)),
  );
}
