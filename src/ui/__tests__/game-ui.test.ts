import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GameUi from "../game-ui";

describe("GameUi movement controls", () => {
  const setTouchDirection = vi.fn();
  let ui: GameUi;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    setTouchDirection.mockClear();
    ui = new GameUi({
      startLevel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      showLevels: vi.fn(),
      showTitle: vi.fn(),
      resetProgress: vi.fn(),
      setTouchDirection,
    });
  });

  afterEach(() => {
    ui.destroy();
    document.body.innerHTML = "";
  });

  it("shows keyboard instructions only when requested for the first level", () => {
    ui.show("playing", true);
    expect(document.querySelector(".movement-hint")?.textContent).toContain("W A S D");
    expect(document.querySelector(".movement-hint")?.textContent).toContain("↑ ↓ ← →");

    ui.show("playing");
    expect(document.querySelector(".movement-hint")).toBeNull();
  });

  it("holds a touch direction until its pointer is released", () => {
    ui.show("playing");
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(down, "pointerId", { value: 7 });
    document.querySelector<HTMLButtonElement>('[aria-label="Move left"]')!.dispatchEvent(down);

    expect(setTouchDirection).toHaveBeenLastCalledWith({ row: 0, column: -1 });

    const up = new Event("pointerup", { bubbles: true });
    Object.defineProperty(up, "pointerId", { value: 7 });
    window.dispatchEvent(up);

    expect(setTouchDirection).toHaveBeenLastCalledWith(null);
  });
});
