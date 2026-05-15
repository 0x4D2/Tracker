import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildStatsSnapshot, buildWeekReview } from "../lib/insights";

const INITIAL_STATE = {
  habits: { new: [], old: [] },
  totals: {},
  recentEntries: [],
  weekData: [],
  score: { score: 0, breakdown: [], werktag: true, kategorie: "neutral", akquiseCount: 0 },
  callStreak: 0,
  stats: {
    daysLeft: 365,
    daysTotal: 365,
    streak: 0,
    direction: { symbol: "—", tone: "dim", text: "noch keine Daten" },
  },
};

function formatScoreValue(score) {
  return score > 0 ? `+${score}` : `${score}`;
}

function formatRecentTimestamp(date, time) {
  if (!date) {
    return time || "";
  }

  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}${time ? ` · ${time}` : ""}`;
}

function scorePointColor(points) {
  return points >= 0 ? "#f0d080" : "#cc4444";
}

export default function Statistik() {
  const [state, setState] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/state")
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!active) {
          return;
        }

        if (!ok) {
          throw new Error(payload.message || "Fehler beim Laden.");
        }

        setState(payload);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Fehler beim Laden.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const snapshot = buildStatsSnapshot(state);
  const review = buildWeekReview(state.weekData);
  const maxVolume = Math.max(...review.days.map((day) => Math.max(day.new, day.old, 1)), 1);

  return (
    <>
      <Head>
        <title>Statistik — Tracker</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#060606" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23c9a84c' filter='url(%23g)'/%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='2' result='b'/%3E%3CfeMerge%3E%3CfeMergeNode in='b'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E" />
      </Head>

      <main className="page-shell">
        <div className="grain" />

        <header className="page-header">
          <h1>Statistik</h1>
          <Link href="/" className="verlauf-back">← Zurück</Link>
        </header>

        {error ? <p className="feedback error">{error}</p> : null}

        {loading && !error ? (
          <p className="empty-state" style={{ textAlign: "center", paddingTop: 24 }}>Laden…</p>
        ) : (
          <>
            <section className="stats-hero">
              <div>
                <p className="week-kicker">Lagebild</p>
                <h2 className="stats-hero__title">Gesamtbild und Wochenausblick</h2>
                <p className="stats-hero__lead">{snapshot.lead}</p>
              </div>

              <div className={`stats-hero__score stats-hero__score--${state.stats.direction.tone}`}>
                <span className="stats-hero__score-label">Richtung</span>
                <span className="stats-hero__score-value">{state.stats.direction.symbol}</span>
                <span className="stats-hero__score-meta">{state.stats.direction.text}</span>
              </div>
            </section>

            <section className="stats-grid" aria-label="Statistikübersicht">
              {snapshot.cards.map((card) => (
                <article key={card.label} className={`stats-card stats-card--${card.tone}`}>
                  <span className="stats-card__label">{card.label}</span>
                  <strong className="stats-card__value">{card.value}</strong>
                  <span className="stats-card__meta">{card.meta}</span>
                </article>
              ))}
            </section>

            <section className="week-card" aria-labelledby="week-card-title">
              <div className="week-card-head">
                <div>
                  <p className="week-kicker">Rückblick der Woche</p>
                  <h2 id="week-card-title" className={`week-title week-title--${review.verdict.tone}`}>{review.verdict.title}</h2>
                </div>
                <div className="week-summary-badge">
                  <span className="week-summary-badge__value">{review.activeDays}/7</span>
                  <span className="week-summary-badge__label">aktive Tage</span>
                </div>
              </div>

              <p className="week-lead">{review.verdict.text}</p>

              <div className="week-chart" aria-label="Einträge der letzten sieben Tage">
                {review.days.map((day) => {
                  const newHeight = `${Math.max((day.new / maxVolume) * 100, day.new > 0 ? 8 : 0)}%`;
                  const oldHeight = `${Math.max((day.old / maxVolume) * 100, day.old > 0 ? 8 : 0)}%`;

                  return (
                    <article key={day.date} className="week-day">
                      <div className="week-bar-stack">
                        <div className="week-bar-track week-bar-track--up">
                          <span className="week-bar week-bar--new" style={{ height: newHeight }} />
                        </div>
                        <div className="week-bar-track week-bar-track--down">
                          <span className="week-bar week-bar--old" style={{ height: oldHeight }} />
                        </div>
                      </div>
                      <span className={`week-net week-net--${day.net > 0 ? "gold" : day.net < 0 ? "red" : "neutral"}`}>
                        {day.net > 0 ? `+${day.net}` : day.net}
                      </span>
                      <span className="week-day-label">{day.label}</span>
                    </article>
                  );
                })}
              </div>

              <div className="week-meters" aria-label="Wochenbilanz">
                <div className="week-meter week-meter--new">
                  <span className="week-meter__label">Aufbau</span>
                  <span className="week-meter__value">{review.totalNew}</span>
                </div>
                <div className="week-meter week-meter--old">
                  <span className="week-meter__label">Rückfall</span>
                  <span className="week-meter__value">{review.totalOld}</span>
                </div>
              </div>

              <div className="week-insights">
                {review.insights.map((item) => (
                  <article key={item.label} className={`week-insight week-insight--${item.tone}`}>
                    <span className="week-insight__label">{item.label}</span>
                    <span className="week-insight__value">{item.value}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="stats-panels">
              <article className="stats-panel">
                <div className="stats-panel__head">
                  <p className="week-kicker">Schlüsselstellen</p>
                  <h2 className="stats-panel__title">Was gerade wirkt</h2>
                </div>
                <div className="stats-highlights">
                  {snapshot.highlights.map((item) => (
                    <article key={item.label} className={`stats-highlight stats-highlight--${item.tone}`}>
                      <span className="stats-highlight__label">{item.label}</span>
                      <span className="stats-highlight__value">{item.value}</span>
                    </article>
                  ))}
                </div>
              </article>

              <article className="stats-panel">
                <div className="stats-panel__head">
                  <p className="week-kicker">Live-Bild</p>
                  <h2 className="stats-panel__title">Jüngste Einträge</h2>
                </div>
                {!state.recentEntries.length ? (
                  <p className="empty-state">Noch keine Einträge vorhanden.</p>
                ) : (
                  <div className="stats-feed">
                    {state.recentEntries.slice(0, 8).map((entry) => (
                      <article key={entry.id} className={`stats-feed-item stats-feed-item--${entry.type}`}>
                        <span className="stats-feed-item__label">{entry.label}</span>
                        <span className="stats-feed-item__meta">{formatRecentTimestamp(entry.date, entry.time)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="stats-panel stats-panel--score">
              <div className="stats-panel__head">
                <p className="week-kicker">Punkte</p>
                <h2 className="stats-panel__title">Tages-Score im Detail</h2>
              </div>

              <div className="stats-score-head">
                <span className="stats-score-head__label">Heute</span>
                <span className="stats-score-head__value">{formatScoreValue(state.score.score)}</span>
                <span className="stats-score-head__meta">{state.score.werktag ? "Werktag" : "Wochenende"}</span>
              </div>

              {state.score.breakdown.length > 0 ? (
                <div className="score-breakdown score-breakdown--static">
                  {state.score.breakdown.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="score-row">
                      <span className="score-row-label">{item.label}</span>
                      <span className="score-row-cat">{item.category}</span>
                      <span className="score-row-pts" style={{ color: scorePointColor(item.points) }}>{item.points > 0 ? `+${item.points}` : item.points}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">Heute gibt es noch keine Score-Beiträge.</p>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}