import { berechneScore } from "./scoring.js";

export function formatWeekdayShort(dateStr) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short" })
    .format(new Date(`${dateStr}T12:00:00`))
    .replace(".", "")
    .slice(0, 2)
    .toUpperCase();
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function weekdayName(dateStr) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${dateStr}T12:00:00`));
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

function summarizeWeek(days) {
  const totalNew = days.reduce((sum, day) => sum + day.new, 0);
  const totalOld = days.reduce((sum, day) => sum + day.old, 0);
  const activeDays = days.filter((day) => day.total > 0).length;
  const cleanDays = days.filter((day) => day.new > 0 && day.old === 0).length;
  const dominantNewDays = days.filter((day) => day.net > 0).length;
  const dominantOldDays = days.filter((day) => day.net < 0).length;
  const strongestDay = days.reduce(
    (best, day) => (day.net > best.net || (day.net === best.net && day.new > best.new) ? day : best),
    days[0] || { label: "--", net: 0, new: 0, old: 0, total: 0 }
  );
  const heaviestDay = days.reduce(
    (worst, day) => (day.old > worst.old || (day.old === worst.old && day.net < worst.net) ? day : worst),
    days[0] || { label: "--", net: 0, new: 0, old: 0, total: 0 }
  );

  return {
    totalNew,
    totalOld,
    total: totalNew + totalOld,
    net: totalNew - totalOld,
    activeDays,
    cleanDays,
    dominantNewDays,
    dominantOldDays,
    strongestDay,
    heaviestDay,
    momentum:
      days.slice(-3).reduce((sum, day) => sum + day.net, 0) -
      days.slice(0, 3).reduce((sum, day) => sum + day.net, 0),
  };
}

function buildWeekComparison(current, previous) {
  if (!previous.length) {
    return {
      hasPrevious: false,
      tone: "neutral",
      title: "Noch keine Vorwoche vorhanden",
      text: "Sobald 14 Tage im Verlauf liegen, wird der direkte Wochenvergleich sichtbar.",
      netDelta: 0,
      buildDelta: 0,
      oldDelta: 0,
      activeDelta: 0,
    };
  }

  const currentSummary = summarizeWeek(current);
  const previousSummary = summarizeWeek(previous);
  const netDelta = currentSummary.net - previousSummary.net;
  const buildDelta = currentSummary.totalNew - previousSummary.totalNew;
  const oldDelta = currentSummary.totalOld - previousSummary.totalOld;
  const activeDelta = currentSummary.activeDays - previousSummary.activeDays;
  const tone = netDelta > 0 ? "gold" : netDelta < 0 ? "red" : "neutral";

  let title = "Seitwärts zur Vorwoche";
  let text = "Die Woche liegt nahe an der letzten. Entscheidend wird, wohin die letzten Tage kippen.";

  if (netDelta >= 2) {
    title = `${formatSigned(netDelta)} besser als letzte Woche`;
    text = "Aufbau trägt stärker oder Rückfall wurde im Vergleich zur Vorwoche sauberer gedrückt.";
  } else if (netDelta <= -2) {
    title = `${formatSigned(netDelta)} schlechter als letzte Woche`;
    text = "Der Wochenkörper verliert gegenüber der Vorwoche an Zug oder lässt mehr altes Muster hinein.";
  }

  return {
    hasPrevious: true,
    tone,
    title,
    text,
    netDelta,
    buildDelta,
    oldDelta,
    activeDelta,
  };
}

export function buildWeekReview(weekData = []) {
  const normalizedDays = weekData.map((day) => ({
    ...day,
    label: formatWeekdayShort(day.date),
    net: day.new - day.old,
    total: day.new + day.old,
  }));

  const days = normalizedDays.slice(-7);
  const previousDays = normalizedDays.slice(-14, -7);
  const summary = summarizeWeek(days);
  const comparison = buildWeekComparison(days, previousDays);

  let verdict = {
    title: "Woche noch offen",
    tone: "neutral",
    text: "Es gibt noch kein klares Muster in den letzten sieben Tagen.",
  };

  if (summary.totalNew === 0 && summary.totalOld === 0) {
    verdict = {
      title: "Leere Woche",
      tone: "neutral",
      text: "Noch keine Einträge. Sobald etwas passiert, zeigt der Rückblick Richtung und Druck.",
    };
  } else if (summary.totalNew >= summary.totalOld + 4) {
    verdict = {
      title: "Woche im Aufbau",
      tone: "gold",
      text: `Du liegst ${summary.totalNew - summary.totalOld} Punkte Eintragsvolumen vor dem alten Ich.`,
    };
  } else if (summary.totalOld >= summary.totalNew + 3) {
    verdict = {
      title: "Woche unter Zug",
      tone: "red",
      text: `Die alten Muster drücken mit ${summary.totalOld - summary.totalNew} Einträgen Vorsprung.`,
    };
  }

  const insights = [];

  insights.push({
    label: "Volumen",
    value: `${summary.totalNew} gut / ${summary.totalOld} alt`,
    tone: summary.totalNew >= summary.totalOld ? "gold" : "red",
  });

  insights.push({
    label: "Saubere Tage",
    value: `${summary.cleanDays} von ${days.length}`,
    tone: summary.cleanDays >= 4 ? "gold" : summary.cleanDays === 0 ? "red" : "neutral",
  });

  if (summary.strongestDay.total > 0) {
    insights.push({
      label: "Stärkster Tag",
      value: summary.strongestDay.net > 0
        ? `${summary.strongestDay.label} · +${summary.strongestDay.net}`
        : `${summary.strongestDay.label} · ${summary.strongestDay.net}`,
      tone: summary.strongestDay.net > 0 ? "gold" : summary.strongestDay.net < 0 ? "red" : "neutral",
    });
  }

  if (summary.heaviestDay.old > 0) {
    insights.push({
      label: "Risikotag",
      value: `${summary.heaviestDay.label} · ${summary.heaviestDay.old} alte Muster`,
      tone: "red",
    });
  }

  insights.push({
    label: "Tendenz",
    value: summary.momentum > 1
      ? "Die zweite Wochenhälfte zieht an."
      : summary.momentum < -1
      ? "Zum Wochenende kippt die Spannung."
      : summary.dominantNewDays > summary.dominantOldDays
      ? "Die Woche bleibt leicht auf Aufbau."
      : summary.dominantOldDays > summary.dominantNewDays
      ? "Die Woche bleibt leicht auf Abwehr."
      : "Die Woche ist noch unentschieden.",
    tone: summary.momentum > 1 || summary.dominantNewDays > summary.dominantOldDays ? "gold" : summary.momentum < -1 || summary.dominantOldDays > summary.dominantNewDays ? "red" : "neutral",
  });

  return {
    days,
    previousDays,
    totalNew: summary.totalNew,
    totalOld: summary.totalOld,
    activeDays: summary.activeDays,
    verdict,
    comparison,
    insights,
  };
}

export function buildTrendWindow(historyDays = []) {
  return historyDays.map((day) => {
    const total = day.total ?? ((day.new || 0) + (day.old || 0));
    const net = (day.new || 0) - (day.old || 0);
    const level = total >= 6 ? 4 : total >= 4 ? 3 : total >= 2 ? 2 : total >= 1 || day.note ? 1 : 0;
    const tone = total === 0
      ? day.note
        ? "note"
        : "empty"
      : net > 0
      ? "gold"
      : net < 0
      ? "red"
      : "mixed";

    return {
      ...day,
      total,
      net,
      level,
      tone,
      shortLabel: day.date.slice(-2),
    };
  });
}

export function buildDayDetail(day, habits) {
  if (!day) {
    return null;
  }

  const groupedEntries = new Map();
  for (const entry of day.entries || []) {
    const key = `${entry.type}:${entry.label}`;
    if (!groupedEntries.has(key)) {
      groupedEntries.set(key, { ...entry, count: 0 });
    }
    groupedEntries.get(key).count += 1;
  }

  const score = berechneScore(habits, day.entries || [], day.date);
  const tone = day.new > day.old ? "gold" : day.old > day.new ? "red" : "neutral";
  const headline = day.total === 0
    ? day.note
      ? "Nur Notiz an diesem Tag"
      : "Leerer Tag"
    : tone === "gold"
    ? `${formatSigned(day.new - day.old)} Aufbauvorsprung an diesem Tag`
    : tone === "red"
    ? `${formatSigned(day.new - day.old)} Tagesbilanz gegen dich`
    : "Ausgeglichener Tag";

  return {
    ...day,
    tone,
    headline,
    groupedEntries: Array.from(groupedEntries.values()),
    score,
  };
}

export function buildRiskForecast(historyDays = []) {
  const days = historyDays.slice(-30);
  if (!days.length) {
    return {
      tone: "neutral",
      title: "Noch keine Prognose möglich",
      lead: "Sobald mehr Verlauf vorhanden ist, zeigt dir die Statistik die nächsten Druckpunkte.",
      chips: [],
      signals: [],
    };
  }

  const recentWindow = days.slice(-5);
  const recentNew = recentWindow.reduce((sum, day) => sum + (day.new || 0), 0);
  const recentOld = recentWindow.reduce((sum, day) => sum + (day.old || 0), 0);
  const recentNet = recentNew - recentOld;

  let quietRun = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if ((days[index].new || 0) > 0) {
      break;
    }
    quietRun += 1;
  }

  let oldRun = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if ((days[index].old || 0) === 0) {
      break;
    }
    oldRun += 1;
  }

  const weekdayMap = new Map();
  days.forEach((day) => {
    const weekday = weekdayName(day.date);
    if (!weekdayMap.has(weekday)) {
      weekdayMap.set(weekday, { weekday, old: 0, appearances: 0, net: 0 });
    }
    const row = weekdayMap.get(weekday);
    row.old += day.old || 0;
    row.net += (day.new || 0) - (day.old || 0);
    row.appearances += 1;
  });

  const weekdayRisk = Array.from(weekdayMap.values()).sort((left, right) => {
    const leftRatio = left.old / Math.max(left.appearances, 1);
    const rightRatio = right.old / Math.max(right.appearances, 1);
    return rightRatio - leftRatio;
  })[0];

  const eveningOldEntries = days.reduce((sum, day) => sum + (day.entries || []).filter((entry) => entry.type === "old" && Number((entry.time || "00").slice(0, 2)) >= 18).length, 0);
  const totalOldEntries = days.reduce((sum, day) => sum + (day.old || 0), 0);
  const eveningShare = totalOldEntries > 0 ? Math.round((eveningOldEntries / totalOldEntries) * 100) : 0;

  const riskScore = oldRun * 2 + quietRun + Math.max(recentOld - recentNew, 0) + (eveningShare >= 50 ? 1 : 0);
  const tone = riskScore >= 5 ? "red" : riskScore >= 2 ? "neutral" : "gold";
  const title = tone === "red"
    ? "Erhöhter Druck in den nächsten Tagen"
    : tone === "neutral"
    ? "Leichter Risikodruck vorhanden"
    : "Aktuell stabiler Korridor";
  const lead = tone === "red"
    ? "Die letzten Tage zeigen zu wenig Aufbau oder wiederkehrenden Rückfalldruck. Die nächsten 48 Stunden sind relevant."
    : tone === "neutral"
    ? "Noch ist nichts gekippt, aber die letzten Muster sollten bewusst geführt werden."
    : "Dein Verlauf wirkt kontrolliert. Halte vor allem die bekannten Risikofenster sauber.";

  return {
    tone,
    title,
    lead,
    chips: [
      { label: "5-Tage-Saldo", value: formatSigned(recentNet), tone: recentNet > 0 ? "gold" : recentNet < 0 ? "red" : "neutral" },
      { label: "Ohne Aufbau", value: `${quietRun} Tage`, tone: quietRun >= 2 ? "red" : quietRun === 1 ? "neutral" : "gold" },
      { label: "Abenddruck", value: totalOldEntries > 0 ? `${eveningShare}%` : "0%", tone: eveningShare >= 50 ? "red" : eveningShare >= 25 ? "neutral" : "gold" },
    ],
    signals: [
      `Gefährlichster Wochentag: ${weekdayRisk?.weekday || "noch offen"}`,
      oldRun > 0 ? `${oldRun} Tage in Folge mit altem Muster.` : "Kein aktueller Rückfall-Lauf aktiv.",
      quietRun > 1 ? `${quietRun} Tage ohne sichtbaren Aufbau.` : "Aufbau wurde zuletzt nicht komplett unterbrochen.",
    ],
  };
}

export function buildMonthlyRadar(historyDays = []) {
  const monthMap = new Map();
  historyDays.forEach((day) => {
    const key = day.date.slice(0, 7);
    if (!monthMap.has(key)) {
      monthMap.set(key, []);
    }
    monthMap.get(key).push(day);
  });

  const months = Array.from(monthMap.entries()).slice(-2);
  if (!months.length) {
    return {
      axes: [],
      series: [],
      title: "Monatsradar",
      currentLabel: "noch keine Daten",
      previousLabel: null,
    };
  }

  const summaries = months.map(([key, days]) => {
    const activeDays = days.filter((day) => (day.total || 0) > 0 || day.note).length;
    const cleanDays = days.filter((day) => (day.new || 0) > 0 && (day.old || 0) === 0).length;
    const totalNew = days.reduce((sum, day) => sum + (day.new || 0), 0);
    const totalOld = days.reduce((sum, day) => sum + (day.old || 0), 0);
    const netPositiveDays = days.filter((day) => (day.new || 0) - (day.old || 0) > 0).length;
    const lastHalfNet = days.slice(Math.max(Math.floor(days.length / 2), 0)).reduce((sum, day) => sum + ((day.new || 0) - (day.old || 0)), 0);
    const firstHalfNet = days.slice(0, Math.floor(days.length / 2)).reduce((sum, day) => sum + ((day.new || 0) - (day.old || 0)), 0);

    return {
      key,
      label: monthLabel(key),
      raw: {
        aufbau: totalNew,
        konstanz: activeDays,
        kontrolle: Math.max(totalNew - totalOld, 0) + cleanDays,
        fokus: netPositiveDays,
        momentum: Math.max(lastHalfNet - firstHalfNet, 0),
      },
    };
  });

  const axes = [
    { key: "aufbau", label: "Aufbau", hint: "Wie viele Aufbau-Einträge du im Monat gesammelt hast." },
    { key: "konstanz", label: "Aktive Tage", hint: "An wie vielen Tagen du etwas festgehalten hast." },
    { key: "kontrolle", label: "Kontrolle", hint: "Wie stabil du netto im Plus geblieben bist." },
    { key: "fokus", label: "Positive Tage", hint: "Tage mit mehr Aufbau als Rückfall." },
    { key: "momentum", label: "Endspurt", hint: "Ob die zweite Monatshälfte stärker war als die erste." },
  ];

  const monthlyScores = summaries.map((summary) => axes.reduce((total, axis) => total + (summary.raw[axis.key] || 0), 0));
  const currentIndex = summaries.length - 1;
  const previousIndex = summaries.length - 2;
  const currentTone = previousIndex >= 0 && monthlyScores[currentIndex] < monthlyScores[previousIndex] ? "red" : "gold";

  const maxima = axes.reduce((accumulator, axis) => {
    accumulator[axis.key] = Math.max(...summaries.map((summary) => summary.raw[axis.key] || 0), 1);
    return accumulator;
  }, {});

  const series = summaries.map((summary, index) => ({
    label: summary.label,
    tone: index === currentIndex ? currentTone : "green",
    values: axes.map((axis) => Math.round(((summary.raw[axis.key] || 0) / maxima[axis.key]) * 100)),
  }));

  return {
    axes,
    series,
    title: "Monatsradar",
    currentLabel: summaries[summaries.length - 1]?.label || "noch keine Daten",
    previousLabel: summaries.length > 1 ? summaries[0].label : null,
  };
}

function scoreTone(category) {
  if (["gold", "gruen2", "gruen", "gelb"].includes(category)) {
    return "gold";
  }

  if (["rot", "tiefrot"].includes(category)) {
    return "red";
  }

  return "neutral";
}

export function buildStatsSnapshot(state) {
  const habits = state?.habits || { new: [], old: [] };
  const totals = state?.totals || {};
  const score = state?.score || { score: 0, kategorie: "neutral" };
  const stats = state?.stats || { streak: 0, direction: { tone: "neutral", text: "noch keine Daten" } };
  const callStreak = state?.callStreak || 0;
  const review = buildWeekReview(state?.weekData || []);

  const totalNewEntries = habits.new.reduce((sum, habit) => sum + (totals[habit.id] || 0), 0);
  const totalOldEntries = habits.old.reduce((sum, habit) => sum + (totals[habit.id] || 0), 0);
  const totalEntries = totalNewEntries + totalOldEntries;
  const newLeader = habits.new.reduce(
    (best, habit) => ((totals[habit.id] || 0) > (totals[best?.id] || 0) ? habit : best),
    null
  );
  const oldLeader = habits.old.reduce(
    (best, habit) => ((totals[habit.id] || 0) > (totals[best?.id] || 0) ? habit : best),
    null
  );

  let lead = "Noch wenig Material. Sobald du ein paar Tage drin hast, wird die Lage klarer.";
  if (review.totalNew || review.totalOld) {
    lead = `${review.verdict.text} ${stats.direction?.text || ""}`.trim();
  }

  return {
    lead,
    cards: [
      {
        label: "Einträge gesamt",
        value: totalEntries,
        meta: `${habits.new.length + habits.old.length} Stränge im System`,
        tone: "neutral",
      },
      {
        label: "Neue Fäden",
        value: totalNewEntries,
        meta: `${habits.new.length} aktive Aufbau-Stränge`,
        tone: "gold",
      },
      {
        label: "Alte Fäden",
        value: totalOldEntries,
        meta: `${habits.old.length} beobachtete Muster`,
        tone: "red",
      },
      {
        label: "Anruf-Serie",
        value: callStreak,
        meta: callStreak > 0 ? "Werktage am Stück" : "noch kein Lauf aktiv",
        tone: callStreak > 0 ? "gold" : "neutral",
      },
    ],
    highlights: [
      {
        label: "Richtung",
        value: stats.direction?.text || "noch keine Daten",
        tone: stats.direction?.tone || "neutral",
      },
      {
        label: "Stärkster Aufbau",
        value: newLeader ? `${newLeader.label} ×${totals[newLeader.id] || 0}` : "noch offen",
        tone: "gold",
      },
      {
        label: "Hartnäckigstes Muster",
        value: oldLeader ? `${oldLeader.label} ×${totals[oldLeader.id] || 0}` : "noch offen",
        tone: "red",
      },
      {
        label: "Tages-Score",
        value: `${score.score > 0 ? `+${score.score}` : score.score}`,
        tone: scoreTone(score.kategorie),
      },
      {
        label: "Streak",
        value: `${stats.streak || 0} Tage in Folge`,
        tone: (stats.streak || 0) >= 3 ? "gold" : "neutral",
      },
      {
        label: "Wochensaldo",
        value: `${review.totalNew - review.totalOld > 0 ? "+" : ""}${review.totalNew - review.totalOld}`,
        tone: review.totalNew > review.totalOld ? "gold" : review.totalOld > review.totalNew ? "red" : "neutral",
      },
    ],
  };
}