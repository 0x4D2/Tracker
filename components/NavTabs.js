import Link from "next/link";
import { useRouter } from "next/router";

const TABS = [
  { href: "/", label: "Tracker" },
  { href: "/statistik", label: "Statistik" },
  { href: "/verlauf", label: "Verlauf" },
];

export default function NavTabs() {
  const { pathname } = useRouter();

  return (
    <nav className="nav-tabs" aria-label="Navigation">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`nav-tab${pathname === tab.href ? " nav-tab--active" : ""}`}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
