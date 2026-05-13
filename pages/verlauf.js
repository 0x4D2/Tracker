import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" })
    .format(new Date(Number(year), Number(month) - 1, 1));
}

function groupByMonth(days) {
  const map = new Map();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(day);
  }
  return Array.from(map.entries());
}

export default function Verlauf() {
  const [days, setDays] = useState(null);
  const [error, setError] = useState("");
  const [activeMonth, setActiveMonth] = useState(null);

  useEffect(() => {
    fetch("/api/verlauf")
      .then((r) => r.json())
      .then((data) => {
        setDays(data);
        if (data.length > 0) setActiveMonth(data[0].date.slice(0, 7));
      })
      .catch(() => setError("Fehler beim Laden."));
  }, []);

  const groups = days ? groupByMonth(days) : [];
  const visibleDays = days
    ? days.filter((d) => d.date.slice(0, 7) === activeMonth)
    : [];

  return (
    <>
      <Head>
        <title>Verlauf — Tracker</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#060606" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23c9a84c' filter='url(%23g)'/%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='2' result='b'/%3E%3CfeMerge%3E%3CfeMergeNode in='b'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E" />
      </Head>

      <main className="page-shell">
        <div className="grain" />

        <header className="page-header">
          <h1>Verlauf</h1>
          <Link href="/" className="verlauf-back">← Zurück</Link>
        </header>

        {error && <p className="feedback error">{error}</p>}

        {days === null && !error && (
          <p className="empty-state" style={{ textAlign: "center", paddingTop: 32 }}>Laden…</p>
        )}

        {days !== null && days.length === 0 && (
          <p className="empty-state" style={{ paddingTop: 16 }}>Noch keine Einträge vorhanden.</p>
        )}

        {groups.length > 0 && (
          <>
            <nav className="month-nav">
              {groups.map(([monthKey]) => (
                <button
                  key={monthKey}
                  type="button"
                  className={`month-chip${activeMonth === monthKey ? " month-chip--active" : ""}`}
                  onClick={() => setActiveMonth(monthKey)}
                >
                  {formatMonthLabel(monthKey)}
                </button>
              ))}
            </nav>

            <div className="verlauf-list">
              {visibleDays.map((day) => (
                <article key={day.date} className="verlauf-day">
                  <div className="verlauf-day-header">
                    <h2 className="verlauf-date">{formatDate(day.date)}</h2>
                    {day.noteTime && (
                      <span className="verlauf-time">{day.noteTime}</span>
                    )}
                  </div>
                  {day.note ? (
                    <p className="verlauf-note">{day.note}</p>
                  ) : (
                    <p className="verlauf-note verlauf-note--empty">Keine Notiz.</p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
