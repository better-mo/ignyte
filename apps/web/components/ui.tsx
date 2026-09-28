"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  TrendingUp,
  Minus,
  TrendingDown,
  ArrowRight,
  Check,
} from "lucide-react";
import type { Person } from "../lib/demo";
export function Spark({ small = false }: { small?: boolean }) {
  return (
    <span className={`spark ${small ? "small" : ""}`} aria-hidden="true">
      ✳
    </span>
  );
}
export function Avatar({ p, size = 42 }: { p: Person; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      <span>
        {p.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      </span>
      <img
        src={`https://i.pravatar.cc/160?img=${p.photo}`}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}
export function Pill({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function Trend({ value }: { value: Person["trend"] }) {
  const Icon =
    value === "warming"
      ? TrendingUp
      : value === "cooling"
        ? TrendingDown
        : Minus;
  return (
    <span className={`trend ${value}`}>
      <Icon size={13} />
      {value}
    </span>
  );
}
export function SectionTitle({
  label,
  action,
  onClick,
}: {
  label: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{label}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`${secondary ? "button-secondary" : "button-primary"} ${className}`}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  body,
  action,
  onClick,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty">
      <Spark />
      <h2>{title}</h2>
      <p>{body}</p>
      <Button secondary onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
export function Dialog({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, textarea, select, [tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handle);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <button
          className="icon-button close-modal"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
export function CheckRow({ children }: { children: ReactNode }) {
  return (
    <div className="check-row">
      <Check size={16} />
      <span>{children}</span>
    </div>
  );
}
