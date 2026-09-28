"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Users,
  CalendarDays,
  Mail,
  ChevronLeft,
  Sparkles,
  LockKeyhole,
  X,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { Avatar, Button, CheckRow, Dialog, Pill, Spark } from "./ui";
import { person } from "../lib/demo";
import Constellation from "./Constellation";
export default function Onboarding({
  onClose,
  onFinish,
}: {
  onClose: () => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState(0);
  const [progress, setProgress] = useState(0);
  const [optional, setOptional] = useState<string[]>([]);
  const [account, setAccount] = useState(false);
  useEffect(() => {
    if (step !== 3) return;
    const timer = window.setInterval(
      () => setProgress((p) => Math.min(p + 1, 3)),
      650,
    );
    return () => clearInterval(timer);
  }, [step]);
  const scopes = [
    {
      icon: Users,
      title: "Start with familiar faces.",
      desc: "Your contacts give your people a name. We match duplicates and bring the familiar faces together.",
      read: "Names, email addresses, and contact details.",
      never: "We never contact anyone or change your address book.",
    },
    {
      icon: CalendarDays,
      title: "Remember who you make time for.",
      desc: "A one-to-one coffee says more than a hundred mailing lists. Your calendar helps find the relationships that matter.",
      read: "Event times, attendees, and meeting frequency.",
      never: "No calendar changes. No meeting recordings.",
    },
    {
      icon: Mail,
      title: "The connection. Not the conversation.",
      desc: "Email headers help us understand who you stay in touch with, how often, and whether it goes both ways.",
      read: "From, To, Cc, and Date headers only.",
      never: "Never email bodies, attachments, or message content.",
    },
  ];
  const S = scopes[scope];
  return (
    <Dialog title="Set up your people brain" wide onClose={onClose}>
      <div className="onboarding">
        <div className="onboarding-header">
          <span className="wordmark">
            <Spark />
            ignyte.
          </span>
          <Pill>Setup preview · No real sign-in</Pill>
        </div>
        <div className="onboarding-progress">
          {[
            "Welcome",
            "Your account",
            "Your permission",
            "First connections",
            "Make it yours",
          ].map((s, i) => (
            <span key={s} className={step >= i ? "current" : ""}>
              <i>{step > i ? <Check size={11} /> : i + 1}</i>
              <small>{s}</small>
            </span>
          ))}
        </div>
        {step === 0 ? (
          <div className="onboarding-split">
            <div>
              <span className="eyebrow">YOUR PEOPLE. YOUR POSSIBILITIES.</span>
              <h2>
                You already know
                <br />
                your next <em>opportunity.</em>
              </h2>
              <p>
                Bring your people together. Find your warmest way in. Give your
                AI the context that makes it yours.
              </p>
              <Button onClick={() => setStep(1)}>
                <span className="google-g">G</span>Continue with Google
                <ArrowRight size={16} />
              </Button>
              <span className="fine-print">
                <LockKeyhole size={12} />
                Private by default. Ready in about a minute.
              </span>
            </div>
            <div className="onboarding-art">
              <Constellation onPerson={() => {}} />
              <span className="handwritten">
                Your world is already
                <br />
                full of possibility.
              </span>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="onboarding-centered">
            <span className="eyebrow">LET’S MAKE THIS YOURS</span>
            <h2>
              A familiar place
              <br />
              to <em>begin.</em>
            </h2>
            <p>
              Choose the sample Google account to explore the full setup.
              <br />
              We won’t open Google or request access.
            </p>
            <button
              className={`account-choice ${account ? "selected" : ""}`}
              onClick={() => setAccount(true)}
            >
              <span className="self-avatar">AM</span>
              <span>
                <strong>Alex Morgan</strong>
                <small>alex@example.com</small>
              </span>
              {account ? <Check size={20} /> : <ArrowRight size={18} />}
            </button>
            <Button disabled={!account} onClick={() => setStep(2)}>
              Review what you share
              <ArrowRight size={16} />
            </Button>
            <p className="fine-print">
              Your real account and data stay untouched.
            </p>
          </div>
        ) : step === 2 ? (
          <div className="consent-layout">
            <div className="consent-index">
              {scopes.map((s, i) => (
                <button
                  className={
                    scope === i ? "selected" : scope > i ? "finished" : ""
                  }
                  key={s.title}
                  onClick={() => setScope(i)}
                >
                  <s.icon size={19} />
                  <span>{["Contacts", "Calendar", "Email headers"][i]}</span>
                  {scope > i && <Check size={15} />}
                </button>
              ))}
              <div>
                <ShieldCheck size={22} />
                <p>
                  A little context.
                  <br />A clear boundary.
                </p>
              </div>
            </div>
            <div className="consent-content">
              <span className="eyebrow">PERMISSION {scope + 1} OF 3</span>
              <h2>{S.title}</h2>
              <p>{S.desc}</p>
              <div className="consent-detail">
                <span>WHAT WE READ</span>
                <p>
                  <Check size={17} />
                  {S.read}
                </p>
              </div>
              <div className="consent-detail never">
                <span>WHAT STAYS PRIVATE</span>
                <p>
                  <LockKeyhole size={17} />
                  {S.never}
                </p>
              </div>
              <Button
                onClick={() => (scope < 2 ? setScope(scope + 1) : setStep(3))}
              >
                {scope === 2
                  ? "Build my sample world"
                  : "Allow in demo & continue"}
                <ArrowRight size={16} />
              </Button>
              <span className="fine-print">
                A consent design preview. Revoke any source later.
              </span>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="onboarding-centered building-world">
            <div className="building-symbol">
              <Spark />
            </div>
            <span className="eyebrow">A FEW DOTS. A WHOLE WORLD.</span>
            <h2>
              {progress < 3 ? (
                <>
                  Finding your
                  <br />
                  <em>familiar faces.</em>
                </>
              ) : (
                <>
                  Look who was
                  <br />
                  <em>here all along.</em>
                </>
              )}
            </h2>
            <div className="build-steps">
              {[
                "Found 1,240 sample contacts",
                "Brought duplicates together",
                "Your closest 50, with context",
              ].map((s, i) => (
                <div key={s} className={progress >= i + 1 ? "ready" : ""}>
                  {progress >= i + 1 ? (
                    <Check size={17} />
                  ) : (
                    <LoaderCircle
                      className={progress === i ? "spin" : ""}
                      size={17}
                    />
                  )}
                  <span>{s}</span>
                </div>
              ))}
            </div>
            {progress >= 1 && (
              <div className="first-faces">
                {["priya", "sara", "daniel", "maya"]
                  .slice(0, progress + 1)
                  .map((id) => (
                    <div key={id}>
                      <Avatar p={person(id)} size={50} />
                      <small>{person(id).name.split(" ")[0]}</small>
                    </div>
                  ))}
              </div>
            )}
            {progress >= 3 ? (
              <>
                <div className="first-aha">
                  <Link2 size={20} />
                  <p>
                    <strong>You’re one introduction from Shopify.</strong>
                    <span>
                      Sara knows Daniel, their Design Director. You two catch up
                      every month.
                    </span>
                  </p>
                </div>
                <Button onClick={() => setStep(4)}>
                  See what’s possible
                  <ArrowRight size={16} />
                </Button>
              </>
            ) : (
              <p className="fine-print">
                Your first people appear while the rest comes together.
              </p>
            )}
          </div>
        ) : (
          <div className="onboarding-finish">
            <span className="eyebrow">YOUR FIRST CHAPTER IS READY</span>
            <h2>
              A little more context.
              <br />
              <em>A lot more possibility.</em>
            </h2>
            <p>
              You already have a warm path into Shopify and three good reasons
              to reach out. Add another source whenever you’re ready.
            </p>
            <div className="onboarding-additions">
              {[
                {
                  id: "linkedin",
                  name: "LinkedIn",
                  text: "See where your people are now.",
                  icon: "in",
                },
                {
                  id: "phone",
                  name: "Phone contacts",
                  text: "Rediscover the people in your pocket.",
                  icon: "⌘",
                },
                {
                  id: "ai",
                  name: "Your AI",
                  text: "Take your people brain into ChatGPT.",
                  icon: "✳",
                },
              ].map((s) => (
                <button
                  key={s.id}
                  className={optional.includes(s.id) ? "selected" : ""}
                  onClick={() =>
                    setOptional(
                      optional.includes(s.id)
                        ? optional.filter((id) => id !== s.id)
                        : [...optional, s.id],
                    )
                  }
                >
                  <span className="source-logo">{s.icon}</span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.text}</small>
                  </span>
                  {optional.includes(s.id) ? (
                    <Check size={18} />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </button>
              ))}
            </div>
            {optional.length > 0 && (
              <p className="fine-print">
                Added to your setup wishlist. Explore these connections from
                your world.
              </p>
            )}
            <Button onClick={onFinish}>
              Step into my world
              <ArrowRight size={17} />
            </Button>
            <span className="fine-print">
              You’re in control. Everything else can wait.
            </span>
          </div>
        )}
        {step > 0 && step !== 3 && (
          <button
            className="text-button onboarding-back"
            onClick={() => setStep(step - 1)}
          >
            <ChevronLeft size={14} />
            Back
          </button>
        )}
      </div>
    </Dialog>
  );
}
