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

function summarizeEntries(entries = []) {
  const grouped = new Map();

  for (const entry of entries) {
    const key = `${entry.type}:${entry.label}`;
    if (!grouped.has(key)) {
      grouped.set(key, { ...entry, count: 0 });
    }
    grouped.get(key).count += 1;
  }

  return Array.from(grouped.values());
}

function buildMonthHeatmap(monthKey, days) {
  if (!monthKey) {
    return { cells: [], summary: { totalNew: 0, totalOld: 0, activeDays: 0 } };
  }

  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const byDate = new Map(
    days.map((day) => {
      const entries = day.entries || [];
      const newCount = entries.filter((entry) => entry.type === "new").length;
      const oldCount = entries.filter((entry) => entry.type === "old").length;
      return [day.date, { ...day, newCount, oldCount, total: newCount + oldCount }];
    })
  );

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const cells = [];

  for (let index = 0; index < offset; index += 1) {
    cells.push({ type: "empty", key: `empty-${index}` });
  }

  for (let dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
    const dateKey = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
    const day = byDate.get(dateKey);
    const newCount = day?.newCount || 0;
    const oldCount = day?.oldCount || 0;
    const total = newCount + oldCount;
    const net = newCount - oldCount;
    const level = total >= 5 ? 4 : total >= 3 ? 3 : total >= 1 ? 2 : day?.note ? 1 : 0;
    const tone = total === 0
      ? day?.note
        ? "note"
        : "empty"
      : net > 0
      ? "gold"
      : net < 0
      ? "red"
      : "mixed";

    cells.push({
      type: "day",
      key: dateKey,
      date: dateKey,
      dayNumber,
      newCount,
      oldCount,
      total,
      level,
      tone,
      note: Boolean(day?.note),
      isToday: dateKey === todayKey,
    });
  }

  const summary = days.reduce(
    (accumulator, day) => {
      const entries = day.entries || [];
      const newCount = entries.filter((entry) => entry.type === "new").length;
      const oldCount = entries.filter((entry) => entry.type === "old").length;
      accumulator.totalNew += newCount;
      accumulator.totalOld += oldCount;
      if (newCount || oldCount || day.note) {
        accumulator.activeDays += 1;
      }
      return accumulator;
    },
    { totalNew: 0, totalOld: 0, activeDays: 0 }
  );

  return { cells, summary };
}

export default function Verlauf() {
  const [days, setDays] = useState(null);
  const [error, setError] = useState("");
  const [activeMonth, setActiveMonth] = useState(null);
  const [heatmapOpen, setHeatmapOpen] = useState(false);

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
  const heatmap = buildMonthHeatmap(activeMonth, visibleDays);

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

            <section className="heatmap-card" aria-labelledby="heatmap-title">
              <div className="heatmap-head" onClick={() => setHeatmapOpen((o) => !o)} style={{ cursor: "pointer" }}>
                <div>
                  <p className="week-kicker">Monatskarte</p>
                  <h2 id="heatmap-title" className="heatmap-title">Kalenderraster {heatmapOpen ? "▲" : "▼"}</h2>
                </div>
                <div className="heatmap-summary">
                  <span className="heatmap-summary__value">{heatmap.summary.activeDays}</span>
                  <span className="heatmap-summary__label">aktive Tage</span>
                </div>
              </div>

              {heatmapOpen && (
                <>
                  <div className="heatmap-legend" aria-label="Legende">
                    <span className="heatmap-legend__item"><span className="heatmap-dot heatmap-dot--gold" /> Aufbau</span>
                    <span className="heatmap-legend__item"><span className="heatmap-dot heatmap-dot--red" /> Rückfall</span>
                    <span className="heatmap-legend__item"><span className="heatmap-dot heatmap-dot--mixed" /> Gemischt</span>
                    <span className="heatmap-legend__item"><span className="heatmap-dot heatmap-dot--note" /> Nur Notiz</span>
                  </div>

                  <div className="heatmap-grid-wrap">
                    <div className="heatmap-weekdays" aria-hidden="true">
                      {['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'].map((label) => (
                        <span key={label} className="heatmap-weekday">{label}</span>
                      ))}
                    </div>
                    <div className="heatmap-grid" aria-label="Monats-Heatmap">
                      {heatmap.cells.map((cell) => {
                        if (cell.type === "empty") {
                          return <span key={cell.key} className="heatmap-cell heatmap-cell--empty" aria-hidden="true" />;
                        }
                        const title = cell.total > 0
                          ? `${cell.date}: ${cell.newCount} Aufbau, ${cell.oldCount} Rückfall${cell.note ? ", mit Notiz" : ""}`
                          : cell.note ? `${cell.date}: Notiz ohne Eintrag` : `${cell.date}: leer`;
                        return (
                          <article
                            key={cell.key}
                            className={`heatmap-cell heatmap-cell--${cell.tone} heatmap-cell--level-${cell.level}${cell.isToday ? " heatmap-cell--today" : ""}`}
                            title={title}
                            aria-label={title}
                          >
                            <span className="heatmap-cell__day">{cell.dayNumber}</span>
                            {cell.total > 0 ? <span className="heatmap-cell__meta">{cell.total}</span> : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="heatmap-meters" aria-label="Monatsbilanz">
                    <div className="heatmap-meter heatmap-meter--gold">
                      <span className="heatmap-meter__label">Aufbau</span>
                      <span className="heatmap-meter__value">{heatmap.summary.totalNew}</span>
                    </div>
                    <div className="heatmap-meter heatmap-meter--red">
                      <span className="heatmap-meter__label">Rückfall</span>
                      <span className="heatmap-meter__value">{heatmap.summary.totalOld}</span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <div className="verlauf-list">
              {visibleDays.map((day) => {
                const dayEntries = summarizeEntries(day.entries);

                return (
                  <article key={day.date} className="verlauf-day">
                    <div className="verlauf-day-header">
                      <h2 className="verlauf-date">{formatDate(day.date)}</h2>
                      {day.noteTime && (
                        <span className="verlauf-time">{day.noteTime}</span>
                      )}
                    </div>
                    {dayEntries.length > 0 && (
                      <div className="verlauf-entries" aria-label="Einträge des Tages">
                        {dayEntries.map((entry) => (
                          <span key={`${entry.type}-${entry.label}`} className={`verlauf-entry-tag ${entry.type}`}>
                            {entry.label}
                            {entry.count > 1 ? ` ×${entry.count}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {day.note ? (
                      <p className="verlauf-note">{day.note}</p>
                    ) : (
                      <p className="verlauf-note verlauf-note--empty">Keine Notiz.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
