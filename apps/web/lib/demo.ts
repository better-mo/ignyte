export type Source = "google" | "linkedin" | "x" | "phone" | "community";
export type Identity = {
  userId: string;
  source: Source;
  externalId: string;
  provenance: string;
};
export type CommunityMembership = {
  userId: string;
  personId: string;
  provider: "slack" | "discord" | "bettermode";
  externalId: string;
  communityName: string;
};
export type Person = {
  id: string;
  userId: string;
  name: string;
  role: string;
  company: string;
  city: string;
  photo: number;
  strength: number;
  trend: "warming" | "steady" | "cooling";
  tier: "Inner circle" | "Close" | "Active" | "Rediscover";
  last: string;
  context: string;
  identities: Identity[];
  tags: string[];
};
export type GraphLink = {
  userId: string;
  from: string;
  to: string;
  strength: number;
  evidence: "shared_meeting" | "same_company" | "community";
  source: string;
  confidence: "Confirmed" | "Likely";
};
const core = [
  [
    "priya",
    "Priya Sharma",
    "Head of Product",
    "Linear",
    "San Francisco",
    47,
    94,
    "warming",
    "2 days ago",
    "You met at a design dinner in 2022. She is building a new product team.",
  ],
  [
    "sara",
    "Sara Chen",
    "Product Lead",
    "Figma",
    "Toronto",
    44,
    91,
    "steady",
    "4 days ago",
    "Your monthly coffee partner. Worked with Daniel at Shopify for three years.",
  ],
  [
    "daniel",
    "Daniel Kim",
    "Design Director",
    "Shopify",
    "Toronto",
    12,
    78,
    "warming",
    "1 week ago",
    "Met through Sara at Config. Visiting Toronto this week.",
  ],
  [
    "maya",
    "Maya Williams",
    "Founder",
    "Forma",
    "New York",
    49,
    87,
    "cooling",
    "6 weeks ago",
    "You promised to send her the pitch deck after your last catch-up.",
  ],
  [
    "alex",
    "Alex Morgan",
    "Partner",
    "Northstar Ventures",
    "San Francisco",
    13,
    85,
    "steady",
    "5 days ago",
    "An early believer in your work. Invests in thoughtful consumer products.",
  ],
  [
    "james",
    "James Wilson",
    "Staff Engineer",
    "Anthropic",
    "San Francisco",
    33,
    82,
    "warming",
    "3 days ago",
    "You built a weekend project together. Cares deeply about useful AI.",
  ],
  [
    "ella",
    "Ella Thompson",
    "Creative Director",
    "Notion",
    "London",
    45,
    79,
    "steady",
    "2 weeks ago",
    "You share a love of simple tools and beautifully made things.",
  ],
  [
    "leo",
    "Leo Martinez",
    "Founder",
    "Gather",
    "Toronto",
    14,
    76,
    "cooling",
    "2 months ago",
    "A former teammate and regular running partner. Building a community tool.",
  ],
  [
    "amina",
    "Amina Yusuf",
    "Senior Product Designer",
    "Shopify",
    "Toronto",
    48,
    74,
    "warming",
    "1 week ago",
    "Met at Toronto Design Collective. Open to mentoring early designers.",
  ],
  [
    "oliver",
    "Oliver Park",
    "Product Manager",
    "Stripe",
    "New York",
    11,
    72,
    "steady",
    "3 weeks ago",
    "Worked together on the community launch in 2023.",
  ],
  [
    "nina",
    "Nina Patel",
    "Engineering Manager",
    "Linear",
    "San Francisco",
    46,
    70,
    "steady",
    "1 month ago",
    "Priya introduced you at a small founders dinner.",
  ],
  [
    "ben",
    "Ben Carter",
    "Talent Partner",
    "Notion",
    "London",
    15,
    68,
    "cooling",
    "2 months ago",
    "Helped you with your first design hire. Loves a specific brief.",
  ],
] as const;
const first = [
  "Sofia",
  "Ethan",
  "Isabel",
  "Noah",
  "Chloe",
  "Liam",
  "Zoe",
  "Lucas",
  "Aria",
  "Theo",
  "Grace",
  "Owen",
  "Lily",
  "Oscar",
  "Eva",
  "Henry",
  "Lucy",
  "Felix",
  "Alice",
];
const last = [
  "Rivera",
  "Brooks",
  "Reed",
  "Lin",
  "Foster",
  "Singh",
  "Clarke",
  "Hayes",
  "Bennett",
  "Wu",
  "Cole",
  "Ross",
  "Tran",
  "Gray",
  "Scott",
  "Bell",
  "Reyes",
  "Jones",
  "Davis",
];
export const people: Person[] = core.map((p) => ({
  id: p[0],
  userId: "demo",
  name: p[1],
  role: p[2],
  company: p[3],
  city: p[4],
  photo: p[5],
  strength: p[6],
  trend: p[7],
  tier: p[6] > 89 ? "Inner circle" : p[6] > 79 ? "Close" : "Active",
  last: p[8],
  context: p[9],
  identities: [
    {
      userId: "demo",
      source: "google",
      externalId: `demo-${p[0]}`,
      provenance: "Calendar attendance and email headers",
    },
    {
      userId: "demo",
      source: "linkedin",
      externalId: `li-${p[0]}`,
      provenance: "Your imported connections",
    },
  ],
  tags: ["Product", p[4] === "Toronto" ? "Local" : "Design"],
}));
for (let i = 0; i < 38; i++) {
  people.push({
    id: `person-${i}`,
    userId: "demo",
    name: `${first[i % 19]} ${last[(i + Math.floor(i / 19) * 5) % 19]}`,
    role: [
      "Product Designer",
      "Founder",
      "Software Engineer",
      "Product Manager",
      "Community Lead",
    ][i % 5],
    company: [
      "Figma",
      "Shopify",
      "Stripe",
      "Notion",
      "Linear",
      "Anthropic",
      "Airbnb",
    ][i % 7],
    city: ["Toronto", "San Francisco", "New York", "London"][i % 4],
    photo: [
      5, 9, 16, 20, 23, 25, 28, 32, 36, 38, 41, 43, 51, 52, 53, 54, 56, 59,
    ][i % 18],
    strength: 66 - i,
    trend: i % 3 === 0 ? "cooling" : i % 3 === 1 ? "warming" : "steady",
    tier: i < 17 ? "Active" : "Rediscover",
    last: i < 17 ? "1 month ago" : "3 months ago",
    context:
      "Connected through a shared project and stayed in touch through occasional conversations.",
    identities: [
      {
        userId: "demo",
        source: "google",
        externalId: `g-${i}`,
        provenance: "Contact record",
      },
    ],
    tags: [i % 2 ? "Design" : "Product"],
  });
}
export const links: GraphLink[] = [
  {
    userId: "demo",
    from: "sara",
    to: "daniel",
    strength: 88,
    evidence: "same_company",
    source: "Shared Shopify employment, 2019–2022; confirmed in your note",
    confidence: "Confirmed",
  },
  {
    userId: "demo",
    from: "priya",
    to: "nina",
    strength: 82,
    evidence: "shared_meeting",
    source: "Three shared calendar meetings",
    confidence: "Confirmed",
  },
  {
    userId: "demo",
    from: "amina",
    to: "daniel",
    strength: 65,
    evidence: "community",
    source: "Toronto Design Collective membership",
    confidence: "Likely",
  },
];
export const communities: CommunityMembership[] = [
  {
    userId: "demo",
    personId: "amina",
    provider: "slack",
    externalId: "tdc-01",
    communityName: "Toronto Design Collective",
  },
  {
    userId: "demo",
    personId: "daniel",
    provider: "slack",
    externalId: "tdc-02",
    communityName: "Toronto Design Collective",
  },
];
export const person = (id: string) =>
  people.find((p) => p.id === id) || people[0];
