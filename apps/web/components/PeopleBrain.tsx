"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Link2,
  LockKeyhole,
  Folder,
  Sparkles,
  Plus,
  Send,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Copy,
  X,
  CheckCircle2,
  Activity,
  Terminal,
  Unplug,
  Users,
} from "lucide-react";
import { Avatar, Button, CheckRow, Dialog, Pill, Spark } from "./ui";
import { person } from "../lib/demo";
type Agent = "ChatGPT" | "Claude" | "Other agents";
type Message = {
  role: "user" | "assistant";
  saved?: boolean;
  text: string;
  kind?: "shopify" | "hire" | "note" | "city" | "empty";
};
export default function PeopleBrain({
  notify,
  privateNotes,
  hidden,
  onPerson,
  onNote,
}: {
  notify: (s: string) => void;
  privateNotes: boolean;
  hidden: string[];
  onPerson: (id: string) => void;
  onNote: (id: string, text: string) => void;
}) {
  const [agent, setAgent] = useState<Agent>("ChatGPT");
  const [approved, setApproved] = useState<Agent[]>([]);
  const [permission, setPermission] = useState(false);
  const [writes, setWrites] = useState<Agent[]>([]);
  const write = writes.includes(agent);
  const [draftWrite, setDraftWrite] = useState(false);
  const requestAccess = (target: Agent = agent) => {
    setAgent(target);
    setDraftWrite(writes.includes(target));
    setPermission(true);
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("Try a conversation");
  const [evidence, setEvidence] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const connected = approved.includes(agent);
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [messages.length]);
  const ask = (text: string) => {
    if (!connected) {
      requestAccess();
      return;
    }
    const lower = text.toLowerCase();
    const kind: Message["kind"] =
      lower.includes("note") || lower.includes("remember")
        ? "note"
        : lower.includes("toronto") || lower.includes("city")
          ? "city"
          : lower.includes("design") ||
              lower.includes("hiring") ||
              lower.includes("team")
            ? "hire"
            : lower.includes("shopify")
              ? "shopify"
              : "empty";
    setMessages([
      ...messages,
      { role: "user", text },
      { role: "assistant", text: "", kind },
    ]);
    setInput("");
    setLogs([
      `${agent} · ${kind === "note" ? "Requested a note for your confirmation" : kind === "empty" ? "Searched the sample graph · no supported result" : `Read ${kind === "shopify" ? "3" : "2"} relationship summaries`}`,
      ...logs,
    ]);
  };
  return (
    <>
      <div className="brain-heading">
        <div className="eyebrow">PERSONAL CONTEXT. BEYOND THIS TAB.</div>
        <h1>
          Every AI has a brain.
          <br />
          Give yours a <em>people folder.</em>
        </h1>
        <p>
          Your relationships, memories, and warm paths. Available to the
          assistants
          <br className="desktop-only" /> you already use. Always on your terms.
        </p>
      </div>
      <div className="brain-flow">
        <div className="brain-flow-source">
          <span className="mini-source">G</span>
          <span className="mini-source">in</span>
          <span className="mini-source">⌘</span>
          <span className="mini-source">c</span>
        </div>
        <span className="flow-line" />
        <div className="brain-folder">
          <Folder size={30} />
          <div>
            <strong>/people</strong>
            <small>Your private Ignyte brain</small>
          </div>
          <Spark small />
        </div>
        <span className="flow-line" />
        <div className="brain-destinations">
          <span>ChatGPT</span>
          <span>Claude</span>
          <span>Your agent</span>
        </div>
      </div>
      <div className="ai-tabs">
        {[
          "Try a conversation",
          "Permissions & activity",
          "How it connects",
        ].map((t) => (
          <button
            className={t === tab ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Try a conversation" ? (
        <div className="agent-layout">
          <aside className="agent-setup">
            <span className="eyebrow">MEET YOUR ASSISTANT</span>
            <h2>
              Same AI.
              <br />
              <em>Now it knows you.</em>
            </h2>
            <p>
              Ask about the people in your world. Get answers with reasons,
              sources, and a human way forward.
            </p>
            <div className="agent-options">
              {(["ChatGPT", "Claude", "Other agents"] as Agent[]).map((a) => (
                <button
                  className={agent === a ? "selected" : ""}
                  key={a}
                  onClick={() => {
                    setAgent(a);
                    setMessages([]);
                    setEvidence(false);
                  }}
                >
                  <span
                    className={`agent-icon ${a === "Claude" ? "claude" : ""}`}
                  >
                    {a === "ChatGPT" ? "✺" : a === "Claude" ? "✳" : "⌘"}
                  </span>
                  <span>
                    {a}
                    <small>
                      {approved.includes(a)
                        ? "Connected in demo"
                        : a === "Other agents"
                          ? "MCP-compatible assistants"
                          : "Connection preview"}
                    </small>
                  </span>
                  {agent === a ? (
                    <Check size={16} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>
              ))}
            </div>
            <div className="agent-status">
              <ShieldCheck size={16} />
              <p>
                Summaries, not raw email logs.
                <br />
                Read-only unless you approve a note.
              </p>
            </div>
            <Pill>Simulated agent experience</Pill>
          </aside>
          <div className="chat-window">
            <div className="chat-header">
              <div>
                <span className="agent-icon">
                  {agent === "Claude" ? "✳" : agent === "ChatGPT" ? "✺" : "⌘"}
                </span>
                <strong>{agent}</strong>
                <span className="muted">+ Ignyte</span>
              </div>
              <Pill tone={connected ? "green" : ""}>
                {connected ? (
                  <>
                    <span className="status-dot" />
                    People brain connected
                  </>
                ) : (
                  "Not connected"
                )}
              </Pill>
            </div>
            {!connected ? (
              <div className="chat-disconnected">
                <div className="connected-folder">
                  <Folder size={44} />
                  <Spark small />
                </div>
                <h3>
                  Make your AI
                  <br />
                  <em>a little more personal.</em>
                </h3>
                <p>
                  “Who do I know at Shopify?” becomes a question your assistant
                  can actually answer.
                </p>
                <Button onClick={() => requestAccess()}>
                  Connect Ignyte to {agent}
                  <ArrowRight size={16} />
                </Button>
                <span className="fine-print">
                  Preview permissions. No external app is opened.
                </span>
              </div>
            ) : (
              <>
                <div ref={chat} className="chat-messages" aria-live="polite">
                  {messages.length === 0 ? (
                    <div className="chat-welcome">
                      <span className="chat-welcome-spark">✳</span>
                      <h3>
                        Your world is part
                        <br />
                        of the conversation.
                      </h3>
                      <p>
                        Try a question below. Every answer comes from the same
                        sample people graph you’ve explored.
                      </p>
                      <div className="prompt-chips">
                        {[
                          "Who do I know at Shopify?",
                          "Who could help me hire a designer?",
                          "Who should I see in Toronto?",
                        ].map((p) => (
                          <button key={p} onClick={() => ask(p)}>
                            {p}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={`chat-message ${m.role}`}>
                        {m.role === "user" ? (
                          <p>{m.text}</p>
                        ) : (
                          <>
                            <div className="tool-call">
                              <CheckCircle2 size={13} />
                              {m.kind === "note"
                                ? "Ignyte · request to add_note"
                                : `Ignyte · ${m.kind === "shopify" ? "find_warm_paths" : m.kind === "city" ? "search_people" : "search_people"}`}
                              <span>DEMO</span>
                            </div>
                            {m.kind === "shopify" ? (
                              <>
                                <p>
                                  You have a warm route into{" "}
                                  <strong>Shopify</strong>. I’d start with Sara.
                                </p>
                                {!hidden.includes("sara") ? (
                                  <button
                                    className="chat-person"
                                    onClick={() => onPerson("sara")}
                                  >
                                    <Avatar p={person("sara")} size={35} />
                                    <span>
                                      <strong>Sara Chen</strong>
                                      <small>
                                        Your monthly coffee partner · 91
                                        strength
                                      </small>
                                    </span>
                                    <ArrowUpRight size={15} />
                                  </button>
                                ) : (
                                  <p>
                                    Sara’s profile is hidden by your privacy
                                    controls. I can’t share her details.
                                  </p>
                                )}
                                <p>
                                  {hidden.includes("sara") ||
                                  hidden.includes("daniel")
                                    ? "Your privacy settings limit this introduction path. Review visible direct connections in Ignyte."
                                    : "Sara and Daniel Kim, Shopify’s Design Director, worked together for three years. You’ve met Daniel once; Sara could help reconnect you."}
                                </p>
                                <div className="chat-citation">
                                  <Link2 size={12} />
                                  Calendar + imported career history + confirmed
                                  note
                                </div>
                                <p className="chat-caveat">
                                  This is evidence of a connection, not a
                                  promise of an introduction.
                                </p>
                              </>
                            ) : m.kind === "hire" ? (
                              <>
                                <p>
                                  {hidden.includes("daniel")
                                    ? "One designer is excluded by your privacy settings."
                                    : "Daniel Kim is a strong starting point for a design hire: he leads design at Shopify and knows the craft."}{" "}
                                  {!hidden.includes("sara")
                                    ? "Sara can help you reconnect."
                                    : ""}
                                </p>
                                {!hidden.includes("amina") && (
                                  <button
                                    className="chat-person"
                                    onClick={() => onPerson("amina")}
                                  >
                                    <Avatar p={person("amina")} size={35} />
                                    <span>
                                      <strong>Amina Yusuf</strong>
                                      <small>
                                        Senior Product Designer · Shopify
                                      </small>
                                    </span>
                                    <ArrowUpRight size={15} />
                                  </button>
                                )}
                                <p>
                                  A shared design background makes a
                                  conversation relevant. I don’t have evidence
                                  that either person is looking for a new role.
                                </p>
                                <div className="chat-citation">
                                  <Link2 size={12} />
                                  Professional roles + relationship summaries
                                </div>
                              </>
                            ) : m.kind === "city" ? (
                              <>
                                <p>
                                  A few familiar faces could make Toronto feel
                                  smaller:
                                </p>
                                {["sara", "daniel", "amina"]
                                  .filter((id) => !hidden.includes(id))
                                  .map((id) => (
                                    <button
                                      className="chat-person"
                                      key={id}
                                      onClick={() => onPerson(id)}
                                    >
                                      <Avatar p={person(id)} size={30} />
                                      <span>
                                        <strong>{person(id).name}</strong>
                                        <small>
                                          {id === "daniel"
                                            ? "Visiting this week · sample calendar"
                                            : id === "sara"
                                              ? "Monthly coffee partner"
                                              : "Local design connection"}
                                        </small>
                                      </span>
                                      <ArrowUpRight size={14} />
                                    </button>
                                  ))}
                                <p>
                                  Daniel’s visit is based on your shared sample
                                  calendar. Confirm availability before making
                                  plans.
                                </p>
                              </>
                            ) : m.kind === "note" ? (
                              hidden.includes("priya") ? (
                                <p>
                                  Priya is hidden from your AI. Change her
                                  visibility in Ignyte before adding a note
                                  through an agent.
                                </p>
                              ) : !write ? (
                                <>
                                  <p>
                                    This connection is read-only. You’ll need to
                                    allow confirmed notes before I can save
                                    personal context.
                                  </p>
                                  <button
                                    className="text-button"
                                    onClick={() => requestAccess()}
                                  >
                                    Review permissions
                                    <ArrowRight size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p>
                                    I can save this to{" "}
                                    <strong>Priya Sharma</strong>, after you
                                    confirm.
                                  </p>
                                  <div className="pending-note">
                                    <FileText size={17} />
                                    <p>
                                      {messages[i - 1]?.text.replace(
                                        /^remember[: ]*/i,
                                        "",
                                      ) || "Priya is hiring a PM."}
                                    </p>
                                  </div>
                                  <Button
                                    disabled={m.saved}
                                    onClick={() => {
                                      const text =
                                        messages[i - 1]?.text.replace(
                                          /^remember[: ]*/i,
                                          "",
                                        ) || "Priya is hiring a PM.";
                                      onNote("priya", text);
                                      setMessages((current) =>
                                        current.map((message, index) =>
                                          index === i
                                            ? { ...message, saved: true }
                                            : message,
                                        ),
                                      );
                                      setLogs([
                                        `${agent} · Added one note with your confirmation`,
                                        ...logs,
                                      ]);
                                    }}
                                  >
                                    {m.saved ? (
                                      <>
                                        <Check size={15} />
                                        Note confirmed
                                      </>
                                    ) : (
                                      <>
                                        Confirm & add to Priya
                                        <Check size={15} />
                                      </>
                                    )}
                                  </Button>
                                </>
                              )
                            ) : (
                              <p>
                                This prototype supports Shopify introductions,
                                designer hiring, Toronto catch-ups, and a
                                confirmed note for Priya. I don’t have a
                                grounded demo answer to that question. Try one
                                of those scenarios.
                              </p>
                            )}
                            {m.kind !== "empty" && m.kind !== "note" && (
                              <button
                                className="evidence-button"
                                onClick={() => setEvidence(!evidence)}
                              >
                                <Eye size={13} />
                                {evidence ? "Hide" : "Inspect"} the context
                                shared
                                <ChevronDown size={12} />
                              </button>
                            )}
                            {evidence &&
                              m.kind !== "empty" &&
                              m.kind !== "note" && (
                                <div className="evidence-box">
                                  <strong>
                                    Only the context needed for this answer
                                  </strong>
                                  <CheckRow>
                                    Visible people’s names and professional
                                    roles
                                  </CheckRow>
                                  <CheckRow>
                                    Relationship summaries and path evidence
                                  </CheckRow>
                                  <CheckRow>
                                    {privateNotes
                                      ? "Personal notes allowed by your setting"
                                      : "Personal notes excluded by your setting"}
                                  </CheckRow>
                                  <p>
                                    No email bodies, raw message logs, phone
                                    numbers, or hidden people.
                                  </p>
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-composer">
                  <button
                    className="suggest-note"
                    onClick={() =>
                      ask(
                        "Remember: Priya is hiring a PM. I promised to send her Maya’s portfolio.",
                      )
                    }
                  >
                    <Plus size={12} />
                    Try a confirmed note
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (input.trim()) ask(input.trim());
                    }}
                  >
                    <input
                      aria-label="Ask your people brain"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about your people…"
                    />
                    <button
                      disabled={!input.trim()}
                      aria-label="Send demo prompt"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </form>
                  <span>
                    Illustrative answers · No live ChatGPT, Claude, or MCP
                    connection
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      ) : tab === "Permissions & activity" ? (
        <div className="ai-permissions-grid">
          <div className="settings-card">
            <h2>
              Access is a choice.
              <br />
              <em>Not a blank check.</em>
            </h2>
            <p>
              Your assistant sees only what you allow. Revoking access ends this
              demo connection immediately.
            </p>
            {(["ChatGPT", "Claude", "Other agents"] as Agent[]).map((a) => (
              <div className="privacy-line" key={a}>
                <div>
                  <strong>{a}</strong>
                  <p>
                    {approved.includes(a)
                      ? `Connected · ${writes.includes(a) ? "Confirmed notes allowed" : "Read-only summaries"}`
                      : "No access"}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setAgent(a);
                    if (approved.includes(a)) {
                      setApproved(approved.filter((x) => x !== a));
                      setWrites(writes.filter((x) => x !== a));
                      setMessages([]);
                      setLogs([`${a} · Access revoked by you`, ...logs]);
                      notify(`${a} disconnected from the demo graph.`);
                    } else requestAccess(a);
                  }}
                >
                  {approved.includes(a) ? "Revoke access" : "Connect"}
                  {approved.includes(a) ? (
                    <Unplug size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              </div>
            ))}
            <div className="honesty-note">
              <Eye size={16} />
              <p>
                {hidden.length} people hidden · Personal notes{" "}
                {privateNotes ? "included" : "excluded"} · Raw email logs always
                excluded
              </p>
            </div>
          </div>
          <div className="settings-card activity-card">
            <div className="section-title">
              <h2>A transparent trail.</h2>
              <Activity size={20} />
            </div>
            <p>Every sample lookup and permission change appears here.</p>
            {logs.length ? (
              logs.map((log, i) => (
                <div className="activity-row" key={i}>
                  <span className="status-dot" />
                  <div>
                    <strong>{log}</strong>
                    <small>Just now · Demo session</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="activity-empty">
                <ShieldCheck size={28} />
                <h3>No agent activity yet.</h3>
                <p>
                  Connect an assistant and try a question. You’ll see exactly
                  what it accessed.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="how-connects">
          <div className="settings-card">
            <span className="eyebrow">ONE PEOPLE BRAIN. MANY ASSISTANTS.</span>
            <h2>
              Your context travels.
              <br />
              <em>Your control stays.</em>
            </h2>
            <p>
              The intended integration is a permissioned MCP connection.
              ChatGPT’s app or connector surface, Claude, and other compatible
              agents can request the same grounded relationship summaries.
            </p>
            <div className="connection-steps">
              {[
                {
                  title: "Add Ignyte in your assistant",
                  body: "Find the future Ignyte app, or add its remote MCP connector. This prototype is not a published app.",
                },
                {
                  title: "Approve a clear scope",
                  body: "Sign in to Ignyte and allow read-only people summaries. Notes need a separate permission and per-note confirmation.",
                },
                {
                  title: "Ask in your own words",
                  body: "Your AI calls the relevant graph tool. Ignyte returns the people, evidence, and confidence behind its answer.",
                },
                {
                  title: "See every lookup. Revoke any time.",
                  body: "Activity appears in Ignyte. Hidden people stay hidden; raw email logs never leave the graph.",
                },
              ].map((s, i) => (
                <div key={s.title}>
                  <span>0{i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="tool-folder">
            <div className="tool-folder-header">
              <Folder size={23} />
              <strong>/people</strong>
              <Pill>MCP concept</Pill>
            </div>
            {[
              "search_people",
              "get_person",
              "who_do_i_know_at",
              "find_warm_paths",
              "recent_changes",
              "relationships_needing_attention",
              "prep_meeting",
              "add_note",
            ].map((t) => (
              <div className="tool-row" key={t}>
                <Terminal size={15} />
                <code>{t}</code>
                <small>
                  {t === "add_note" ? "CONFIRM FIRST" : "READ ONLY"}
                </small>
              </div>
            ))}
            <div className="tool-folder-note">
              <LockKeyhole size={17} />
              <p>
                Per-user permission. Revocable access. A private graph, never a
                shared address book.
              </p>
            </div>
          </div>
        </div>
      )}
      {permission && (
        <Dialog
          title={`Connect ${agent} to Ignyte`}
          onClose={() => setPermission(false)}
        >
          <div className="dialog-content">
            <div className="permission-icons">
              <Spark />
              <span>↔</span>
              <span className="agent-icon">
                {agent === "ChatGPT" ? "✺" : agent === "Claude" ? "✳" : "⌘"}
              </span>
            </div>
            <span className="eyebrow">YOU DECIDE WHAT COMES ALONG</span>
            <h2>
              Let {agent}
              <br />
              <em>know your people.</em>
            </h2>
            <p>
              Approve access to your sample people brain. This only connects the
              simulated conversation in this prototype.
            </p>
            <div className="permission-box">
              <strong>{agent} will be able to read</strong>
              <CheckRow>
                Names, professional profiles, and relationship summaries
              </CheckRow>
              <CheckRow>
                Warm paths, recent changes, and meeting context
              </CheckRow>
              <CheckRow>
                {privateNotes
                  ? "Personal notes, as enabled in your privacy settings"
                  : "No personal notes — currently excluded in your settings"}
              </CheckRow>
              <p>
                <LockKeyhole size={13} />
                Never raw email logs, email bodies, or hidden people.
              </p>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draftWrite}
                onChange={(e) => setDraftWrite(e.target.checked)}
              />
              <span>
                Allow adding notes, with my confirmation
                <small>Every note must be reviewed before it is saved.</small>
              </span>
            </label>
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  setApproved([...new Set([...approved, agent])]);
                  setWrites(
                    draftWrite
                      ? [...new Set([...writes, agent])]
                      : writes.filter((a) => a !== agent),
                  );
                  setPermission(false);
                  setLogs([
                    `${agent} · You approved ${draftWrite ? "read access and confirmed notes" : "read-only access"}`,
                    ...logs,
                  ]);
                  notify(`${agent} connected in this demo.`);
                }}
              >
                Allow demo connection
                <ArrowRight size={15} />
              </Button>
              <Button secondary onClick={() => setPermission(false)}>
                Not now
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
