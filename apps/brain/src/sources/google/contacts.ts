import { tx } from "../../db/index.ts";
import { upsertObservation } from "../../identity/store.ts";
import type { ObservedPerson } from "../../model.ts";
import { gget, type GoogleAccount } from "./auth.ts";

const API = "https://people.googleapis.com/v1";

export type GooglePerson = {
  resourceName: string;
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string; canonicalForm?: string }[];
  organizations?: {
    name?: string;
    title?: string;
    current?: boolean;
    domain?: string;
  }[];
  addresses?: {
    city?: string;
    region?: string;
    country?: string;
    formattedValue?: string;
  }[];
  urls?: { value: string; type?: string }[];
  biographies?: { value: string }[];
  birthdays?: { date?: { year?: number; month?: number; day?: number } }[];
  photos?: { url: string; default?: boolean }[];
  memberships?: {
    contactGroupMembership?: { contactGroupResourceName: string };
  }[];
};

export function mapGooglePerson(
  p: GooglePerson,
  groupNames: Map<string, string> = new Map(),
): ObservedPerson {
  const name = p.names?.[0];
  const org =
    p.organizations?.find((o) => o.current !== false) ?? p.organizations?.[0];
  const addr = p.addresses?.[0];
  const urls = (p.urls ?? []).map((u) => u.value);
  const bday = p.birthdays?.[0]?.date;
  return {
    name: name?.displayName,
    firstName: name?.givenName,
    lastName: name?.familyName,
    emails: (p.emailAddresses ?? []).map((e) => e.value),
    phones: (p.phoneNumbers ?? []).map((ph) => ph.canonicalForm ?? ph.value),
    company: org?.name,
    title: org?.title,
    positions: (p.organizations ?? [])
      .filter((o) => o.name)
      .map((o) => ({
        company: o.name!,
        title: o.title,
        current: o.current !== false,
        domain: o.domain,
      })),
    city: addr?.city,
    region: addr?.region,
    country: addr?.country,
    location: addr?.formattedValue,
    linkedinUrl: urls.find((u) => /linkedin\.com\/in\//i.test(u)),
    xHandle: urls.find((u) => /(twitter|x)\.com\//i.test(u)),
    urls,
    note: p.biographies?.[0]?.value?.slice(0, 1000),
    birthday: bday?.month
      ? [bday.year ?? "", bday.month, bday.day].filter(Boolean).join("-")
      : undefined,
    photoUrl: p.photos?.find((ph) => !ph.default)?.url,
    groups: (p.memberships ?? [])
      .map((m) =>
        groupNames.get(
          m.contactGroupMembership?.contactGroupResourceName ?? "",
        ),
      )
      .filter((g): g is string => !!g),
  };
}

export async function syncContacts(account: GoogleAccount, log = console.log) {
  const groups = await gget<{
    contactGroups?: { resourceName: string; name: string; groupType: string }[];
  }>(account, `${API}/contactGroups`, { pageSize: "1000" });
  const groupNames = new Map(
    (groups.contactGroups ?? [])
      .filter((g) => g.groupType === "USER_CONTACT_GROUP")
      .map((g) => [g.resourceName, g.name]),
  );

  let count = 0;
  let pageToken: string | undefined;
  do {
    const page = await gget<{
      connections?: GooglePerson[];
      nextPageToken?: string;
    }>(account, `${API}/people/me/connections`, {
      personFields:
        "names,emailAddresses,phoneNumbers,organizations,addresses,urls,biographies,birthdays,photos,memberships",
      pageSize: "1000",
      pageToken,
    });
    tx(() => {
      for (const p of page.connections ?? []) {
        const data = mapGooglePerson(p, groupNames);
        if (!data.name && !data.emails?.length && !data.phones?.length)
          continue;
        upsertObservation("google_contacts", account.id, p.resourceName, data);
        count++;
      }
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  // "Other contacts" are auto-saved from Gmail. Too noisy to create people from;
  // they only attach extra names/phones to people we already know.
  let other = 0;
  pageToken = undefined;
  do {
    const page: { otherContacts?: GooglePerson[]; nextPageToken?: string } =
      await gget<{
        otherContacts?: GooglePerson[];
        nextPageToken?: string;
      }>(account, `${API}/otherContacts`, {
        readMask: "names,emailAddresses,phoneNumbers",
        pageSize: "1000",
        pageToken,
      }).catch(() => ({ otherContacts: [], nextPageToken: undefined }));
    tx(() => {
      for (const p of page.otherContacts ?? []) {
        if (
          upsertObservation(
            "google_other_contacts",
            account.id,
            p.resourceName,
            mapGooglePerson(p),
            { create: false },
          )
        )
          other++;
      }
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  log(
    `  contacts ${account.email}: ${count} contacts, ${other} other-contacts matched`,
  );
}
