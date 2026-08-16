import type { Store } from "../editor/state.js";

/** Verdict panel: stars + doc §5's plain-language coaching sentences, plus the raw metric strip and any placement error message. */
export function mountVerdict(container: HTMLElement, store: Store): void {
  function render(): void {
    const { result, verdict, grading, message, parcel, mode } = store.getState();
    const isLand = mode === "land";
    container.replaceChildren();

    if (message) {
      const msg = document.createElement("p");
      msg.className = "verdict-message";
      msg.textContent = message;
      container.appendChild(msg);
    }

    if (grading) {
      const p = document.createElement("p");
      p.className = "verdict-status";
      p.textContent = "Grading…";
      container.appendChild(p);
      return;
    }

    if (!result || !verdict) {
      const p = document.createElement("p");
      p.className = "verdict-status";
      p.textContent = "Press Test to run the field.";
      container.appendChild(p);
      return;
    }

    // Land mode's tray is the green alone, which grade.ts never counts
    // against the budget (see packages/sim's grade.ts#grade) — there is
    // nothing to hold back, so the doc §5 restraint star doesn't apply here.
    // maxStars keeps an unearned-but-possible third star from ever being
    // *shown* as withheld — it should never appear at all in this mode.
    const maxStars = isLand ? 2 : 3;
    const stars = document.createElement("p");
    stars.className = "stars";
    stars.textContent = "★".repeat(Math.min(verdict.stars, maxStars)) + "☆".repeat(maxStars - Math.min(verdict.stars, maxStars));
    container.appendChild(stars);

    if (isLand) {
      const note = document.createElement("p");
      note.className = "verdict-note";
      note.textContent =
        "Land mode has no material budget — the third star is restraint, and here there's nothing to hold back.";
      container.appendChild(note);
    }

    const list = document.createElement("ul");
    list.className = "coaching";
    for (const s of verdict.sentences) {
      const li = document.createElement("li");
      li.textContent = s;
      list.appendChild(li);
    }
    container.appendChild(list);

    const m = result.metrics;
    const table = document.createElement("table");
    table.className = "golfer-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Golfer", "Mean", "SD"]) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const sorted = Object.entries(result.golfers).sort((a, b) => a[1].mean - b[1].mean);
    for (const [id, g] of sorted) {
      const tr = document.createElement("tr");
      const idCell = document.createElement("td");
      idCell.textContent = id;
      const meanCell = document.createElement("td");
      meanCell.className = "num";
      meanCell.textContent = g.mean.toFixed(2);
      const sdCell = document.createElement("td");
      sdCell.className = "num";
      sdCell.textContent = g.sd.toFixed(2);
      tr.append(idCell, meanCell, sdCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    // "used X/cap" reads as a puzzle to solve in land mode (it's always
    // 0/0, since the green is free and there's no other tray item) —
    // showing the raw fraction there just invites "why can't I get three
    // stars" instead of explaining it, which the note above already does.
    const budget = isLand ? "green only" : `used ${m.used}/${m.cap}`;
    const metrics = document.createElement("p");
    metrics.className = "metrics-strip";
    metrics.textContent = `par ${parcel.par} · field ${m.field.toFixed(2)} · spread ${m.spread.toFixed(2)} · contested ${m.contested.toFixed(2)} · σ ${m.sd.toFixed(2)} · ${budget}`;
    container.appendChild(metrics);
  }

  store.subscribe(render);
  render();
}
