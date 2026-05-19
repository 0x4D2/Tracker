import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildDayDetail, buildMonthlyRadar, buildRiskForecast, buildStatsSnapshot, buildTrendWindow, buildWeekReview } from "../lib/insights";

const INITIAL_STATE = {
  habits: { new: [], old: [] },
  totals: {},
  recentEntries: [],
  weekData: [],
  historyDays: [],
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

function formatDetailDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

export default function Statistik() {
  const [state, setState] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDay, setActiveDay] = useState(null);
  const [starHistory, setStarHistory] = useState({});

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/state").then((r) => r.json().then((p) => ({ ok: r.ok, payload: p }))),
      fetch("/api/stars/history?days=30").then((r) => r.ok ? r.json() : {}),
    ])
      .then(([{ ok, payload }, history]) => {
        if (!active) return;
        if (!ok) throw new Error(payload.message || "Fehler beim Laden.");
        setState(payload);
        setStarHistory(history);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Fehler beim Laden.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const snapshot = buildStatsSnapshot(state);
  const review = buildWeekReview(state.weekData);
  const trendDays = buildTrendWindow(state.historyDays);
  const riskForecast = buildRiskForecast(state.historyDays);
  const monthlyRadar = buildMonthlyRadar(state.historyDays);
  const monthlySeries = monthlyRadar.series;
  const currentMonthSeries = monthlySeries[monthlySeries.length - 1] || null;
  const previousMonthSeries = monthlySeries.length > 1 ? monthlySeries[0] : null;
  const selectedDay = trendDays.find((day) => day.date === activeDay) || trendDays[trendDays.length - 1] || null;
  const detail = buildDayDetail(selectedDay, state.habits);
  const maxVolume = Math.max(
    ...review.days.map((day, index) => Math.max(day.new, day.old, review.previousDays[index]?.new || 0, review.previousDays[index]?.old || 0, 1)),
    1
  );

  useEffect(() => {
    if (!trendDays.length || activeDay) {
      return;
    }

    const defaultDay = [...trendDays].reverse().find((day) => day.total > 0 || day.note) || trendDays[trendDays.length - 1];
    setActiveDay(defaultDay?.date || null);
  }, [trendDays, activeDay]);

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

              <div className={`week-compare week-compare--${review.comparison.tone}`} aria-label="Vergleich zur Vorwoche">
                <div>
                  <p className="week-compare__title">{review.comparison.title}</p>
                  <p className="week-compare__text">{review.comparison.text}</p>
                </div>
                <div className="week-compare__chips">
                  <article className={`week-compare-chip week-compare-chip--${review.comparison.tone}`}>
                    <span className="week-compare-chip__label">Saldo</span>
                    <span className="week-compare-chip__value">{review.comparison.hasPrevious ? (review.comparison.netDelta > 0 ? `+${review.comparison.netDelta}` : review.comparison.netDelta) : "offen"}</span>
                  </article>
                  <article className={`week-compare-chip week-compare-chip--${review.comparison.buildDelta >= 0 ? "gold" : "red"}`}>
                    <span className="week-compare-chip__label">Aufbau</span>
                    <span className="week-compare-chip__value">{review.comparison.hasPrevious ? (review.comparison.buildDelta > 0 ? `+${review.comparison.buildDelta}` : review.comparison.buildDelta) : "offen"}</span>
                  </article>
                  <article className={`week-compare-chip week-compare-chip--${review.comparison.oldDelta <= 0 ? "gold" : "red"}`}>
                    <span className="week-compare-chip__label">Rückfall</span>
                    <span className="week-compare-chip__value">{review.comparison.hasPrevious ? (review.comparison.oldDelta > 0 ? `+${review.comparison.oldDelta}` : review.comparison.oldDelta) : "offen"}</span>
                  </article>
                </div>
              </div>

              <div className="week-chart" aria-label="Einträge der letzten sieben Tage">
                {review.days.map((day, index) => {
                  const previousDay = review.previousDays[index];
                  const newHeight = `${Math.max((day.new / maxVolume) * 100, day.new > 0 ? 8 : 0)}%`;
                  const oldHeight = `${Math.max((day.old / maxVolume) * 100, day.old > 0 ? 8 : 0)}%`;
                  const previousNewHeight = `${Math.max(((previousDay?.new || 0) / maxVolume) * 100, previousDay?.new > 0 ? 8 : 0)}%`;
                  const previousOldHeight = `${Math.max(((previousDay?.old || 0) / maxVolume) * 100, previousDay?.old > 0 ? 8 : 0)}%`;

                  return (
                    <button key={day.date} type="button" className={`week-day${activeDay === day.date ? " week-day--active" : ""}`} onClick={() => setActiveDay(day.date)}>
                      <div className="week-bar-stack">
                        <div className="week-bar-track week-bar-track--up">
                          {previousDay ? <span className="week-bar week-bar--ghost-new" style={{ height: previousNewHeight }} /> : null}
                          <span className="week-bar week-bar--new" style={{ height: newHeight }} />
                        </div>
                        <div className="week-bar-track week-bar-track--down">
                          {previousDay ? <span className="week-bar week-bar--ghost-old" style={{ height: previousOldHeight }} /> : null}
                          <span className="week-bar week-bar--old" style={{ height: oldHeight }} />
                        </div>
                      </div>
                      <span className={`week-net week-net--${day.net > 0 ? "gold" : day.net < 0 ? "red" : "neutral"}`}>
                        {day.net > 0 ? `+${day.net}` : day.net}
                      </span>
                      <span className="week-day-label">{day.label}</span>
                    </button>
                  );
                })}
              </div>

            </section>

            <section className="trend-card" aria-labelledby="trend-card-title">
              <div className="stats-panel__head">
                <p className="week-kicker">Verlauf 30 Tage</p>
                <h2 id="trend-card-title" className="stats-panel__title">Heatline und Tages-Drilldown</h2>
              </div>

              <div className="trend-strip" aria-label="30-Tage-Heatline">
                {trendDays.map((day) => {
                  const dayStars = starHistory[day.date] || [];
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={`trend-cell trend-cell--${day.tone} trend-cell--level-${day.level}${activeDay === day.date ? " trend-cell--active" : ""}`}
                      onClick={() => setActiveDay(day.date)}
                      aria-label={`${day.date}: ${day.new} Aufbau, ${day.old} Rückfall${day.note ? ", mit Notiz" : ""}${dayStars.length ? `, ${dayStars.length} Stern${dayStars.length > 1 ? "e" : ""}` : ""}`}
                      title={`${day.date}: ${day.new} Aufbau, ${day.old} Rückfall${dayStars.length ? ` · ★ ${dayStars.join(" ")}` : ""}`}
                    >
                      <span className="trend-cell__day">{day.shortLabel}</span>
                      {dayStars.length > 0 && (
                        <span className="trend-cell__stars" aria-hidden="true">
                          {"★".repeat(dayStars.length)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {detail ? (
                <article className={`trend-detail trend-detail--${detail.tone}`}>
                  <div className="trend-detail__head">
                    <div>
                      <p className="week-kicker">Ausgewählter Tag</p>
                      <h3 className="trend-detail__title">{formatDetailDate(detail.date)}</h3>
                      <p className="trend-detail__lead">{detail.headline}</p>
                    </div>
                    <div className="trend-detail__score">
                      <span className="trend-detail__score-label">Score</span>
                      <span className="trend-detail__score-value">{formatScoreValue(detail.score.score)}</span>
                    </div>
                  </div>

                  <div className="trend-detail__stats">
                    <article className="trend-stat">
                      <span className="trend-stat__label">Aufbau</span>
                      <span className="trend-stat__value">{detail.new}</span>
                    </article>
                    <article className="trend-stat">
                      <span className="trend-stat__label">Rückfall</span>
                      <span className="trend-stat__value">{detail.old}</span>
                    </article>
                    <article className="trend-stat">
                      <span className="trend-stat__label">Einträge</span>
                      <span className="trend-stat__value">{detail.total}</span>
                    </article>
                  </div>

                  {(starHistory[detail.date] || []).length > 0 && (
                    <div className="trend-detail__stars">
                      {(starHistory[detail.date] || []).map((n) => (
                        <span key={n} className="trend-detail__star" title={`Stern ${n} vollständig`}>★</span>
                      ))}
                    </div>
                  )}

                  {detail.note ? <p className="trend-detail__note">{detail.note}</p> : null}

                  <div className="trend-detail__entries">
                    {!detail.groupedEntries.length ? (
                      <p className="empty-state">Keine Einträge an diesem Tag.</p>
                    ) : (
                      detail.groupedEntries.map((entry) => (
                        <article key={`${detail.date}-${entry.type}-${entry.label}`} className={`trend-entry trend-entry--${entry.type}`}>
                          <span className="trend-entry__label">{entry.label}</span>
                          <span className="trend-entry__meta">{entry.count}×{entry.time ? ` · ${entry.time}` : ""}</span>
                        </article>
                      ))
                    )}
                  </div>
                </article>
              ) : null}
            </section>

            <section className="stats-panels stats-panels--advanced">
              <article className={`stats-panel stats-panel--risk stats-panel--${riskForecast.tone}`}>
                <div className="stats-panel__head">
                  <p className="week-kicker">Prognose</p>
                  <h2 className="stats-panel__title">Risikodruck der nächsten Tage</h2>
                </div>

                <p className="risk-title">{riskForecast.title}</p>
                <p className="risk-lead">{riskForecast.lead}</p>

                <div className="risk-chips">
                  {riskForecast.chips.map((chip) => (
                    <article key={chip.label} className={`risk-chip risk-chip--${chip.tone}`}>
                      <span className="risk-chip__label">{chip.label}</span>
                      <span className="risk-chip__value">{chip.value}</span>
                    </article>
                  ))}
                </div>

                <div className="risk-signals">
                  {riskForecast.signals.map((signal) => (
                    <article key={signal} className="risk-signal">
                      <span className="risk-signal__text">{signal}</span>
                    </article>
                  ))}
                </div>
              </article>

              <article className="stats-panel stats-panel--radar">
                <div className="stats-panel__head">
                  <p className="week-kicker">Monatsbild</p>
                  <h2 className="stats-panel__title">Monatsvergleich</h2>
                </div>

                <div className="line-chart-card">
                  <div className="line-chart__legend" aria-label="Monate">
                    {monthlySeries.map((series) => (
                      <article key={series.label} className={`line-chart__legend-item line-chart__legend-item--${series.tone}`}>
                        <span className="line-chart__legend-swatch" />
                        <span className="line-chart__legend-label">{series.label}</span>
                      </article>
                    ))}
                  </div>

                  <div className="month-pillars" aria-label="Monatsvergleich je Bereich">
                    {monthlyRadar.axes.map((axis, index) => {
                      const currentValue = currentMonthSeries?.values[index] || 0;
                      const previousValue = previousMonthSeries ? previousMonthSeries.values[index] || 0 : null;
                      const currentTop = `${100 - currentValue}%`;
                      const previousTop = previousValue === null ? null : `${100 - previousValue}%`;
                      const deltaTone = previousValue === null
                        ? "gold"
                        : currentValue > previousValue
                        ? "green"
                        : currentValue < previousValue
                        ? "red"
                        : "gold";
                      const rangeTop = previousValue === null ? null : `${100 - Math.max(currentValue, previousValue)}%`;
                      const rangeHeight = previousValue === null ? null : `${Math.max(Math.abs(currentValue - previousValue), 2)}%`;

                      return (
                        <article key={axis.key} className="month-pillar">
                          <div className="month-pillar__values">
                            {previousValue !== null ? <span className="month-pillar__value month-pillar__value--previous">{previousValue}</span> : null}
                            <span className={`month-pillar__value month-pillar__value--${currentMonthSeries?.tone || "gold"}`}>{currentValue}</span>
                          </div>

                          <div className="month-pillar__track">
                            <span className="month-pillar__rail" />
                            {previousValue !== null ? (
                              <span
                                className={`month-pillar__range month-pillar__range--${deltaTone}`}
                                style={{ top: rangeTop, height: rangeHeight }}
                              />
                            ) : null}
                            {previousValue !== null ? (
                              <span className="month-pillar__dot month-pillar__dot--previous" style={{ top: previousTop }} />
                            ) : null}
                            <span
                              className={`month-pillar__dot month-pillar__dot--${currentMonthSeries?.tone || "gold"}`}
                              style={{ top: currentTop }}
                            />
                          </div>

                          <span className="month-pillar__label">{axis.label}</span>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </article>
            </section>

          </>
        )}
      </main>
    </>
  );
}