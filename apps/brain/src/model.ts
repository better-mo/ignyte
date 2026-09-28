export type SourceName =
  | "google_contacts"
  | "google_other_contacts"
  | "gmail"
  | "calendar"
  | "linkedin"
  | "x"
  | "phone"
  | "community"
  | "manual"
  | "me";

export type Position = {
  company: string;
  title?: string;
  start?: string; // YYYY or YYYY-MM or YYYY-MM-DD
  end?: string;
  current?: boolean;
  domain?: string;
};

export type School = {
  school: string;
  degree?: string;
  start?: string;
  end?: string;
};

/** What one source says about one person. Everything optional. */
export type ObservedPerson = {
  name?: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  phones?: string[];
  linkedinUrl?: string;
  xHandle?: string;
  xId?: string;
  company?: string;
  title?: string;
  headline?: string;
  city?: string;
  region?: string;
  country?: string;
  location?: string;
  photoUrl?: string;
  urls?: string[];
  birthday?: string;
  note?: string;
  bio?: string;
  connectedOn?: string;
  groups?: string[];
  positions?: Position[];
  schools?: School[];
};

export type InteractionKind =
  | "email"
  | "meeting"
  | "dm"
  | "linkedin_message"
  | "community_post"
  | "event"
  | "connected"
  | "follow";

export type ParticipantRole =
  | "from"
  | "to"
  | "cc"
  | "attendee"
  | "organizer"
  | "sender"
  | "recipient"
  | "member";

export type Participant = {
  handleKind: "email" | "x_id" | "linkedin" | "name";
  handle: string;
  name?: string;
  role: ParticipantRole;
};

export type Interaction = {
  id: string;
  source: SourceName;
  accountId?: string;
  kind: InteractionKind;
  occurredAt: string; // ISO
  direction?: "out" | "in" | "mutual" | "none";
  subject?: string;
  snippet?: string;
  threadId?: string;
  url?: string;
  isBulk?: boolean;
  communityId?: string;
  meta?: Record<string, unknown>;
  participants: Participant[];
};

export type PersonRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  title: string | null;
  company: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  x_handle: string | null;
  summary: string | null;
  is_me: number;
  hidden: number;
  strength: number;
  tier: string | null;
  trend: string | null;
  strength_detail: string | null;
  first_interaction_at: string | null;
  last_interaction_at: string | null;
  interaction_count: number;
  doc: string | null;
  doc_hash: string | null;
};
