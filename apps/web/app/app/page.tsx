import type { Metadata } from "next";
import Ignyte from "../../components/Ignyte";
export const metadata: Metadata = { title: "Your world — Ignyte demo" };
export default function AppPage() {
  return <Ignyte />;
}
