"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Coffee,
  CornerDownRight,
  FileText,
  Heart,
  Link2,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Avatar, Dialog, Spark } from "../ui";
import { person, type Person } from "../../lib/demo";
import "./landing.css";

const jordan: Person = {
  ...person("oliver"),
  id: "jordan",
  name: "Jordan Lee",
  role: "Head of CX",
  company: "Gather",
  photo: 53,
};
const leila: Person = {
  ...person("amina"),
  id: "leila",
  name: "Leila Hassan",
  role: "Support Director",
  company: "Forma",
  photo: 48,
};
const stories = [
  {
    label: "The next chapter",
    title: "“I really want\nthis job.”",
    description:
      "A dream role. A familiar face. A way to start the conversation before you send your résumé.",
    agent: "ChatGPT",
    prompt:
      "This Shopify role looks perfect. Help me figure out how to approach it.",
    lead: (
      <>
        Before you apply, <strong>talk to Sara.</strong>
      </>
    ),
    answer:
      "You two catch up regularly. She worked with Daniel, who leads design at Shopify, for three years. She could give you the inside story—or help reconnect you.",
    person: person("sara"),
    personLabel: "Sara Chen",
    personContext: "Your monthly coffee partner",
    community: "Product Manager Community",
    evidence:
      "Your calendar shows regular one-to-one meetings with Sara. Imported career history and your confirmed note connect Sara to Daniel at Shopify. Your sample community membership adds shared context.",
    action: "See the introduction",
    href: "/app/?q=Shopify",
    side: "A little closer than you thought.",
    type: "role",
  },
  {
    label: "Your first five customers",
    title: "“Is anyone actually\ngoing to want this?”",
    description:
      "Before the launch. Before the landing page. Find a few people who will tell you the truth.",
    agent: "Claude",
    prompt:
      "I’m building a tool for support teams. Who could give me honest feedback?",
    lead: (
      <>
        You don’t have to start <strong>with strangers.</strong>
      </>
    ),
    answer:
      "Jordan leads CX at Gather—you worked together in 2023. Leila runs support at Forma and is part of your CX Leaders community. Start with Jordan, then ask Leila if she’s open to a short conversation.",
    person: jordan,
    personLabel: "Jordan Lee",
    personContext: "Former teammate · Head of CX at Gather",
    community: "CX Leaders · Leila Hassan",
    evidence:
      "A confirmed note records your work with Jordan in 2023. Leila’s role comes from a sample professional profile, and her membership from a connected community. Shared membership does not establish a personal relationship.",
    action: "Explore your people brain",
    href: "/app/?view=ai",
    side: "Your first customers might already know you.",
    type: "customers",
  },
  {
    label: "A trip, with familiar faces",
    title: "“Three days in New York.\nWho should I see?”",
    description:
      "A work trip can be more than a hotel and a meeting room. There are people worth making time for.",
    agent: "ChatGPT",
    prompt: "I’m in New York next week. Who should I make time for?",
    lead: (
      <>
        Make room for <strong>Maya and Oliver.</strong>
      </>
    ),
    answer:
      "Maya lives there now. You haven’t caught up since her launch, and you still owe her your deck. Oliver is there too—you both belong to Design Collective. That’s an easy thread to pick up.",
    person: person("maya"),
    personLabel: "Maya Williams",
    personContext: "Founder, Forma · New York",
    community: "Design Collective · You + Oliver",
    evidence:
      "Sample profiles place Maya and Oliver in New York. Your own note contains the promise to send Maya your deck. Design Collective membership is sample community context—not a claim that Oliver is available.",
    action: "Find a familiar face",
    href: "/app/?view=people",
    side: "Less time killing time. More catching up.",
    type: "trip",
  },
];
const opportunities = [
  {
    title: "That dream role? You have a way in.",
    body: "Sara knows Daniel, Design Director at Shopify.",
    tag: "A WARM INTRODUCTION",
    ids: ["sara", "daniel"],
    caption: "Your people → your next chapter",
  },
  {
    title: "Your first customer might be a friend.",
    body: "Jordan leads a support team. You used to work together.",
    tag: "AN HONEST FIRST CONVERSATION",
    ids: ["jordan", "leila"],
    caption: "Your work → your next idea",
  },
  {
    title: "Someone’s already figured it out.",
    body: "Leo can introduce you to a founder who’s been there.",
    tag: "A LITTLE EXPERIENCE GOES A LONG WAY",
    ids: ["leo", "alex"],
    caption: "Your community → a way forward",
  },
];
function Community({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <span className={`l-community ${dark ? "on-dark" : ""}`}>
      <span className="l-community-icon">
        <Users size={12} />
      </span>
      {children}
    </span>
  );
}
function ArrowLink({
  children,
  href,
  className = "",
}: {
  children: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <a className={`l-arrow-link ${className}`} href={href}>
      {children}
      <ArrowUpRight size={17} />
    </a>
  );
}
function Cta({
  children,
  onClick,
  light = false,
}: {
  children: ReactNode;
  onClick: () => void;
  light?: boolean;
}) {
  return (
    <button className={`l-cta ${light ? "l-cta-light" : ""}`} onClick={onClick}>
      {children}
      <span>
        <ArrowUpRight size={18} />
      </span>
    </button>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="l-eyebrow">
      <span />
      {children}
    </div>
  );
}
function HeroGraph({
  selected,
  onSelect,
  firstDay = false,
}: {
  firstDay?: boolean;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const opportunity = opportunities[selected];
  const first = selected === 1 ? jordan : person("sara");
  const second =
    selected === 1 ? leila : person(selected === 2 ? "alex" : "daniel");
  return (
    <div
      className="l-hero-art"
      aria-label="An illustration of your people and communities"
    >
      <div className="l-orbit l-orbit-one" />
      <div className="l-orbit l-orbit-two" />
      <div className="l-orbit l-orbit-three" />
      <svg
        className="l-hero-lines"
        viewBox="0 0 580 530"
        fill="none"
        aria-hidden="true"
      >
        <path d="M284 262 C240 120 182 95 142 130M284 262 C337 207 396 232 454 244M284 262 C350 295 367 345 395 404M284 262 C249 344 157 330 108 340M284 262 C235 221 174 246 115 226M284 262 C325 97 361 86 380 77" />
        <path
          className="l-path-lit"
          d={
            selected === 0
              ? "M284 262 C240 120 182 95 142 130 C268 32 344 103 454 244"
              : selected === 1
                ? "M284 262 C249 344 157 330 108 340 C158 280 261 225 380 77"
                : "M284 262 C350 295 367 345 395 404 C490 301 506 305 454 244"
          }
        />
      </svg>
      <div className="l-hero-community l-hc-top">
        <span>✷</span>
        {firstDay
          ? "Your calendar"
          : selected === 1
            ? "CX Leaders"
            : "Product Manager Community"}
        <span className="l-tiny-dot" />
      </div>
      <div className="l-hero-community l-hc-bottom">
        <span>↗</span>
        {firstDay ? "Your contacts" : "Toronto Builders"}
        <span className="l-tiny-dot" />
      </div>
      <div className="l-you">
        <Spark />
        <strong>you</strong>
      </div>
      <div className={`l-map-face l-map-sara ${selected === 0 ? "lit" : ""}`}>
        <Avatar p={first} size={64} />
        <span>{first.name.split(" ")[0]}</span>
        <small>
          {selected === 1 ? "your former teammate" : "your coffee person"}
        </small>
      </div>
      <div className="l-map-face l-map-daniel">
        <Avatar p={second} size={56} />
        <span>{second.name.split(" ")[0]}</span>
        <small>
          {selected === 1
            ? "support at Forma"
            : selected === 2
              ? "been there before"
              : "design at Shopify"}
        </small>
      </div>
      <div className="l-map-face l-map-priya">
        <Avatar p={person("priya")} size={43} />
        <span>Priya</span>
      </div>
      <div className="l-map-face l-map-maya">
        <Avatar p={person("maya")} size={45} />
        <span>Maya</span>
      </div>
      <div className="l-map-face l-map-leo">
        <Avatar p={person("leo")} size={49} />
        <span>Leo</span>
      </div>
      <div className="l-map-face l-map-ella">
        <Avatar p={person("ella")} size={37} />
      </div>
      <div className="l-floating-tag">
        <Coffee size={13} />
        <span>met for coffee, stayed in touch</span>
      </div>
      <span className="l-tiny-star l-star-one">✧</span>
      <span className="l-tiny-star l-star-two">✳</span>
      <span className="l-map-dot l-md-one" />
      <span className="l-map-dot l-md-two" />
      <div className="l-opportunity" key={selected}>
        <div className="l-opportunity-top">
          <span className="l-orange-spark">✳</span>
          <span>{opportunity.tag}</span>
          <span className="l-found">FOUND IN YOUR WORLD</span>
        </div>
        <h3>{opportunity.title}</h3>
        <p>{opportunity.body}</p>
        <div className="l-opportunity-bottom">
          <div className="l-mini-path">
            <span className="l-mini-you">you</span>
            <span>···</span>
            {opportunity.ids.map((id, i) => (
              <span key={id} className="l-mini-path-person">
                <Avatar
                  p={
                    id === "jordan"
                      ? jordan
                      : id === "leila"
                        ? leila
                        : person(id)
                  }
                  size={26}
                />
                {i === 0 && <span>···</span>}
              </span>
            ))}
          </div>
          <span>{opportunity.caption}</span>
        </div>
      </div>
      {!firstDay && (
        <div
          className="l-graph-pagination"
          role="group"
          aria-label="Explore hidden opportunities"
        >
          {opportunities.map((o, i) => (
            <button
              key={o.title}
              aria-label={o.title}
              aria-pressed={i === selected}
              onClick={() => onSelect(i)}
              className={i === selected ? "selected" : ""}
            >
              <span />
            </button>
          ))}
          <span>A FEW DOTS. A WHOLE WORLD.</span>
        </div>
      )}
    </div>
  );
}
function MiniPath({
  ids = ["sara", "daniel"],
  dark = false,
}: {
  ids?: string[];
  dark?: boolean;
}) {
  return (
    <div className={`l-story-path ${dark ? "dark" : ""}`}>
      <div>
        <span className="l-path-self">you</span>
        <strong>You</strong>
      </div>
      <span className="l-story-path-line">
        <small>
          {ids[0] === "leo" ? "Former teammates" : "Monthly catch-ups"}
        </small>
        <i />
        <span>strong connection</span>
      </span>
      {ids.map((id, i) => (
        <div className="l-path-part" key={id}>
          <div>
            <Avatar p={person(id)} size={43} />
            <strong>{person(id).name.split(" ")[0]}</strong>
          </div>
          {i === 0 && (
            <span className="l-story-path-line">
              <small>
                {id === "leo" ? "Shared project" : "Former teammates"}
              </small>
              <i />
              <span>
                {id === "leo" ? "community context" : "3 years at Shopify"}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
export default function Landing() {
  const [selected, setSelected] = useState(0);
  const [story, setStory] = useState(0);
  const [evidence, setEvidence] = useState(false);
  const [capture, setCapture] = useState(false);
  const [brief, setBrief] = useState(false);
  const [community, setCommunity] = useState(0);
  const [demo, setDemo] = useState<0 | 1 | 2>(0);
  const [privacy, setPrivacy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [agent, setAgent] = useState("ChatGPT");
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  const current = stories[story];
  const start = () => {
    setDemo(1);
    setMenu(false);
  };
  const communityNames = [
    "Founders Circle",
    "Product Manager Community",
    "Design Collective",
  ];
  return (
    <div className="landing">
      <header className="l-header">
        <div className="l-nav-wrap">
          <a href="#" className="l-brand" aria-label="Ignyte home">
            <Spark />
            ignyte<span>.</span>
          </a>
          <nav
            aria-label="Website navigation"
            className={menu ? "is-open" : ""}
          >
            <a href="#possibilities" onClick={() => setMenu(false)}>
              The possibilities
            </a>
            <a href="#your-ai" onClick={() => setMenu(false)}>
              For your AI
            </a>
            <a href="#your-world" onClick={() => setMenu(false)}>
              Your whole world
            </a>
          </nav>
          <div className="l-nav-actions">
            <a className="l-open-app" href="/app/">
              Open the demo
              <ArrowUpRight size={14} />
            </a>
            <button className="l-nav-cta" onClick={start}>
              Find your people
              <ArrowRight size={14} />
            </button>
            <button
              className="l-menu"
              aria-label={menu ? "Close website menu" : "Open website menu"}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="l-hero l-container" id="possibilities">
          <div className="l-hero-copy">
            <Eyebrow>GOOD THINGS HAPPEN BETWEEN PEOPLE</Eyebrow>
            <h1>
              Someone you know
              <br />
              could change
              <br />
              <em>what happens next.</em>
            </h1>
            <p>
              Your next job. Your first customer. Someone who’s been there.
              <br className="l-desktop" /> Discover the possibilities hiding in
              your people and communities.
            </p>
            <Cta onClick={start}>See my hidden connections</Cta>
            <div className="l-hero-footnote">
              <span className="l-clicks">
                <i>1</i>
                <i>2</i>
              </span>
              Two clicks to explore your sample world.<span>No sign-up.</span>
            </div>
          </div>
          <HeroGraph selected={selected} onSelect={setSelected} />
          <div className="l-hero-margin">
            <span>YOUR WORLD IS ALREADY FULL OF POSSIBILITY.</span>
            <span>
              SCROLL TO FIND YOURS
              <ArrowRight size={12} />
            </span>
          </div>
        </section>
        <section
          className="l-begin l-container"
          aria-label="Get value in two clicks"
        >
          <div className="l-begin-note">
            <span className="l-hand">
              Less setup.
              <br />
              More serendipity.
            </span>
            <svg viewBox="0 0 100 50" aria-hidden="true">
              <path
                d="M5 9Q40 52 84 21M70 18L86 20L80 35"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          </div>
          <div className="l-begin-step">
            <span className="l-step-number">01</span>
            <div>
              <h3>Bring your people.</h3>
              <p>
                Start with Google. Add the rest of your world when you’re ready.
              </p>
            </div>
            <span className="l-google-mark">G</span>
          </div>
          <div className="l-begin-step">
            <span className="l-step-number">02</span>
            <div>
              <h3>Find your way in.</h3>
              <p>See your graph—and a connection you didn’t know you had.</p>
            </div>
            <span className="l-step-spark">✳</span>
          </div>
          <button className="l-begin-link" onClick={start}>
            Try the reveal
            <ArrowUpRight size={17} />
          </button>
        </section>
        <section className="l-ai-section" id="your-ai">
          <div className="l-container">
            <div className="l-section-intro">
              <div>
                <Eyebrow>THE CONVERSATIONS YOU’RE ALREADY HAVING</Eyebrow>
                <h2>
                  Your AI knows a lot.
                  <br />
                  Now it knows <em>your people.</em>
                </h2>
              </div>
              <p>
                You’re already asking ChatGPT and Claude about your next move.
                Ignyte brings your world into the answer.
              </p>
            </div>
            <div
              className="l-story-tabs"
              role="tablist"
              aria-label="Real-life possibilities"
            >
              {stories.map((s, i) => (
                <button
                  role="tab"
                  id={`story-tab-${i}`}
                  aria-controls="story-panel"
                  aria-selected={story === i}
                  tabIndex={story === i ? 0 : -1}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? stories.length - 1
                          : (i +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              stories.length) %
                            stories.length;
                    setStory(next);
                    setAgent(stories[next].agent);
                    setEvidence(false);
                    document.getElementById(`story-tab-${next}`)?.focus();
                  }}
                  key={s.label}
                  className={story === i ? "selected" : ""}
                  onClick={() => {
                    setStory(i);
                    setAgent(s.agent);
                    setEvidence(false);
                  }}
                >
                  <span>0{i + 1}</span>
                  {s.label}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <div
              className="l-ai-story"
              id="story-panel"
              role="tabpanel"
              aria-labelledby={`story-tab-${story}`}
            >
              <div className="l-story-narrative" key={`narrative-${story}`}>
                <span className="l-scene-label">
                  A MOMENT YOU MIGHT RECOGNIZE
                </span>
                <h3>
                  {current.title.split("\n").map((line, i) => (
                    <span key={line}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </h3>
                <p>{current.description}</p>
                {story === 0 ? (
                  <div className="l-story-illustration">
                    <div className="l-envelope">
                      <span>TO: YOUR NEXT CHAPTER</span>
                      <svg viewBox="0 0 270 155" aria-hidden="true">
                        <path d="M2 2L135 93L268 2M2 153L99 68M268 153L171 68" />
                      </svg>
                      <span className="l-envelope-stamp">
                        S<span>SHOPIFY</span>
                      </span>
                    </div>
                    <div className="l-envelope-note">
                      <span>
                        Turns out, Sara
                        <br />
                        knows someone.
                      </span>
                      <Spark />
                    </div>
                  </div>
                ) : story === 1 ? (
                  <div className="l-feedback-art">
                    <div className="l-feedback-note">
                      <span>A SMALL, HONEST CONVERSATION</span>
                      <p>
                        “I’d actually use this.
                        <br />
                        Can we talk?”
                      </p>
                      <div>
                        <Avatar p={jordan} size={30} />
                        <span>Jordan · someone you know</span>
                      </div>
                    </div>
                    <span className="l-feedback-mark">✳</span>
                  </div>
                ) : (
                  <div className="l-trip-art">
                    <div className="l-trip-ticket">
                      <span>MORE THAN A WORK TRIP</span>
                      <div>
                        <strong>YYZ</strong>
                        <ArrowRight size={24} />
                        <strong>NYC</strong>
                      </div>
                      <footer>
                        <span>2 PEOPLE WORTH SEEING</span>
                        <div>
                          <Avatar p={person("maya")} size={30} />
                          <Avatar p={person("oliver")} size={30} />
                        </div>
                      </footer>
                    </div>
                    <span className="l-hand">
                      Put a coffee
                      <br />
                      on the calendar.
                    </span>
                  </div>
                )}
                <span className="l-story-aside">{current.side}</span>
              </div>
              <div className="l-chat-frame">
                <div className="l-chat-top">
                  <span
                    className={`l-agent-symbol ${agent === "Claude" ? "is-claude" : ""}`}
                  >
                    {agent === "Claude" ? "✳" : "✺"}
                  </span>
                  <select
                    aria-label="Preview assistant"
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  >
                    <option>ChatGPT</option>
                    <option>Claude</option>
                  </select>
                  <span className="l-chat-connected">
                    <span />
                    Ignyte connected
                  </span>
                  <span className="l-preview-label">PREVIEW</span>
                </div>
                <div className="l-chat-content" key={`chat-${story}`}>
                  <div className="l-user-prompt">
                    {current.prompt}
                    <span className="l-chat-you">you</span>
                  </div>
                  <div className="l-tool-read">
                    <Spark small />
                    <span>Looking in your people brain</span>
                    <Check size={12} />
                  </div>
                  <div className="l-answer">
                    <h4>{current.lead}</h4>
                    <p>{current.answer}</p>
                  </div>
                  <a href={current.href} className="l-chat-contact">
                    <Avatar p={current.person} size={43} />
                    <span>
                      <strong>{current.personLabel}</strong>
                      <small>{current.personContext}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </a>
                  <Community>{current.community}</Community>
                  <div className="l-chat-source">
                    <button
                      aria-expanded={evidence}
                      onClick={() => setEvidence(!evidence)}
                    >
                      <Link2 size={12} />
                      {evidence ? "Hide the context" : "Why this connection?"}
                      <ChevronDown size={12} />
                    </button>
                    <span>GROUNDED IN YOUR WORLD</span>
                  </div>
                  {evidence && (
                    <div className="l-evidence">{current.evidence}</div>
                  )}
                  <ArrowLink href={current.href}>{current.action}</ArrowLink>
                </div>
                <div className="l-chat-compose">
                  <span>
                    Ask a better question. Get a more personal answer.
                  </span>
                  <a
                    href="/app/?view=ai"
                    aria-label="Try asking your people brain"
                  >
                    <ArrowRight size={17} />
                  </a>
                </div>
                <p className="l-chat-disclaimer">
                  An illustrative conversation. No live assistant connection.
                </p>
              </div>
            </div>
            <div className="l-ai-bottom">
              <span>
                <FolderSymbol />
                Your people brain. Wherever you think.
              </span>
              <span>
                ChatGPT<span className="l-small-plus">+</span>Claude
                <span className="l-small-plus">+</span>Your next favorite AI
              </span>
            </div>
          </div>
        </section>
        <section className="l-daily l-container" id="inside-ignyte">
          <div className="l-daily-heading">
            <Eyebrow>A LITTLE CONTEXT. A LOT OF POSSIBILITY.</Eyebrow>
            <h2>
              Sometimes you don’t
              <br />
              know <em>what to ask.</em>
            </h2>
            <p>
              Open Ignyte. See what’s worth your attention.
              <br />
              The right person, the right moment, a thread worth picking up.
            </p>
          </div>
          <div className="l-daily-grid">
            <article className="l-daily-story">
              <div className="l-daily-visual l-opportunity-visual">
                <div className="l-product-top">
                  <span>
                    <Spark small />
                    ignyte
                  </span>
                  <span>YOUR MONDAY, A LITTLE MORE HUMAN</span>
                </div>
                <div className="l-mini-question">
                  <Search size={15} />
                  Anything in my world I should pay attention to?
                </div>
                <div className="l-crossing-lines" aria-hidden="true">
                  <svg viewBox="0 0 460 170">
                    <path d="M80 62 Q230 157 375 52" />
                    <path d="M80 62 Q155 10 237 85 Q320 142 375 52" />
                  </svg>
                  <span className="l-connect-spark">✳</span>
                </div>
                <div className="l-two-people">
                  <div>
                    <Avatar p={person("priya")} size={68} />
                    <strong>Priya</strong>
                    <span>Building her product team</span>
                    <Community>Product Manager Community</Community>
                  </div>
                  <div>
                    <Avatar p={person("maya")} size={68} />
                    <strong>Maya</strong>
                    <span>Ready for her next chapter</span>
                    <Community>Your startup circle</Community>
                  </div>
                </div>
                <div className="l-insight-slip">
                  <Sparkles size={15} />
                  <p>
                    <strong>They should probably meet.</strong>Priya needs a PM.
                    Your note says Maya is exploring product roles. You know
                    them both.
                  </p>
                </div>
                <button
                  className={`l-product-action ${capture ? "is-saved" : ""}`}
                  onClick={() => setCapture(!capture)}
                >
                  {capture ? (
                    <>
                      <Check size={14} />
                      Saved for this visit
                    </>
                  ) : (
                    <>
                      Save this little possibility
                      <Plus size={14} />
                    </>
                  )}
                </button>
              </div>
              <div className="l-story-caption">
                <span>04 / THE CONNECTION YOU HAVEN’T MADE YET</span>
                <h3>
                  Be the reason
                  <br />
                  something good happens.
                </h3>
                <p>
                  The right introduction doesn’t have to be for you. Sometimes
                  you’re the person who can bring two worlds together.
                </p>
                <ArrowLink href="/app/?view=today">
                  See what’s worth your attention
                </ArrowLink>
              </div>
            </article>
            <article className="l-daily-story l-meeting-story">
              <div className="l-daily-visual l-meeting-visual">
                <div className="l-product-top">
                  <span>
                    <Spark small />
                    ignyte
                  </span>
                  <span>A MOMENT BEFORE YOUR MEETING</span>
                </div>
                <div className="l-meeting-paper">
                  <div className="l-paper-top">
                    <span>COFFEE WITH PRIYA</span>
                    <span>
                      IN 20 MINUTES
                      <ClockFace />
                    </span>
                  </div>
                  <div className="l-paper-title">
                    <h4>
                      Show up a little
                      <br />
                      <em>more present.</em>
                    </h4>
                    <Avatar p={person("priya")} size={60} />
                  </div>
                  <div className="l-brief-line">
                    <span>01</span>
                    <p>
                      <strong>A new chapter.</strong> She just joined Linear to
                      lead product.
                    </p>
                  </div>
                  <div className="l-brief-line">
                    <span>02</span>
                    <p>
                      <strong>An open promise.</strong> You offered to send
                      Maya’s portfolio.
                    </p>
                  </div>
                  <div className="l-paper-community">
                    <Users size={14} />
                    <span>You’re both in Product Manager Community.</span>
                  </div>
                  {brief && (
                    <div className="l-brief-expanded">
                      <span>A GOOD PLACE TO START</span>
                      <p>
                        “What kind of PM would complement the team you’re
                        building?”
                      </p>
                      <small>
                        From your confirmed note about her hiring plans.
                      </small>
                    </div>
                  )}
                  <button
                    className="l-paper-button"
                    aria-expanded={brief}
                    onClick={() => setBrief(!brief)}
                  >
                    {brief
                      ? "A little context goes a long way"
                      : "One good question to ask"}
                    {brief ? <Check size={14} /> : <ArrowRight size={14} />}
                  </button>
                </div>
                <span className="l-meeting-hand l-hand">
                  Remember the little things.
                </span>
              </div>
              <div className="l-story-caption">
                <span>05 / TWENTY MINUTES BEFORE COFFEE</span>
                <h3>
                  Less catching up.
                  <br />
                  More being there.
                </h3>
                <p>
                  The new role. That thing you promised. A little context that
                  lets you walk in present, rather than piecing it together.
                </p>
                <ArrowLink href="/app/?view=today">
                  Step into your day
                </ArrowLink>
              </div>
            </article>
          </div>
        </section>
        <section className="l-world-section" id="your-world">
          <div className="l-container l-world-layout">
            <div className="l-world-copy">
              <Eyebrow>YOUR WORLDS, CONNECTED</Eyebrow>
              <h2>
                Someone’s already
                <br />
                <em>been there.</em>
              </h2>
              <p className="l-world-lead">
                They might be one coffee away.
                <br />
                Or in a community you’ve belonged to for years.
              </p>
              <div className="l-community-question">
                <span>06 / FINDING A LITTLE EXPERIENCE</span>
                <h3>
                  “We need to get through SOC 2.
                  <br />
                  Who’s actually done this?”
                </h3>
                <p>
                  Leo could point you in the right direction. A founder he
                  collaborated with recently shared their experience in your
                  founders community.
                </p>
                <p>You haven’t met yet. But now you know where to start.</p>
              </div>
              <ArrowLink href="/app/?view=possibilities">
                Explore the bigger picture
              </ArrowLink>
              <span className="l-future-note">
                A preview of community context, powered by Cohesive.
              </span>
            </div>
            <div className="l-world-art">
              <div className="l-world-grid" />
              <svg
                className="l-world-threads"
                viewBox="0 0 540 500"
                aria-hidden="true"
              >
                <path d="M94 288 C180 353 279 255 350 250 C420 245 435 178 440 145" />
                <path d="M94 288 C150 215 90 147 144 105M350 250C260 245 315 141 280 99M350 250C398 390 353 402 283 432M350 250C483 332 523 277 488 340" />
              </svg>
              <div className="l-world-circle l-wc-one" />
              <div className="l-world-circle l-wc-two" />
              <div className="l-world-you">
                <Spark />
                <span>your world</span>
              </div>
              <div className="l-world-person l-world-leo">
                <Avatar
                  p={person(
                    community === 0
                      ? "leo"
                      : community === 1
                        ? "sara"
                        : "oliver",
                  )}
                  size={62}
                />
                <span>
                  {community === 0
                    ? "Leo"
                    : community === 1
                      ? "Sara"
                      : "Oliver"}
                </span>
                <small>
                  {community === 0
                    ? "your former teammate"
                    : community === 1
                      ? "your coffee person"
                      : "a fellow member"}
                </small>
              </div>
              <div className="l-world-person l-world-founder">
                <Avatar
                  p={person(
                    community === 0
                      ? "alex"
                      : community === 1
                        ? "daniel"
                        : "ella",
                  )}
                  size={51}
                />
                <span>
                  {community === 0
                    ? "Alex"
                    : community === 1
                      ? "Daniel"
                      : "Ella"}
                </span>
                <small>
                  {community === 0
                    ? "been through SOC 2"
                    : community === 1
                      ? "Sara’s former teammate"
                      : "a shared creative circle"}
                </small>
              </div>
              <div className="l-world-person l-world-other">
                <Avatar p={person("ella")} size={35} />
              </div>
              <div className="l-world-person l-world-other-two">
                <Avatar p={person("james")} size={32} />
              </div>
              <div className="l-world-person l-world-other-three">
                <Avatar p={person("nina")} size={36} />
              </div>
              <div className="l-world-cluster-label">
                <Users size={13} />
                {communityNames[community]}
              </div>
              <div className="l-world-evidence">
                <span>
                  <Link2 size={12} />A PATH, WITH A REASON
                </span>
                <p>
                  {community === 0
                    ? "Leo and Alex collaborated on a project in Founders Circle. Alex shared a first-hand SOC 2 write-up."
                    : community === 1
                      ? "You and Sara share this product community. Your separate calendar history shows you also know each other well."
                      : "Oliver is a fellow member. It gives you something in common—not a promise that he can make an introduction."}
                </p>
              </div>
              <div
                className="l-world-switch"
                role="group"
                aria-label="Explore shared communities"
              >
                {communityNames.map((name, i) => (
                  <button
                    key={name}
                    aria-pressed={community === i}
                    onClick={() => setCommunity(i)}
                  >
                    <span>{["↗", "✷", "◈"][i]}</span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="l-container l-source-ribbon">
            <p>
              A whole world of people.
              <br />
              <strong>Not just another address book.</strong>
            </p>
            <div className="l-source-families">
              <div>
                <span>G</span>
                <span>in</span>
                <span>⌘</span>
                <small>YOUR EVERYDAY CONNECTIONS</small>
              </div>
              <span className="l-source-plus">+</span>
              <div>
                <span className="l-slack">#</span>
                <span className="l-discord">◉</span>
                <span className="l-bettermode">b</span>
                <small>SLACK · DISCORD · BETTERMODE</small>
              </div>
            </div>
            <span className="l-ribbon-note">
              The more of your world you bring,
              <br />
              the more possibility you find.
            </span>
          </div>
        </section>
        <section className="l-finale">
          <div className="l-finale-orbit one" />
          <div className="l-finale-orbit two" />
          <div className="l-final-face ff-one">
            <Avatar p={person("sara")} size={52} />
          </div>
          <div className="l-final-face ff-two">
            <Avatar p={person("maya")} size={43} />
          </div>
          <div className="l-final-face ff-three">
            <Avatar p={person("leo")} size={45} />
          </div>
          <div className="l-container l-final-content">
            <span className="l-final-spark">✳</span>
            <Eyebrow>YOU’RE CLOSER THAN YOU THINK</Eyebrow>
            <h2>
              See who’s already
              <br />
              <em>in your corner.</em>
            </h2>
            <p>
              You don’t need to know more people to begin.
              <br />
              You need to see what’s already there.
            </p>
            <Cta onClick={start} light>
              Explore my world
            </Cta>
            <div className="l-final-proof">
              <span className="l-clicks">
                <i>1</i>
                <i>2</i>
              </span>
              Your graph. A hidden opportunity. Two clicks.
            </div>
            <div className="l-quiet-trust">
              <LockKeyhole size={12} />
              <span>Private to you. Email headers, never bodies.</span>
              <button onClick={() => setPrivacy(true)}>
                A little more on privacy
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="l-footer l-container">
        <div className="l-footer-top">
          <a href="#" className="l-brand">
            <Spark />
            ignyte<span>.</span>
          </a>
          <p>A little more human.</p>
          <div>
            <a href="/app/">
              Explore the demo
              <ArrowUpRight size={13} />
            </a>
            <button onClick={() => setPrivacy(true)}>Privacy</button>
            <a href="#your-ai">For your AI</a>
          </div>
        </div>
        <div className="l-footer-bottom">
          <span>© {new Date().getFullYear()} Ignyte</span>
          <span>
            A design preview. Fictional people, illustrative answers, real
            possibilities.
          </span>
          <span>MADE OF CONNECTIONS.</span>
        </div>
      </footer>
      {demo > 0 && (
        <Dialog
          title="Your world, in two clicks"
          onClose={() => setDemo(0)}
          wide={demo === 2}
        >
          <div className={`l-reveal-dialog ${demo === 2 ? "l-revealed" : ""}`}>
            <a
              className="l-brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setDemo(0);
              }}
            >
              <Spark />
              ignyte.
            </a>
            {demo === 1 ? (
              <>
                <div className="l-reveal-count">
                  <span className="done">
                    <Check size={12} />
                  </span>
                  <i />
                  <span>2</span>
                </div>
                <Eyebrow>ONE CLICK DOWN. ONE POSSIBILITY AWAY.</Eyebrow>
                <h2>
                  Let’s find someone
                  <br />
                  <em>already in your corner.</em>
                </h2>
                <p>
                  Use a sample Google account to see your closest people and
                  your first hidden opportunity.
                </p>
                <button className="l-google-connect" onClick={() => setDemo(2)}>
                  <span className="l-google-mark">G</span>
                  <span>
                    <strong>Connect sample Google account</strong>
                    <small>Alex · alex@example.com</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
                <div className="l-reveal-privacy">
                  <LockKeyhole size={13} />
                  <p>
                    Demo only. No sign-in, permissions, or real data.
                    <br />
                    The full product would ask for consent before connecting.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="l-revealed-grid">
                  <div>
                    <Eyebrow>TWO CLICKS. YOUR FIRST POSSIBILITY.</Eyebrow>
                    <h2>
                      You had a way in.
                      <br />
                      <em>Now you can see it.</em>
                    </h2>
                    <p>
                      Meet your first 50 people. One connection is already worth
                      a closer look.
                    </p>
                    <div className="l-first-discovery">
                      <span>
                        <Sparkles size={14} />
                        YOUR FIRST HIDDEN OPPORTUNITY
                      </span>
                      <h3>
                        You know someone
                        <br />
                        who knows Shopify.
                      </h3>
                      <p>
                        You and Sara meet monthly. A confirmed sample note says
                        she can reconnect you with Daniel, their Design
                        Director.
                      </p>
                      <MiniPath />
                    </div>
                    <ArrowLink href="/app/?q=Shopify" className="l-reveal-app">
                      Explore this introduction
                    </ArrowLink>
                    <a className="l-reveal-secondary" href="/app/?view=people">
                      See all 50 people
                      <ArrowRight size={13} />
                    </a>
                  </div>
                  <div className="l-reveal-map">
                    <HeroGraph selected={0} onSelect={setSelected} firstDay />
                    <span>50 PEOPLE. COUNTLESS POSSIBILITIES.</span>
                  </div>
                </div>
                <p className="l-reveal-bottom">
                  <Check size={13} />
                  Your sample world is ready. Google starts the story;
                  communities add more context when you connect them.
                </p>
              </>
            )}
          </div>
        </Dialog>
      )}
      {privacy && (
        <Dialog
          title="A little more on privacy"
          onClose={() => setPrivacy(false)}
        >
          <div className="l-privacy-dialog">
            <ShieldCheck size={27} />
            <Eyebrow>PERSONAL MEANS PERSONAL</Eyebrow>
            <h2>
              Your world.
              <br />
              <em>Yours to share.</em>
            </h2>
            <p>
              Ignyte is designed around a private people graph, with email
              headers rather than message bodies. You choose which sources and
              assistants can access it.
            </p>
            <p>
              This website and demo use fictional data. They don’t connect your
              accounts, read messages, or make live AI requests. The consent,
              deletion, and agent controls demonstrate the intended experience.
            </p>
            <ArrowLink href="/app/?view=settings">
              Explore the privacy controls
            </ArrowLink>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function FolderSymbol() {
  return (
    <svg
      width="17"
      height="16"
      viewBox="0 0 20 18"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 3h6l2 3h8v10H2V3Z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function ClockFace() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" />
      <path d="M7 3.5V7l2 1" stroke="currentColor" />
    </svg>
  );
}
