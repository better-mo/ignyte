"use client";
import { people } from "../lib/demo";
import { Avatar, Spark } from "./ui";
const points = [
  [50, 15],
  [77, 29],
  [82, 62],
  [65, 85],
  [32, 81],
  [15, 55],
  [25, 23],
  [48, 64],
  [59, 36],
  [35, 44],
  [92, 43],
  [9, 79],
];
export default function Constellation({
  large = false,
  onPerson,
  stage = 1,
}: {
  large?: boolean;
  onPerson: (id: string) => void;
  stage?: number;
}) {
  return (
    <div className={`constellation ${large ? "large" : ""}`}>
      <svg viewBox="0 0 400 340" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="200" cy="170" rx="143" ry="121" />
        <ellipse cx="200" cy="170" rx="94" ry="78" />
        <ellipse cx="200" cy="170" rx="185" ry="154" />
        {points.slice(0, stage === 0 ? 7 : 12).map(([x, y], i) => (
          <path
            key={i}
            d={`M200 170 Q${(x * 4 + 200) / 2 + 25} ${y * 3.4} ${x * 4} ${y * 3.4}`}
            className={i < 3 ? "strong-line" : ""}
          />
        ))}
      </svg>
      <span className="graph-center">
        <Spark small />
        <span>you</span>
      </span>
      {points.slice(0, stage === 0 ? 7 : 12).map(([x, y], i) => (
        <button
          key={i}
          className={`graph-person graph-person-${i}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={() => onPerson(people[i].id)}
          aria-label={`View ${people[i].name}`}
        >
          <Avatar p={people[i]} size={large ? 58 : i < 3 ? 44 : 34} />
          <span className="graph-label">{people[i].name.split(" ")[0]}</span>
        </button>
      ))}
      <span className="graph-dot d1" />
      <span className="graph-dot d2" />
      <span className="graph-dot d3" />
    </div>
  );
}
