"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Sun,
  Users,
  Route,
  Sparkles,
  Settings,
  Mic,
  Plus,
  ChevronDown,
  Check,
  Clock,
  CalendarDays,
  ShieldCheck,
  Link2,
  MapPin,
  MoreHorizontal,
  List,
  Network,
  SlidersHorizontal,
  X,
  Copy,
  Heart,
  ExternalLink,
  Coffee,
  BriefcaseBusiness,
  CornerDownRight,
  Send,
  Folder,
  ChevronRight,
  LockKeyhole,
  Eye,
  Trash2,
  LogOut,
  Activity,
  Menu,
  RefreshCw,
  Bell,
  CheckCheck,
  FileText,
  AudioLines,
  Download,
  Upload,
  Globe,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";
import { people, person, stages, sourceInfo, type Person } from "../lib/demo";
import {
  Avatar,
  Button,
  CheckRow,
  Dialog,
  Empty,
  Pill,
  SectionTitle,
  Spark,
  Trend,
} from "./ui";
import Constellation from "./Constellation";
import Onboarding from "./Onboarding";
import PeopleBrain from "./PeopleBrain";
type View = "today" | "people" | "paths" | "possibilities" | "ai" | "settings";
type Modal =
  | { type: "person"; id: string }
  | { type: "draft"; id: string; intro?: boolean }
  | { type: "brief"; id: string }
  | { type: "voice" }
  | { type: "source"; id: string }
  | { type: "delete"; id: string }
  | { type: "morning" }
  | null;
