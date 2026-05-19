import { useState, useEffect, useCallback, useRef } from "react";

const STAR_PATH = "M12 2L14.39 8.26L21 9.27L16.5 13.74L17.56 20.29L12 17.27L6.44 20.29L7.5 13.74L3 9.27L9.61 8.26Z";
const LOCK_PATH = "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z";

function StarSvg({ number, fillPercent, active, locked, size = 40 }) {
  const clipId = `sc-${number}`;
  const fillH = Math.max(0, Math.min(1, fillPercent / 100)) * 24;

  if (locked) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className="star-svg star-svg--locked" aria-hidden="true">
        <path d={STAR_PATH} fill="rgba(30,28,22,0.6)" stroke="rgba(50,46,32,0.4)" strokeWidth={0.8} />
        <path d={LOCK_PATH} fill="rgba(60,55,40,0.8)" transform="scale(0.5) translate(12,12)" />
      </svg>
    );
  }

  return (
    <svg viewBox="-2 -2 28 28" width={size} height={size} className={`star-svg${active ? " star-svg--active" : ""}`} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x={-2} y={24 - fillH} width={28} height={fillH + 2} />
        </clipPath>
      </defs>
      <path d={STAR_PATH} fill="rgba(42,34,8,0.85)" stroke="rgba(160,128,40,0.5)" strokeWidth={1} />
      {fillPercent > 0 && (
        <path d={STAR_PATH} fill={active ? "#e0b84a" : "#a87c28"} clipPath={`url(#${clipId})`} />
      )}
      {active && (
        <>
          <path d={STAR_PATH} fill="none" stroke="rgba(255,224,140,0.7)" strokeWidth={0.9} />
          <path d="M12 -1.2 L12.28 0.5 L13.8 1 L12.28 1.5 L12 3.2 L11.72 1.5 L10.2 1 L11.72 0.5Z" className="spark spark-1" />
          <path d="M22.2 8   L22.5 9.27 L23.8 9.27 L22.5 9.6  L22.2 10.8 L21.9 9.6  L20.6 9.27 L21.9 9Z"  className="spark spark-2" />
          <path d="M1.8  8   L2.1  9    L3.4  9.27 L2.1  9.5  L1.8  10.8 L1.5  9.5  L0.2  9.27 L1.5  9Z"  className="spark spark-3" />
          <path d="M18.5 20  L18.78 21.2 L20 21.5 L18.78 21.8 L18.5 23 L18.22 21.8 L17 21.5 L18.22 21.2Z" className="spark spark-4" />
        </>
      )}
    </svg>
  );
}