export const stages = [
  {
    name: "First day",
    count: "50",
    caption: "Your closest people, brought together.",
    sources: "Google connected",
  },
  {
    name: "Growing",
    count: "248",
    caption: "More context. More possibilities.",
    sources: "Google + LinkedIn + contacts",
  },
  {
    name: "Connected",
    count: "1,240",
    caption: "Your whole world, working together.",
    sources: "6 sources, one private graph",
  },
];
export const sourceInfo = [
  {
    id: "google",
    name: "Google",
    letter: "G",
    color: "#5d7862",
    description: "The people you actually spend time with.",
    detail:
      "Contacts, calendar attendees, and email headers. Never email bodies.",
    benefit: "Find your closest relationships in about a minute.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    letter: "in",
    color: "#487897",
    description: "Put a name to the next opportunity.",
    detail: "Your profile URL and an exported Connections.csv. No scraping.",
    benefit: "Discover where your people work today.",
  },
  {
    id: "phone",
    name: "Phone contacts",
    letter: "⌘",
    color: "#89705c",
    description: "Your oldest friends. Your newest connections.",
    detail: "Selected contacts or a vCard import. No calls or text messages.",
    benefit: "Bring the people in your pocket into the picture.",
  },
  {
    id: "x",
    name: "X",
    letter: "𝕏",
    color: "#333b37",
    description: "Turn familiar names into real connections.",
    detail:
      "An archive import preview. Live API access is not part of this demo.",
    benefit: "Discover mutual follows and shared interests.",
  },
  {
    id: "community",
    name: "Cohesive",
    letter: "c",
    color: "#8c779e",
    description: "The people you already have something in common with.",
    detail: "Future Slack, Discord, and Bettermode community context.",
    benefit: "Find trusted people through your communities.",
  },
];