const nav = [
  { id: "today", name: "Today", icon: Sun },
  { id: "people", name: "Your people", icon: Users },
  { id: "paths", name: "Warm paths", icon: Route },
  { id: "possibilities", name: "Possibilities", icon: Sparkles },
  { id: "ai", name: "Your people brain", icon: Folder },
] as const;
export default function Ignyte() {
  const [view, setView] = useState<View>("today");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("view");
    if (
      ["today", "people", "paths", "possibilities", "ai", "settings"].includes(
        requested || "",
      )
    )
      setView(requested as View);
    if (params.get("setup") === "1") setSetup(true);
    if (params.get("q")) {
      setQuery(params.get("q")!);
      setView("paths");
    }
  }, []);
  const [stage, setStage] = useState(1);
  const [modal, setModal] = useState<Modal>(null);
  const [setup, setSetup] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [connected, setConnected] = useState<string[]>(["google", "linkedin"]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [mobile, setMobile] = useState(false);
  const [morningEmail, setMorningEmail] = useState(false);
  const [privateNotes, setPrivateNotes] = useState(false);
  const [reset, setReset] = useState(false);
  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(""), 3800);
  };
  const go = (v: View) => {
    setView(v);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const search = (q: string) => {
    setQuery(q);
    go("paths");
  };
  const openPerson = (id: string) => setModal({ type: "person", id });
  const finishSetup = () => {
    setSetup(false);
    setReset(false);
    setStage(0);
    setConnected(["google"]);
    go("today");
    notify("Your first 50 people are ready. This is your demo world.");
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("today");
          }}
        >
          <Spark />
          ignyte<span className="wordmark-dot">.</span>
        </a>
        <button className="workspace-switch" onClick={() => setSetup(true)}>
          <span className="self-avatar">AM</span>
          <span>
            Alex’s world<small>Just for you</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">YOUR LITTLE UNIVERSE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              {n.id === "ai" && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <button
          className="capture-button"
          onClick={() => setModal({ type: "voice" })}
        >
          <Mic size={17} />
          Capture a thought<span>＋</span>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-growth">
            <div className="tiny-sparks">
              ✳ <span>✧</span>
            </div>
            <strong>A little more connected.</strong>
            <p>Every new piece of your world opens another door.</p>
            <button onClick={() => go("settings")}>
              Grow your graph
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={18} />
            Connections & privacy
          </button>
          <div className="private-label">
            <LockKeyhole size={12} />
            Your world. Yours alone.
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>
              {view === "settings"
                ? "Your space"
                : nav.find((n) => n.id === view)?.name}
            </span>
            <span className="breadcrumb-slash">/</span>
            <span className="muted">A world of possibility</span>
          </div>
          <div className="top-actions">
            <span className="demo-tag">
              <span />
              DESIGN PREVIEW
            </span>
            <button className="setup-link" onClick={() => setSetup(true)}>
              Start setup
              <ArrowUpRight size={14} />
            </button>
            <button
              className="self-avatar small-self"
              aria-label="Your account and privacy"
              onClick={() => go("settings")}
            >
              AM
            </button>
          </div>
        </header>
        <div className="page-content">
          {reset ? (
            <Empty
              title="A fresh start, whenever you’re ready."
              body="Your sample graph has been cleared for this session. Start setup to explore Ignyte again."
              action="Start setup"
              onClick={() => setSetup(true)}
            />
          ) : (
            <>
              {view === "today" && (
                <>
                  <div className="home-heading">
                    <div>
                      <div className="eyebrow">
                        <Sun size={15} />
                        MONDAY, SEPTEMBER 28
                      </div>
                      <h1>
                        Your people.
                        <br className="mobile-break" /> A little{" "}
                        <em>closer.</em>
                      </h1>
                      <p>
                        A new week. A few familiar faces. Something good around
                        the corner.
                      </p>
                    </div>
                    <div className="handwritten">
                      Good things happen
                      <br />
                      between people.<span>↙</span>
                    </div>
                  </div>
                  <SearchBox onSearch={search} />
                  <div className="home-columns">
                    <div className="home-primary">
                      <SectionTitle
                        label="A little attention goes a long way"
                        action="Your morning brief"
                        onClick={() => setModal({ type: "morning" })}
                      />
                      <div className="nudge-grid">
                        {[
                          {
                            id: "priya",
                            tag: "A NEW CHAPTER",
                            title: "Big move, Priya.",
                            text: "She just joined Linear as Head of Product. A lovely reason to say hello.",
                            cta: "Send a little congrats",
                            tone: "sage",
                            icon: BriefcaseBusiness,
                          },
                          {
                            id: "daniel",
                            tag: "SMALL WORLD",
                            title: "Look who’s in town.",
                            text: "Daniel is in Toronto this week. Your last coffee was far too long ago.",
                            cta: "Make time for coffee",
                            tone: "peach",
                            icon: Coffee,
                          },
                          {
                            id: "maya",
                            tag: "KEEP THE THREAD",
                            title: "Pick up where you left off.",
                            text: "You told Maya you’d share your deck. It’s been six weeks. She’d love to hear from you.",
                            cta: "Reconnect with Maya",
                            tone: "lavender",
                            icon: Heart,
                          },
                        ].map((n) => (
                          <article
                            className={`nudge-card ${n.tone} ${done.includes(n.id) ? "completed" : ""}`}
                            key={n.id}
                          >
                            <div className="nudge-top">
                              <n.icon size={17} />
                              <button
                                aria-label={`Dismiss ${n.title}`}
                                className="quiet-icon"
                                onClick={() => {
                                  setDone([...done, n.id]);
                                  notify("Set aside for today.");
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {done.includes(n.id) ? (
                              <div className="nudge-done">
                                <CheckCheck size={28} />
                                <h3>A little lighter.</h3>
                                <p>All taken care of for today.</p>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setDone(done.filter((d) => d !== n.id))
                                  }
                                >
                                  Undo
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="card-eyebrow">{n.tag}</span>
                                <h3>{n.title}</h3>
                                <p>{n.text}</p>
                                <button
                                  className="nudge-person"
                                  onClick={() => openPerson(n.id)}
                                >
                                  <Avatar p={person(n.id)} size={27} />
                                  <span>
                                    {person(n.id).name}
                                    <small>
                                      {n.id === "priya"
                                        ? "Role update · LinkedIn import"
                                        : n.id === "daniel"
                                          ? "This week · Shared calendar"
                                          : "Follow-up · Your note"}
                                    </small>
                                  </span>
                                </button>
                                <button
                                  className="nudge-cta"
                                  onClick={() =>
                                    setModal({ type: "draft", id: n.id })
                                  }
                                >
                                  {n.cta}
                                  <ArrowUpRight size={15} />
                                </button>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                      <div className="agenda-section">
                        <SectionTitle
                          label="A few faces on your calendar"
                          action="View daily brief"
                          onClick={() => setModal({ type: "morning" })}
                        />
                        <div className="agenda-list">
                          {[
                            {
                              id: "sara",
                              time: "10:30",
                              period: "AM",
                              title: "Coffee & a catch-up",
                              meta: "30 min · Neo Coffee Bar",
                              label: "Your monthly ritual",
                            },
                            {
                              id: "priya",
                              time: "2:00",
                              period: "PM",
                              title: "A fresh perspective on product",
                              meta: "45 min · Google Meet",
                              label: "Something new to talk about",
                            },
                          ].map((m) => (
                            <div className="meeting-row" key={m.id}>
                              <div className="meeting-time">
                                {m.time}
                                <small>{m.period}</small>
                              </div>
                              <Avatar p={person(m.id)} size={42} />
                              <div className="meeting-info">
                                <strong>{m.title}</strong>
                                <p>
                                  {person(m.id).name} <span>·</span> {m.meta}
                                </p>
                              </div>
                              <span className="meeting-note">{m.label}</span>
                              <button
                                className="brief-button"
                                onClick={() =>
                                  setModal({ type: "brief", id: m.id })
                                }
                              >
                                Get me ready
                                <ArrowUpRight size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="brain-banner">
                        <div className="folder-art">
                          <Folder size={30} />
                          <Spark small />
                        </div>
                        <div>
                          <span className="eyebrow">
                            YOUR CONTEXT, EVERYWHERE
                          </span>
                          <h3>Your AI should know your people, too.</h3>
                          <p>
                            Bring your world into ChatGPT, Claude, and whatever
                            comes next.
                          </p>
                        </div>
                        <button
                          className="round-arrow"
                          aria-label="Explore your people brain"
                          onClick={() => go("ai")}
                        >
                          <ArrowUpRight size={21} />
                        </button>
                      </div>
                    </div>
                    <aside className="world-panel">
                      <div className="world-title">
                        <span className="eyebrow">THE BIGGER PICTURE</span>
                        <button
                          className="icon-button"
                          aria-label="Explore your people map"
                          onClick={() => go("people")}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                      <h2>
                        A small world.
                        <br />
                        <em>Yours to discover.</em>
                      </h2>
                      <Constellation onPerson={openPerson} stage={stage} />
                      <div className="world-count">
                        <strong>{stages[stage].count}</strong>
                        <span>people. Countless possibilities.</span>
                      </div>
                      <div className="world-footer">
                        <span>
                          <span className="status-dot" />
                          {stages[stage].sources}
                        </span>
                        <button onClick={() => go("people")}>
                          Explore your map
                          <ArrowRight size={15} />
                        </button>
                      </div>
                      <div className="growth-switch">
                        <label htmlFor="stage">
                          EXPLORE YOUR GRAPH AS IT GROWS
                        </label>
                        <select
                          id="stage"
                          value={stage}
                          onChange={(e) => setStage(Number(e.target.value))}
                        >
                          {stages.map((s, i) => (
                            <option value={i} key={s.name}>
                              {s.name} · {s.count} people
                            </option>
                          ))}
                        </select>
                      </div>
                    </aside>
                  </div>
                  <div className="bottom-note">
                    <ShieldCheck size={13} />
                    Made of connections, never email content.
                    <span>Fictional people. Real possibilities.</span>
                  </div>
                </>
              )}
              {view === "people" && (
                <PeopleView
                  onPerson={openPerson}
                  hidden={removed}
                  stage={stage}
                  onGrow={() => go("settings")}
                />
              )}
              {view === "paths" && (
                <Paths
                  query={query}
                  setQuery={setQuery}
                  onPerson={openPerson}
                  onDraft={(id) => setModal({ type: "draft", id, intro: true })}
                />
              )}
              {view === "possibilities" && (
                <Possibilities
                  stage={stage}
                  setStage={setStage}
                  onSearch={search}
                  onAI={() => go("ai")}
                  onBrief={() => setModal({ type: "brief", id: "priya" })}
                />
              )}
              <div hidden={view !== "ai"}>
                <PeopleBrain
                  notify={notify}
                  privateNotes={privateNotes}
                  hidden={hidden}
                  onPerson={openPerson}
                  onNote={(id, text) => {
                    setNotes({ ...notes, [id]: [...(notes[id] || []), text] });
                    notify("Confirmed note added to Priya’s demo profile.");
                  }}
                />
              </div>
              {view === "settings" && (
                <>
                  <PageHeading
                    eyebrow="YOUR WORLD, ON YOUR TERMS"
                    title={
                      <>
                        More context.
                        <br />
                        <em>Never less control.</em>
                      </>
                    }
                    body="Bring your people together. Choose exactly what comes along."
                  />
                  <div className="settings-grid">
                    <div>
                      <SectionTitle label="A few pieces of your world" />
                      <div className="source-list">
                        {sourceInfo.map((s) => (
                          <div className="source-row" key={s.id}>
                            <span
                              className="source-logo"
                              style={{ color: s.color }}
                            >
                              {s.letter}
                            </span>
                            <div>
                              <strong>
                                {s.name}
                                {s.id === "community" && (
                                  <Pill>Future concept</Pill>
                                )}
                              </strong>
                              <p>{s.description}</p>
                              {connected.includes(s.id) && (
                                <small className="green-text">
                                  <Check size={12} />
                                  Connected in demo · Synced just now
                                </small>
                              )}
                            </div>
                            <button
                              className={
                                connected.includes(s.id)
                                  ? "text-button"
                                  : "button-secondary compact"
                              }
                              onClick={() =>
                                setModal({ type: "source", id: s.id })
                              }
                            >
                              {connected.includes(s.id) ? "Manage" : "Explore"}
                              {connected.includes(s.id) ? (
                                <ChevronRight size={15} />
                              ) : (
                                <Plus size={14} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="settings-card">
                        <SectionTitle label="The details are yours to choose" />
                        <Toggle
                          title="Morning brief by email"
                          description="A little people context at 8:00 AM. Delivery is simulated."
                          checked={morningEmail}
                          onChange={() => setMorningEmail(!morningEmail)}
                        />
                        <Toggle
                          title="Let your AI read personal notes"
                          description="Off by default. Relationship summaries are always separate."
                          checked={privateNotes}
                          onChange={() => setPrivateNotes(!privateNotes)}
                        />
                        <div className="privacy-line">
                          <div>
                            <strong>People hidden from your AI</strong>
                            <p>
                              {hidden.length
                                ? `${hidden.length} people excluded from agent context.`
                                : "Your full demo graph is visible. Hide anyone from their profile."}
                            </p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => go("people")}
                          >
                            Manage
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="privacy-promise">
                        <ShieldCheck size={27} />
                        <h2>
                          Private isn’t a setting.
                          <br />
                          <em>It’s the starting point.</em>
                        </h2>
                        <CheckRow>Email headers. Never email bodies.</CheckRow>
                        <CheckRow>Your graph belongs only to you.</CheckRow>
                        <CheckRow>No selling your data. Ever.</CheckRow>
                        <CheckRow>Every insight shows its source.</CheckRow>
                        <p>
                          This is a design prototype. All connected sources and
                          activity are simulated; no account access is
                          requested.
                        </p>
                      </div>
                      <div className="settings-card">
                        <h3>You’re always in charge.</h3>
                        <p>
                          Reset your sample world, including notes, source
                          connections, and AI permissions.
                        </p>
                        <button
                          className="danger-button"
                          onClick={() =>
                            setModal({ type: "delete", id: "account" })
                          }
                        >
                          <Trash2 size={15} />
                          Delete demo data
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <footer className="app-footer">
          <span>
            <Spark small />A little more human.
          </span>
          <a href="/">← Back to Ignyte · Interactive prototype</a>
        </footer>
      </main>
      {setup && (
        <Onboarding onClose={() => setSetup(false)} onFinish={finishSetup} />
      )}
      {modal && (
        <Dialog
          title={
            modal.type === "person"
              ? person(modal.id).name
              : modal.type === "source"
                ? "Connect a source"
                : modal.type === "brief"
                  ? "Meeting brief"
                  : modal.type === "voice"
                    ? "Capture a thought"
                    : modal.type === "delete"
                      ? "Delete demo data"
                      : "Your people context"
          }
          onClose={() => setModal(null)}
          wide={modal.type === "morning"}
        >
          {modal.type === "person" && (
            <PersonPanel
              p={person(modal.id)}
              notes={notes[modal.id] || []}
              hidden={hidden.includes(modal.id)}
              onHide={() => {
                setHidden(
                  hidden.includes(modal.id)
                    ? hidden.filter((h) => h !== modal.id)
                    : [...hidden, modal.id],
                );
                notify(
                  hidden.includes(modal.id)
                    ? "Visible to your AI again."
                    : "Hidden from your AI in this demo.",
                );
              }}
              onDraft={() => setModal({ type: "draft", id: modal.id })}
              onNote={(text) => {
                setNotes({
                  ...notes,
                  [modal.id]: [...(notes[modal.id] || []), text],
                });
                notify("Note saved to this demo session.");
              }}
              onDelete={() => setModal({ type: "delete", id: modal.id })}
            />
          )}
          {modal.type === "draft" && (
            <Draft
              p={person(modal.id)}
              intro={modal.intro}
              notify={notify}
              onDone={() => {
                setDone([...done, modal.id]);
                setModal(null);
                notify("Marked as done. No message was sent.");
              }}
            />
          )}
          {modal.type === "brief" && (
            <Brief p={person(modal.id)} onPerson={() => openPerson(modal.id)} />
          )}
          {modal.type === "morning" && (
            <Morning
              onBrief={(id) => setModal({ type: "brief", id })}
              onDraft={(id) => setModal({ type: "draft", id })}
            />
          )}
          {modal.type === "voice" && (
            <Voice
              onSave={(id, text) => {
                setNotes({ ...notes, [id]: [...(notes[id] || []), text] });
                setModal({ type: "person", id });
                notify("Your thought is now part of Priya’s story.");
              }}
            />
          )}
          {modal.type === "source" && (
            <SourcePanel
              id={modal.id}
              connected={connected.includes(modal.id)}
              onConnect={() => {
                setConnected([...new Set([...connected, modal.id])]);
                setStage(Math.max(stage, modal.id === "community" ? 2 : 1));
                setModal(null);
                notify(
                  "Sample source added. Your demo world is a little richer.",
                );
              }}
              onDisconnect={() => {
                setConnected(connected.filter((s) => s !== modal.id));
                setModal(null);
                notify("Source disconnected in this demo.");
              }}
              onDelete={() =>
                setModal({ type: "delete", id: `source-${modal.id}` })
              }
            />
          )}
          {modal.type === "delete" && (
            <div className="dialog-content">
              <div className="large-icon">
                <Trash2 />
              </div>
              <h2>
                {modal.id === "account"
                  ? "Make a fresh start?"
                  : modal.id.startsWith("source-")
                    ? "Remove this source’s data?"
                    : `Remove ${person(modal.id).name.split(" ")[0]} from this view?`}
              </h2>
              <p>
                {modal.id === "account"
                  ? "This clears the sample graph, notes, and connections for this session. You can restart setup at any time."
                  : modal.id.startsWith("source-")
                    ? "This simulates removing source records and recalculating the graph. Other sources remain connected."
                    : "This hides the sample person from the people list and AI context for this session."}{" "}
                No real data is affected.
              </p>
              <div className="dialog-actions">
                <Button secondary onClick={() => setModal(null)}>
                  Keep it
                </Button>
                <button
                  className="button-danger"
                  onClick={() => {
                    if (modal.id === "account") {
                      setReset(true);
                      setConnected([]);
                      setNotes({});
                      setHidden([]);
                      setRemoved([]);
                      setDone([]);
                      setPrivateNotes(false);
                      setMorningEmail(false);
                      go("today");
                    } else if (modal.id.startsWith("source-"))
                      setConnected(
                        connected.filter(
                          (s) => s !== modal.id.replace("source-", ""),
                        ),
                      );
                    else {
                      setHidden([...hidden, modal.id]);
                      setRemoved([...removed, modal.id]);
                    }
                    setModal(null);
                    notify("Demo data removed for this session.");
                  }}
                >
                  Remove demo data
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}
function SearchBox({
  onSearch,
  initial = "",
}: {
  onSearch: (s: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="search-area">
      <form
        className="hero-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(value.trim() || "Shopify");
        }}
      >
        <Search size={21} />
        <input
          aria-label="Find a person, company, or role"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Who do you want to get closer to?"
        />
        <span className="search-hint">A person, company, or possibility</span>
        <button aria-label="Find warm paths" type="submit">
          <ArrowRight size={21} />
        </button>
      </form>
      <div className="search-suggestions">
        <span>A little inspiration</span>
        {[
          "Someone at Shopify",
          "A great product designer",
          "Friends in Toronto",
        ].map((s) => (
          <button
            key={s}
            onClick={() => {
              setValue(s);
              onSearch(s);
            }}
          >
            {s}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}
function PeopleView({
  onPerson,
  hidden,
  stage,
  onGrow,
}: {
  onPerson: (id: string) => void;
  hidden: string[];
  stage: number;
  onGrow: () => void;
}) {
  const [map, setMap] = useState(false);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("Everyone");
  const [city, setCity] = useState("Any city");
  const [trend, setTrend] = useState("Any rhythm");
  const filtered = people.filter(
    (p) =>
      !hidden.includes(p.id) &&
      `${p.name} ${p.role} ${p.company}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (tier === "Everyone" || p.tier === tier) &&
      (city === "Any city" || p.city === city) &&
      (trend === "Any rhythm" || p.trend === trend),
  );
  return (
    <>
      <PageHeading
        eyebrow="FAMILIAR FACES. NEW POSSIBILITIES."
        title={
          <>
            A world built
            <br />
            on <em>your people.</em>
          </>
        }
        body={`${stages[stage].count} people in your sample world. Here are the 50 closest, with a little more context.`}
      />
      <div className="people-toolbar">
        <div className="small-search">
          <Search size={17} />
          <input
            aria-label="Search your people"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find someone in your world"
          />
        </div>
        <div className="view-toggle">
          <button
            className={!map ? "selected" : ""}
            aria-label="List view"
            onClick={() => setMap(false)}
          >
            <List size={17} />
            List
          </button>
          <button
            className={map ? "selected" : ""}
            aria-label="Map view"
            onClick={() => setMap(true)}
          >
            <Network size={17} />
            Map
          </button>
        </div>
        <Button secondary onClick={onGrow}>
          <Plus size={15} />
          Add a source
        </Button>
      </div>
      <div className="filter-row">
        <SlidersHorizontal size={15} />
        <select
          aria-label="Relationship tier"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        >
          {["Everyone", "Inner circle", "Close", "Active", "Rediscover"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
        <select
          aria-label="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          {["Any city", "Toronto", "San Francisco", "New York", "London"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
        <select
          aria-label="Relationship trend"
          value={trend}
          onChange={(e) => setTrend(e.target.value)}
        >
          {["Any rhythm", "warming", "steady", "cooling"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <span>{filtered.length} people in this view</span>
      </div>
      {map ? (
        <div className="map-surface">
          <div className="map-heading">
            <span className="eyebrow">YOUR INNER ORBIT</span>
            <h2>
              There’s a story
              <br />
              between every two dots.
            </h2>
            <p>
              A curated view of 12 close relationships.
              <br />
              Use the list to explore all filtered people.
            </p>
          </div>
          <Constellation large onPerson={onPerson} stage={stage} />
          <div className="map-legend">
            <span>
              <i />
              Inner circle
            </span>
            <span>
              <i />
              Close connections
            </span>
            <span>
              <i />
              People to rediscover
            </span>
          </div>
        </div>
      ) : filtered.length ? (
        <div className="people-table">
          <div className="people-table-head">
            <span>YOUR PERSON</span>
            <span>THEIR WORLD</span>
            <span>YOUR CONNECTION</span>
            <span>LAST IN TOUCH</span>
          </div>
          {filtered.map((p) => (
            <button
              className="person-row"
              key={p.id}
              onClick={() => onPerson(p.id)}
            >
              <span className="person-name">
                <Avatar p={p} />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.city}</small>
                </span>
              </span>
              <span className="person-role">
                <strong>{p.role}</strong>
                <small>{p.company}</small>
              </span>
              <span className="person-strength">
                <span className="strength-bar">
                  <i style={{ width: `${p.strength}%` }} />
                </span>
                <span>
                  {p.tier}
                  <Trend value={p.trend} />
                </span>
              </span>
              <span className="person-last">
                {p.last}
                <ArrowUpRight size={15} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No familiar faces here yet."
          body="Try another name or loosen a filter to find your people."
          action="Clear filters"
          onClick={() => {
            setQ("");
            setTier("Everyone");
            setCity("Any city");
            setTrend("Any rhythm");
          }}
        />
      )}
    </>
  );
}
function Paths({
  query,
  setQuery,
  onPerson,
  onDraft,
}: {
  query: string;
  setQuery: (q: string) => void;
  onPerson: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  const [value, setValue] = useState(query);
  const q = query.toLowerCase();
  const isShop = q.includes("shopify");
  const isDesigner = q.includes("design");
  const isToronto = q.includes("toronto");
  const isHiring = q.includes("hiring") || q.includes("product manager");
  const isFunding = q.includes("invest") || q.includes("fund");
  const matches = query
    ? people
        .filter((p) =>
          isShop
            ? p.company === "Shopify"
            : isDesigner
              ? p.role.toLowerCase().includes("design")
              : isToronto
                ? p.city === "Toronto"
                : isHiring
                  ? ["priya", "nina", "oliver"].includes(p.id)
                  : isFunding
                    ? p.id === "alex"
                    : `${p.name} ${p.company} ${p.role} ${p.city}`
                        .toLowerCase()
                        .includes(q),
        )
        .slice(0, 6)
    : [];
  return (
    <>
      <PageHeading
        eyebrow="THE BEST WAY IN IS THROUGH SOMEONE YOU KNOW"
        title={
          <>
            You’re closer
            <br />
            than <em>you think.</em>
          </>
        }
        body="A company, a person, a new direction. Let’s find the human connection."
      />
      <form
        className="hero-search path-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(value.trim());
        }}
      >
        <Search size={21} />
        <input
          aria-label="Search warm paths"
          placeholder="Try Shopify, a product designer, or Toronto…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button aria-label="Search paths">
          <ArrowRight size={21} />
        </button>
      </form>
      {!query ? (
        <div className="path-empty">
          <div className="example-path">
            <Avatar p={person("sara")} size={64} />
            <span>·······</span>
            <span className="company-logo">S</span>
          </div>
          <h2>
            One good introduction
            <br />
            can change everything.
          </h2>
          <p>
            Start with a place you want to go.
            <br />
            Your people might already know the way.
          </p>
          <Button
            onClick={() => {
              setValue("Shopify");
              setQuery("Shopify");
            }}
          >
            Find my way into Shopify
            <ArrowRight size={16} />
          </Button>
        </div>
      ) : matches.length ? (
        <>
          <div className="results-heading">
            <div>
              <h2>
                {isShop
                  ? "Your way into Shopify"
                  : `Your connections for “${query}”`}
              </h2>
              <p>
                {matches.length} direct connections
                {isShop ? " · 1 evidenced introduction path" : ""} in this
                sample graph
              </p>
            </div>
            <Pill tone="green">
              <ShieldCheck size={12} />
              Grounded in your graph
            </Pill>
          </div>
          {isShop && (
            <div className="featured-path">
              <div className="path-feature-top">
                <Pill tone="green">
                  <Sparkles size={12} />
                  YOUR WARMEST INTRODUCTION
                </Pill>
                <span>Strong path · 88 / 100</span>
              </div>
              <div className="path-visual">
                <div className="path-node">
                  <span className="path-you">AM</span>
                  <strong>You</strong>
                  <small>The beginning</small>
                </div>
                <div className="path-connector">
                  <span>Monthly catch-ups</span>
                  <i />
                  <small>91 · Inner circle</small>
                </div>
                <button className="path-node" onClick={() => onPerson("sara")}>
                  <Avatar p={person("sara")} size={65} />
                  <strong>Sara Chen</strong>
                  <small>Product Lead · Figma</small>
                </button>
                <div className="path-connector">
                  <span>Former teammates</span>
                  <i />
                  <small>3 years at Shopify</small>
                </div>
                <button
                  className="path-node"
                  onClick={() => onPerson("daniel")}
                >
                  <Avatar p={person("daniel")} size={65} />
                  <strong>Daniel Kim</strong>
                  <small>Design Director · Shopify</small>
                </button>
                <div className="path-destination">
                  <span className="company-logo">S</span>
                </div>
              </div>
              <div className="path-explanation">
                <div>
                  <h3>A familiar face can open the door.</h3>
                  <p>
                    You and Sara catch up every month. She and Daniel worked
                    together at Shopify from 2019–2022. You’ve met Daniel once;
                    Sara could help you pick up the thread.
                  </p>
                  <span>
                    <Link2 size={12} />
                    Your calendar + LinkedIn import + your note · Confirmed
                    connection
                  </span>
                </div>
                <Button onClick={() => onDraft("sara")}>
                  Ask Sara for an intro
                  <ArrowUpRight size={16} />
                </Button>
              </div>
            </div>
          )}
          <SectionTitle
            label={
              isShop ? "You also know them directly" : "People who could help"
            }
          />
          <div className="direct-grid">
            {matches.map((p) => (
              <article className="direct-card" key={p.id}>
                <button
                  className="direct-person"
                  onClick={() => onPerson(p.id)}
                >
                  <Avatar p={p} size={49} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.role} · {p.company}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
                <p>{p.context}</p>
                <div className="direct-card-bottom">
                  <Pill>
                    {p.tier} · {p.strength}
                  </Pill>
                  <button className="text-button" onClick={() => onDraft(p.id)}>
                    Draft a hello
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="honesty-note">
            <Eye size={16} />
            <p>
              A shared workplace or community is a clue, not a guaranteed
              introduction. We show the evidence so you can judge the
              connection.
            </p>
          </div>
        </>
      ) : (
        <Empty
          title="No warm path just yet."
          body={`There isn’t enough evidence for “${query}” in this demo graph. Ignyte won’t invent a connection.`}
          action="Explore Shopify instead"
          onClick={() => {
            setQuery("Shopify");
            setValue("Shopify");
          }}
        />
      )}
    </>
  );
}
function Possibilities({
  stage,
  setStage,
  onSearch,
  onAI,
  onBrief,
}: {
  stage: number;
  setStage: (s: number) => void;
  onSearch: (s: string) => void;
  onAI: () => void;
  onBrief: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="IT STARTS WITH PEOPLE. IT GROWS INTO POSSIBILITY."
        title={
          <>
            A richer graph.
            <br />A bigger <em>what if.</em>
          </>
        }
        body="From your first fifty people to the worlds you didn’t know you were connected to."
      />
      <div className="journey-tabs">
        {stages.map((s, i) => (
          <button
            key={s.name}
            className={stage === i ? "selected" : ""}
            onClick={() => setStage(i)}
          >
            <span>0{i + 1}</span>
            <div>
              <strong>{s.name}</strong>
              <small>
                {s.count} people · {s.sources}
              </small>
            </div>
            {stage === i && <Check size={18} />}
          </button>
        ))}
      </div>
      <div className="possibility-hero">
        <div>
          <Pill tone="green">
            {stage === 0
              ? "VALUE IN YOUR FIRST MINUTE"
              : stage === 1
                ? "CONTEXT MAKES THE DIFFERENCE"
                : "YOUR WORLDS, CONNECTED"}
          </Pill>
          <h2>
            {stage === 0 ? (
              <>
                You already know
                <br />
                <em>someone who can help.</em>
              </>
            ) : stage === 1 ? (
              <>
                The right person.
                <br />
                <em>For what’s next.</em>
              </>
            ) : (
              <>
                Your next opportunity
                <br />
                <em>is between worlds.</em>
              </>
            )}
          </h2>
          <p>
            {stage === 0
              ? "Google brings your closest relationships into focus. Find a familiar face at your dream company before you connect anything else."
              : stage === 1
                ? "LinkedIn and phone contacts add career history and old connections. Now “Who should I talk to?” becomes a much better question."
                : "Community context reveals shared spaces. Your AI connects those dots with your goals, while you decide what it can see."}
          </p>
          <Button
            onClick={() =>
              onSearch(
                stage === 0
                  ? "Shopify"
                  : stage === 1
                    ? "product designer"
                    : "Toronto",
              )
            }
          >
            Explore this possibility
            <ArrowRight size={16} />
          </Button>
        </div>
        <Constellation onPerson={() => onSearch("Shopify")} stage={stage} />
      </div>
      <div className="usecase-grid">
        {[
          {
            n: "01",
            icon: BriefcaseBusiness,
            title: "Build your next team",
            prompt: "“Who could help me find a founding designer?”",
            body: "See designers you know, who’s hiring, and the friends who can make a thoughtful introduction.",
            context: "Sara → Daniel · shared product background",
            action: () => onSearch("product designer"),
            cta: "Explore the hiring story",
          },
          {
            n: "02",
            icon: MapPin,
            title: "Make a new city feel familiar",
            prompt: "“I’m in Toronto next week. Who should I see?”",
            body: "Bring together local friends, visiting connections, and the people you keep meaning to catch up with.",
            context: "Daniel is visiting · Amina lives nearby",
            action: () => onSearch("Toronto"),
            cta: "Find familiar faces",
          },
          {
            n: "03",
            icon: Coffee,
            title: "Show up with a little context",
            prompt: "“What should I know before meeting Priya?”",
            body: "Her new role, your last conversation, and that promise you made. Walk in present, not scrambling.",
            context: "New role at Linear · an open follow-up",
            action: onBrief,
            cta: "Read the meeting brief",
          },
          {
            n: "04",
            icon: Sparkles,
            title: "Let your AI connect the dots",
            prompt: "“Who in my world understands consumer AI?”",
            body: "Your assistant can reason with relationship context, cite its sources, and ask before adding anything.",
            context:
              stage === 2
                ? "Cohesive + contacts + your notes"
                : "Your relationship summaries, with permission",
            action: onAI,
            cta: "Try the agent experience",
          },
        ].map((c) => (
          <article className="usecase-card" key={c.n}>
            <div className="usecase-top">
              <c.icon size={22} />
              <span>{c.n}</span>
            </div>
            <h3>{c.title}</h3>
            <blockquote>{c.prompt}</blockquote>
            <p>{c.body}</p>
            <small>
              <Link2 size={13} />
              {c.context}
            </small>
            <button className="text-button" onClick={c.action}>
              {c.cta}
              <ArrowUpRight size={16} />
            </button>
          </article>
        ))}
      </div>
      <div className="cohesive-note">
        <span className="source-logo">c</span>
        <div>
          <h3>A future with Cohesive.</h3>
          <p>
            Your Slack, Discord, and Bettermode communities become another
            source of relationship evidence. Shared spaces reveal possibilities;
            membership alone never claims a personal connection.
          </p>
        </div>
        <Pill>Future concept</Pill>
      </div>
    </>
  );
}
function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="privacy-line">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={title}
        aria-checked={checked}
        className={`toggle ${checked ? "on" : ""}`}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}
function PersonPanel({
  p,
  notes,
  hidden,
  onHide,
  onDraft,
  onNote,
  onDelete,
}: {
  p: Person;
  notes: string[];
  hidden: boolean;
  onHide: () => void;
  onDraft: () => void;
  onNote: (s: string) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("Their story");
  return (
    <>
      <div className="profile-cover">
        <span>Every person is a whole world.</span>
        <Spark />
      </div>
      <div className="profile-body">
        <Avatar p={p} size={82} />
        <div className="profile-title">
          <div>
            <h2>{p.name}</h2>
            <p>
              {p.role} at {p.company}
            </p>
            <span>
              <MapPin size={13} />
              {p.city}
            </span>
          </div>
          <button
            className={`icon-button ${hidden ? "muted" : ""}`}
            aria-label={hidden ? "Make visible to AI" : "Hide from AI"}
            onClick={onHide}
          >
            <Eye size={19} />
          </button>
        </div>
        <div className="profile-badges">
          <Pill tone="green">{p.tier}</Pill>
          <Trend value={p.trend} />
          <Pill>{hidden ? "Hidden from AI" : "Visible to your AI"}</Pill>
        </div>
        <p className="profile-context">{p.context}</p>
        <Button onClick={onDraft}>
          Draft a thoughtful hello
          <ArrowUpRight size={15} />
        </Button>
        <div className="profile-tabs">
          {["Their story", "Your notes", "Connection"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "selected" : ""}
            >
              {t}
              {t === "Your notes" && notes.length > 0
                ? ` (${notes.length})`
                : ""}
            </button>
          ))}
        </div>
        {tab === "Their story" ? (
          <>
            <h3>A little context</h3>
            <div className="timeline">
              <div>
                <i />
                <small>
                  {p.id === "priya" ? "THIS WEEK" : "RECENTLY"} · LINKEDIN
                  IMPORT
                </small>
                <strong>
                  {p.id === "priya"
                    ? "A new chapter at Linear"
                    : `${p.role} at ${p.company}`}
                </strong>
                <p>
                  {p.id === "priya"
                    ? "Priya joined as Head of Product. She’s putting together her first team."
                    : "Current professional context from the sample source record."}
                </p>
              </div>
              <div>
                <i />
                <small>{p.last.toUpperCase()} · CALENDAR METADATA</small>
                <strong>A conversation worth keeping</strong>
                <p>
                  A 30-minute catch-up. Your calendar tells us you made time,
                  not what you talked about.
                </p>
              </div>
              <div>
                <i />
                <small>YOUR NOTE · PERSONAL CONTEXT</small>
                <strong>
                  {p.id === "priya"
                    ? "She’s looking for a great PM."
                    : "A familiar thread to pick up."}
                </strong>
                <p>{p.context}</p>
              </div>
            </div>
            <h3>A few familiar faces</h3>
            <div className="mutual-people">
              {["sara", "daniel", "maya"]
                .filter((id) => id !== p.id)
                .map((id) => (
                  <span key={id}>
                    <Avatar p={person(id)} size={30} />
                    {person(id).name.split(" ")[0]}
                  </span>
                ))}
            </div>
          </>
        ) : tab === "Your notes" ? (
          <>
            <h3>The things only you know</h3>
            <p className="muted">
              Personal context is separate from email metadata. Notes are
              private to your demo session.
            </p>
            <div className="saved-note">
              <FileText size={16} />
              <p>{p.context}</p>
            </div>
            {notes.map((n, i) => (
              <div className="saved-note" key={i}>
                <FileText size={16} />
                <p>
                  {n}
                  <small>Added just now · You confirmed this</small>
                </p>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) {
                  onNote(note.trim());
                  setNote("");
                }
              }}
            >
              <textarea
                aria-label="Add personal context"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A small detail you don’t want to forget…"
              />
              <Button disabled={!note.trim()}>
                Save a note
                <Plus size={15} />
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="score-heading">
              <div>
                <h3>Why you’re connected</h3>
                <p>Signals, not a judgment of your friendship.</p>
              </div>
              <strong>
                {p.strength}
                <small>/100</small>
              </strong>
            </div>
            {[
              {
                label: "You make time",
                value: 90,
                reason: "Four one-to-one meetings in the past 90 days.",
              },
              {
                label: "It goes both ways",
                value: 85,
                reason: "Balanced replies, based on email headers only.",
              },
              {
                label: "More than one channel",
                value: 75,
                reason: "Google contacts and LinkedIn connection.",
              },
              {
                label: "A recent conversation",
                value: p.strength,
                reason: `Last interaction ${p.last}.`,
              },
            ].map((s) => (
              <div className="score-row" key={s.label}>
                <span>
                  {s.label}
                  <small>{s.reason}</small>
                </span>
                <div className="strength-bar">
                  <i style={{ width: `${s.value}%` }} />
                </div>
              </div>
            ))}
            <div className="honesty-note">
              <ShieldCheck size={17} />
              <p>
                Illustrative scores from fictional data. Every future score
                should preserve the source and time of its evidence.
              </p>
            </div>
          </>
        )}
        <div className="profile-bottom">
          <button className="text-button" onClick={onHide}>
            <Eye size={14} />
            {hidden ? "Allow AI access" : "Hide from your AI"}
          </button>
          <button className="text-button muted" onClick={onDelete}>
            <Trash2 size={14} />
            Remove person
          </button>
        </div>
      </div>
    </>
  );
}
function Draft({
  p,
  intro,
  notify,
  onDone,
}: {
  p: Person;
  intro?: boolean;
  notify: (s: string) => void;
  onDone: () => void;
}) {
  const initial =
    intro && p.id === "sara"
      ? "Hey Sara! I’m exploring what the team at Shopify is building. I remember you and Daniel worked together — would you feel comfortable reconnecting us? No pressure at all. Coffee soon either way!"
      : p.id === "priya"
        ? "Priya! Just saw the news about Linear — so happy for you. They’re lucky to have you. Would love to hear about what you’re building when you have a moment."
        : p.id === "daniel"
          ? "Hey Daniel, saw you’re in Toronto this week! Would be lovely to catch up over coffee. Any time on Thursday?"
          : p.id === "maya"
            ? "Hey Maya! I realized I never sent over that deck — sorry for the slow follow-up. Would love to hear how things are going with Forma. Let’s catch up soon."
            : `Hey ${p.name.split(" ")[0]}! You came to mind today. Would love to hear how things are going at ${p.company}. Up for a catch-up sometime soon?`;
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  return (
    <div className="dialog-content">
      <span className="eyebrow">A LITTLE HELP FINDING THE WORDS</span>
      <h2>
        {intro && p.id === "sara"
          ? "An introduction, thoughtfully."
          : "A small hello goes a long way."}
      </h2>
      <div className="draft-to">
        <Avatar p={p} />
        <div>
          <strong>{p.name}</strong>
          <small>
            {p.role} · {p.company}
          </small>
        </div>
      </div>
      <textarea
        className="draft-text"
        aria-label="Edit message draft"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="draft-context">
        <Sparkles size={15} />
        <span>
          Grounded in {intro ? "your shared history" : "their recent context"}.
          A starting point, in your own voice.
        </span>
      </div>
      <div className="dialog-actions">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              notify("Copied. Edit and send it in your own messaging app.");
            } catch {
              notify("Select the draft text to copy it manually.");
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
          {copied ? "Copied" : "Copy draft"}
        </Button>
        <Button secondary onClick={onDone}>
          Mark as done
          <Check size={16} />
        </Button>
      </div>
      <p className="fine-print">
        <ShieldCheck size={13} />
        Ignyte never sends on your behalf.
      </p>
    </div>
  );
}
function Brief({ p, onPerson }: { p: Person; onPerson: () => void }) {
  return (
    <div className="dialog-content brief-dialog">
      <div className="eyebrow">
        <Coffee size={14} />A MOMENT OF CONTEXT
      </div>
      <h2>
        Show up a little
        <br />
        <em>more present.</em>
      </h2>
      <button className="brief-person" onClick={onPerson}>
        <Avatar p={p} size={54} />
        <span>
          <strong>{p.name}</strong>
          <small>
            {p.role} · {p.company}
          </small>
        </span>
        <ArrowUpRight size={17} />
      </button>
      <div className="brief-meta">
        <CalendarDays size={14} />
        Today ·{" "}
        {p.id === "sara"
          ? "10:30 AM · Neo Coffee Bar"
          : "2:00 PM · Google Meet"}
      </div>
      <div className="brief-section">
        <h3>Since you last talked</h3>
        <p>
          {p.id === "priya"
            ? "Priya has just joined Linear as Head of Product. She’s hiring a PM and shaping the team’s next chapter."
            : "Sara has been exploring the intersection of design tools and AI. You last caught up four days ago and planned this longer coffee."}
        </p>
        <small>
          Source:{" "}
          {p.id === "priya"
            ? "LinkedIn import + your confirmed note"
            : "your note + calendar metadata"}
        </small>
      </div>
      <div className="brief-section">
        <h3>Your shared thread</h3>
        <p>{p.context}</p>
        <small>Source: your personal note · not email content</small>
      </div>
      <div className="talking-points">
        <span className="eyebrow">THREE THINGS YOU COULD ASK</span>
        {(p.id === "priya"
          ? [
              "What’s the first thing you want to build at Linear?",
              "What kind of PM would complement your new team?",
              "Would an introduction to someone in my world help?",
            ]
          : [
              "What’s been surprising you about AI and design lately?",
              "How’s the latest project at Figma coming along?",
              "Would you feel comfortable reconnecting me with Daniel?",
            ]
        ).map((t, i) => (
          <div key={t}>
            <span>0{i + 1}</span>
            <p>{t}</p>
          </div>
        ))}
      </div>
      <p className="fine-print">
        <ShieldCheck size={13} />
        Sample brief · Calendar, imported profile, and your notes
      </p>
    </div>
  );
}
function Morning({
  onBrief,
  onDraft,
}: {
  onBrief: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  return (
    <div className="dialog-content morning-dialog">
      <span className="eyebrow">
        <Sun size={15} />
        YOUR MONDAY, A LITTLE MORE HUMAN
      </span>
      <h2>
        A few good reasons
        <br />
        to <em>reach out.</em>
      </h2>
      <p className="morning-intro">
        Two conversations to look forward to. A friend starting something new.
        And a thread worth picking back up.
      </p>
      <div className="morning-columns">
        <div>
          <h3>Make room for these two.</h3>
          {["sara", "priya"].map((id, i) => (
            <button
              className="morning-meeting"
              key={id}
              onClick={() => onBrief(id)}
            >
              <span>{i ? "2:00 PM" : "10:30 AM"}</span>
              <Avatar p={person(id)} size={36} />
              <strong>{person(id).name}</strong>
              <ArrowUpRight size={16} />
            </button>
          ))}
          <h3>A hello that would mean something.</h3>
          <p>
            Priya’s starting a new chapter at Linear. A personal congrats will
            mean more than another reaction on a post.
          </p>
          <button className="text-button" onClick={() => onDraft("priya")}>
            Find the words
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="morning-aside">
          <Heart size={22} />
          <h3>Don’t lose the thread with Maya.</h3>
          <p>
            Six weeks ago, you promised her your deck. Your note is still here.
            A small follow-up is all it takes.
          </p>
          <button className="text-button" onClick={() => onDraft("maya")}>
            Pick it back up
            <ArrowUpRight size={15} />
          </button>
          <hr />
          <p>
            Daniel is in Toronto this week, too. There might be a coffee in your
            future.
          </p>
        </div>
      </div>
      <span className="fine-print">
        Built from fictional calendar events, changes, and notes. Email delivery
        can be previewed in settings.
      </span>
    </div>
  );
}
function Voice({ onSave }: { onSave: (id: string, text: string) => void }) {
  const [step, setStep] = useState(0);
  const [id, setId] = useState("priya");
  const [text, setText] = useState(
    "Met Priya for coffee. She’s hiring a PM for her new team at Linear. I said I’d send her Maya’s portfolio this week.",
  );
  return (
    <div className="dialog-content voice-dialog">
      <span className="eyebrow">THE LITTLE THINGS MATTER</span>
      <h2>
        {step === 0 ? (
          <>
            A thought worth
            <br />
            <em>keeping.</em>
          </>
        ) : step === 1 ? (
          <>
            Your words.
            <br />
            <em>A little more context.</em>
          </>
        ) : (
          <>
            The right person.
            <br />
            <em>The right memory.</em>
          </>
        )}
      </h2>
      {step === 0 ? (
        <>
          <p>
            Names, promises, a good conversation. Get it out of your head and
            into your people brain.
          </p>
          <button
            className="record-button"
            aria-label="Preview a voice note"
            onClick={() => setStep(1)}
          >
            <Mic size={32} />
          </button>
          <span className="record-label">Try a sample voice note</span>
          <p className="fine-print">
            Prototype preview. Your microphone won’t be accessed.
          </p>
        </>
      ) : step === 1 ? (
        <>
          <div className="waveform">
            {Array.from({ length: 34 }, (_, i) => (
              <i
                key={i}
                style={{ height: `${12 + Math.sin(i * 1.7) ** 2 * 43}px` }}
              />
            ))}
          </div>
          <Pill>
            <AudioLines size={13} />
            Sample recording · 0:14
          </Pill>
          <textarea
            aria-label="Voice note transcript"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button disabled={!text.trim()} onClick={() => setStep(2)}>
            Review the person match
            <ArrowRight size={16} />
          </Button>
        </>
      ) : (
        <>
          <p>Before anything is saved, make sure we have the right person.</p>
          <label className="field-label" htmlFor="person-match">
            ATTACH THIS THOUGHT TO
          </label>
          <select
            id="person-match"
            className="full-select"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {people.slice(0, 12).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.company}
              </option>
            ))}
          </select>
          <div className="extracted-facts">
            <strong>Your confirmed context</strong>
            <p>{text}</p>
            <span>
              <Check size={14} />
              Only the transcript you reviewed will be saved.
            </span>
          </div>
          <Button onClick={() => onSave(id, text)}>
            Confirm & save thought
            <Check size={16} />
          </Button>
          <button className="text-button back-link" onClick={() => setStep(1)}>
            Edit transcript
          </button>
        </>
      )}
    </div>
  );
}
function SourcePanel({
  id,
  connected,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  id: string;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const s = sourceInfo.find((s) => s.id === id)!;
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="dialog-content">
      <span className="source-logo large-source" style={{ color: s.color }}>
        {s.letter}
      </span>
      <span className="eyebrow">
        {connected ? "YOUR CONNECTED WORLD" : "MAKE YOUR WORLD A LITTLE RICHER"}
      </span>
      <h2>
        {s.name}
        <br />
        <em>
          {connected ? "A piece of your picture." : "Another door opens."}
        </em>
      </h2>
      <p>{s.benefit}</p>
      <div className="source-explanation">
        <ShieldCheck size={18} />
        <p>{s.detail}</p>
      </div>
      {connected ? (
        <>
          <div className="source-status">
            <CheckCircle2 size={20} />
            <div>
              <strong>Connected in this demo</strong>
              <p>Last sample sync: just now. No real account is connected.</p>
            </div>
          </div>
          <div className="dialog-actions">
            <Button secondary onClick={onDisconnect}>
              <LogOut size={15} />
              Disconnect source
            </Button>
            <button className="danger-button" onClick={onDelete}>
              <Trash2 size={14} />
              Delete source data
            </button>
          </div>
        </>
      ) : id === "community" ? (
        <>
          <div className="community-providers">
            <Pill>Slack</Pill>
            <Pill>Discord</Pill>
            <Pill>Bettermode</Pill>
          </div>
          <p>
            Cohesive will add memberships and interaction summaries to the same
            private graph. Community membership suggests shared context, not a
            guaranteed relationship.
          </p>
          <Button onClick={onConnect}>
            Preview community context
            <ArrowRight size={16} />
          </Button>
        </>
      ) : step === 0 ? (
        <>
          {id === "linkedin" && (
            <>
              <label className="field-label" htmlFor="linkedin-url">
                YOUR LINKEDIN PROFILE (OPTIONAL)
              </label>
              <input
                className="full-input"
                id="linkedin-url"
                placeholder="linkedin.com/in/your-name"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </>
          )}
          <div className="import-steps">
            {(id === "linkedin"
              ? [
                  "Request your connections export in LinkedIn settings.",
                  "Download Connections.csv or your data archive.",
                  "Import it here to match names, roles, and companies.",
                ]
              : id === "phone"
                ? [
                    "Choose selected contacts on your phone.",
                    "Or export a vCard (.vcf) from your address book.",
                    "Review and merge into the people you already know.",
                  ]
                : id === "x"
                  ? [
                      "Request your X account data archive.",
                      "Use the following and followers files.",
                      "Review mutual connections before adding context.",
                    ]
                  : [
                      "Choose your Google account.",
                      "Review contacts, calendar, and email-header permissions.",
                      "Start with your closest relationships.",
                    ]
            ).map((t, i) => (
              <div key={t}>
                <span>{i + 1}</span>
                <p>{t}</p>
              </div>
            ))}
          </div>
          {error && (
            <p className="form-error" role="alert">
              That sample format couldn’t be read. Try the supported demo file
              below.
            </p>
          )}
          <Button
            onClick={() => {
              setStep(1);
              setError(false);
            }}
          >
            <Upload size={16} />
            {id === "google"
              ? "Preview Google connection"
              : "Use sample import"}
          </Button>
          {id !== "google" && (
            <button
              className="text-button back-link"
              onClick={() => setError(true)}
            >
              Preview an unsupported file
            </button>
          )}
          <p className="fine-print">
            Demo only. No file is uploaded and no credentials are requested.
          </p>
        </>
      ) : (
        <>
          <div className="import-success">
            <CheckCircle2 size={30} />
            <h3>Your world, a little more complete.</h3>
            <p>
              {id === "linkedin"
                ? "198 connections found · 36 matched to existing people"
                : id === "phone"
                  ? "84 selected contacts · 21 matched to existing people"
                  : id === "x"
                    ? "42 mutual follows · 12 familiar faces"
                    : "50 close connections ready to explore"}
            </p>
          </div>
          <div className="match-preview">
            <Avatar p={person("sara")} size={34} />
            <span>
              Sara Chen<small>Matched by email · High confidence</small>
            </span>
            <Check size={16} />
          </div>
          <Button onClick={onConnect}>
            Add sample connections
            <ArrowRight size={16} />
          </Button>
        </>
      )}
    </div>
  );
}