function StarDetail({ star, onClose, onRefresh }) {
  const [editMode, setEditMode] = useState(false);
  const [allHabits, setAllHabits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(star.name || "");
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  const starHabitIds = new Set(star.habits.map((h) => h.id));

  async function loadHabits() {
    if (allHabits) return;
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      setAllHabits([
        ...(data.habits?.new || []).map((h) => ({ ...h, type: "new" })),
        ...(data.habits?.old || []).map((h) => ({ ...h, type: "old" })),
      ]);
    } catch (_) {
      setAllHabits([]);
    }
  }

  async function enterEdit() {
    await loadHabits();
    setEditMode(true);
  }

  async function api(body) {
    setBusy(true);
    try {
      await fetch("/api/stars/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await onRefresh();
    } catch (_) {}
    setBusy(false);
  }

  function handleToggleHabit(habitId) {
    const inStar = starHabitIds.has(habitId);
    api({ star_id: star.star_id, habit_id: habitId, action: inStar ? "remove" : "add", is_required: false });
  }

  function handleSetRequired(habitId) {
    const habit = star.habits.find((h) => h.id === habitId);
    const currentlyRequired = habit?.is_required;
    api({
      star_id: star.star_id,
      habit_id: habitId,
      action: "add",
      is_required: !currentlyRequired,
    });
  }

  async function saveName() {
    const trimmed = nameVal.trim();
    if (trimmed === (star.name || "")) { setEditingName(false); return; }
    setBusy(true);
    try {
      await fetch("/api/stars/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ star_id: star.star_id, action: "rename", name: trimmed }),
      });
      await onRefresh();
    } catch (_) {}
    setBusy(false);
    setEditingName(false);
  }

  const displayName = star.name || `Stern ${star.number}`;
  const requiredHabit = star.habits.find((h) => h.is_required);
  const requiredDoneToday = requiredHabit?.done_today ?? true;
  const allDoneToday = star.habits.length > 0 && star.habits.every((h) => h.done_today);

  return (
    <div className="star-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="star-modal" onClick={(e) => e.stopPropagation()}>

        <div className="star-modal-header">
          <div className="star-modal-title-wrap">
            <p className="star-modal-num">Stern {star.number}</p>
            {editingName ? (
              <input
                ref={nameInputRef}
                className="star-name-input"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={40}
                disabled={busy}
              />
            ) : (
              <button
                type="button"
                className="star-modal-name"
                onClick={() => { setNameVal(star.name || ""); setEditingName(true); }}
                title="Namen bearbeiten"
              >
                {displayName}
                <span className="star-name-edit-hint">✎</span>
              </button>
            )}
            <p className="star-modal-since">
              Seit {star.unlocked_at?.split("-").reverse().join(".")}
            </p>
          </div>
          <button type="button" className="star-modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="star-fill-bar-wrap">
          <div className="star-fill-bar">
            <div
              className={`star-fill-bar-inner${star.active ? " star-fill-bar-inner--active" : ""}`}
              style={{ width: `${star.fill_percent}%` }}
            />
          </div>
          <p className="star-fill-label">
            {star.completed_days} von {star.total_days} Tagen vollständig — {star.fill_percent}%
            {star.active ? " ★" : ""}
            {star.streak > 0 && <span className="star-streak-badge"> · 🔥 {star.streak} Tage am Stück</span>}
          </p>
        </div>

        {star.habits.length === 0 ? (
          <div className="star-empty-hint">
            <p>Füge Fäden hinzu um diesen Stern zu aktivieren.</p>
            {!editMode && (
              <button type="button" className="star-edit-btn" onClick={enterEdit} disabled={busy}>
                Fäden bearbeiten
              </button>
            )}
          </div>
        ) : (
          <div className="star-habits-section">
            <div className="star-habits-header">
              <p className="star-habits-title">
                Fäden heute
                {allDoneToday && <span className="star-done-badge"> — vollständig</span>}
                {!allDoneToday && requiredHabit && !requiredDoneToday && (
                  <span className="star-required-missing"> — Pflicht offen</span>
                )}
              </p>
              {!editMode && (
                <button type="button" className="star-edit-btn" onClick={enterEdit} disabled={busy}>
                  Bearbeiten
                </button>
              )}
              {editMode && (
                <button type="button" className="star-edit-btn star-edit-btn--active" onClick={() => setEditMode(false)}>
                  Fertig
                </button>
              )}
            </div>

            <ul className="star-habit-list">
              {star.habits.map((habit) => (
                <li
                  key={habit.id}
                  className={[
                    "star-habit-item",
                    habit.is_required ? "star-habit-item--required" : "",
                    !editMode && habit.done_today ? "star-habit-item--done" : "",
                    !editMode && habit.is_required && !habit.done_today ? "star-habit-item--required-missing" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className="star-habit-type-dot" data-type={habit.type} />
                  <span className="star-habit-label">{habit.label}</span>
                  {!editMode && (
                    <span className="star-habit-status">
                      {habit.done_today ? "✓" : "✗"}
                    </span>
                  )}
                  {editMode && (
                    <div className="star-habit-controls">
                      <button
                        type="button"
                        className={`star-required-btn${habit.is_required ? " star-required-btn--on" : ""}`}
                        onClick={() => handleSetRequired(habit.id)}
                        disabled={busy}
                        title={habit.is_required ? "Pflicht aufheben" : "Als Pflicht setzen"}
                      >
                        🔒
                      </button>
                      <button
                        type="button"
                        className="star-remove-btn"
                        onClick={() => handleToggleHabit(habit.id)}
                        disabled={busy}
                        title="Faden entfernen"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {editMode && allHabits && (
          <div className="star-add-section">
            <p className="star-add-title">Fäden hinzufügen</p>
            <ul className="star-add-list">
              {allHabits
                .filter((h) => !starHabitIds.has(h.id))
                .map((habit) => (
                  <li key={habit.id} className="star-add-item">
                    <span className="star-habit-type-dot" data-type={habit.type} />
                    <span className="star-add-label">{habit.label}</span>
                    <button
                      type="button"
                      className="star-add-btn"
                      onClick={() => handleToggleHabit(habit.id)}
                      disabled={busy}
                    >
                      +
                    </button>
                  </li>
                ))}
              {allHabits.filter((h) => !starHabitIds.has(h.id)).length === 0 && (
                <p className="star-add-empty">Alle Fäden sind bereits zugeordnet.</p>
              )}
            </ul>
          </div>
        )}

        {editMode && allHabits === null && (
          <p className="star-loading">Lädt…</p>
        )}

      </div>
    </div>
  );
}

export default function StarSystem({ refreshKey = 0 }) {
  const [stars, setStars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(() =>
    fetch("/api/stars/status")
      .then((r) => r.json())
      .then(setStars)
      .catch(() => {}),
  []);

  useEffect(() => {
    fetch("/api/stars/status")
      .then((r) => r.json())
      .then((data) => { setStars(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (refreshKey > 0) refresh();
  }, [refreshKey, refresh]);

  const handleClose = useCallback(() => setSelected(null), []);

  if (loading || !stars.length) return null;

  const selectedStar = selected !== null ? stars.find((s) => s.number === selected) : null;
  const activeCount = stars.filter((s) => s.active).length;
  const focusStar = stars.find((s) => s.unlocked && s.habits.length > 0) || stars.find((s) => s.unlocked);
  const focusDone = focusStar ? focusStar.habits.filter((h) => h.done_today).length : 0;
  const focusTotal = focusStar ? focusStar.habits.length : 0;
  const focusComplete = focusTotal > 0 && focusDone === focusTotal;

  return (
    <>
      <section className="star-section" aria-label="Sterne-System">
        <div className="star-section-header">
          <p className="star-section-title">Traumroutine</p>
          <p className="star-section-sub">{activeCount === 7 ? "Alle 7 Sterne aktiv" : `${activeCount}/7 Sterne aktiv`}</p>
        </div>
        <div className="star-row">
          {stars.map((star) => (
            <button
              key={star.number}
              type="button"
              className={[
                "star-btn",
                star.active ? "star-btn--active" : "",
                !star.unlocked ? "star-btn--locked" : "",
                star.unlocked && star.habits.length === 0 ? "star-btn--empty" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => star.unlocked && setSelected(star.number)}
              disabled={!star.unlocked}
              title={star.unlocked
                ? star.habits.length === 0
                  ? `Stern ${star.number} — Fäden zuweisen`
                  : `${star.name || `Stern ${star.number}`} · ${star.fill_percent}%`
                : `Stern ${star.number} — gesperrt`}
              aria-pressed={selected === star.number}
            >
              <StarSvg
                number={star.number}
                fillPercent={star.fill_percent}
                active={star.active}
                locked={!star.unlocked}
              />
              <span className="star-num">{star.number}</span>
              {star.unlocked && star.habits.length === 0 && (
                <span className="star-setup-dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        {focusStar && (
          <p className={`star-today-hint${focusComplete ? " star-today-hint--done" : ""}`}>
            {focusTotal === 0 ? (
              <>Stern {focusStar.number} — <em>Fäden zuweisen um zu starten</em></>
            ) : focusComplete ? (
              <>{focusStar.name || `Stern ${focusStar.number}`} — heute vollständig ✓</>
            ) : (
              <>{focusStar.name || `Stern ${focusStar.number}`} — {focusDone}/{focusTotal} Fäden heute</>
            )}
          </p>
        )}
      </section>

      {selectedStar && (
        <StarDetail
          key={selectedStar.number}
          star={selectedStar}
          onClose={handleClose}
          onRefresh={refresh}
        />
      )}
    </>
  );
}
