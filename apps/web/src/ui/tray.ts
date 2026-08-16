import { SHAPE_TABLE } from "@redan/schema";
import type { Store } from "../editor/state.js";
import { trayRemaining } from "../editor/state.js";
import { armShape, disarm, rotateArmed } from "../editor/intents.js";

/** Bottom tray strip (doc §6.4: "tray is a horizontal strip pinned to the bottom, under the thumb"). */
export function mountTray(container: HTMLElement, store: Store): void {
  function render(): void {
    const { parcel, design, armed, mode } = store.getState();
    container.replaceChildren();
    // Land mode places the green by dragging, not arming from a tray — its
    // "tray" is a single always-placed green, so there's nothing useful for
    // this strip to show there.
    if (mode === "land") return;

    for (const entry of parcel.tray) {
      const def = SHAPE_TABLE[entry.shapeId];
      const remaining = trayRemaining(parcel, design, entry.shapeId);
      const btn = document.createElement("button");
      btn.className = "tray-item";
      btn.disabled = remaining <= 0;
      btn.classList.toggle("armed", armed?.shapeId === entry.shapeId);

      const label = document.createElement("span");
      label.className = "tray-label";
      label.textContent = def?.label ?? entry.shapeId;
      const count = document.createElement("span");
      count.className = "tray-count";
      count.textContent = String(remaining);

      btn.append(label, count);
      btn.addEventListener("click", () => {
        if (armed?.shapeId === entry.shapeId) disarm(store);
        else armShape(store, entry.shapeId);
      });
      container.appendChild(btn);
    }

    if (armed) {
      const rotateBtn = document.createElement("button");
      rotateBtn.className = "tray-rotate";
      rotateBtn.textContent = `Rotate (${armed.rot}°)`;
      rotateBtn.addEventListener("click", () => rotateArmed(store));
      container.appendChild(rotateBtn);
    }
  }

  store.subscribe(render);
  render();
}
