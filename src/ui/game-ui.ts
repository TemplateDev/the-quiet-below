import levels from "../maze/levels";
import type { GridPosition } from "../maze/maze";

type GameScreen = "title" | "levels" | "playing" | "pause" | "complete" | "hidden";

type GameUiActions = {
  startLevel: (levelIndex: number) => void;
  pause: () => void;
  resume: () => void;
  showLevels: () => void;
  showTitle: () => void;
  resetProgress: () => void;
  setTouchDirection: (direction: GridPosition | null) => void;
};

// Key used for localstorage persistence
const PROGRESS_KEY = "maze-game-highest-unlocked-level";
const TOUCH_DIRECTIONS = {
  up: { row: -1, column: 0 },
  left: { row: 0, column: -1 },
  down: { row: 1, column: 0 },
  right: { row: 0, column: 1 },
} as const;
const MINI_MAZE = [
  "###########",
  "#...#.....#",
  "#.#.#.###.#",
  "#.#...#...#",
  "#.#####.#.#",
  "#.....#.#.#",
  "###.#.#.#.#",
  "#...#...#.#",
  "#.#######.#",
  "#.........#",
  "###########",
];

export default class GameUi {
  private readonly root: HTMLDivElement;
  private readonly actions: GameUiActions;
  private screen: GameScreen = "hidden";
  private highestUnlockedLevel = 0;
  private storageError = false;
  private showMovementHint = false;
  private readonly activeTouchPointers = new Map<number, GridPosition>();
  private readonly handlePointerEnd = (event: PointerEvent) => {
    if (this.activeTouchPointers.delete(event.pointerId)) {
      this.updateTouchDirection();
    }
  };
  private readonly handleWindowBlur = () => this.clearTouchDirections();
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    if (this.screen === "playing") {
      event.preventDefault();
      this.actions.pause();
    } else if (this.screen === "pause") {
      event.preventDefault();
      this.actions.resume();
    }
  };

  constructor(actions: GameUiActions) {
    this.actions = actions;
    this.root = document.createElement("div");
    this.root.className = "game-ui";
    this.root.setAttribute("aria-live", "polite");
    (document.querySelector("#app") ?? document.body).append(this.root);
    document.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerup", this.handlePointerEnd);
    window.addEventListener("pointercancel", this.handlePointerEnd);
    window.addEventListener("blur", this.handleWindowBlur);
    this.highestUnlockedLevel = this.loadProgress();
  }

  show(screen: GameScreen, showMovementHint = false) {
    this.screen = screen;
    this.showMovementHint = screen === "playing" && showMovementHint;
    this.render();
  }

  unlockThrough(levelIndex: number) {
    if (levelIndex <= this.highestUnlockedLevel) {
      return;
    }

    this.highestUnlockedLevel = Math.min(levelIndex, levels.length - 1);
    try {
      localStorage.setItem(PROGRESS_KEY, String(this.highestUnlockedLevel));
      this.storageError = false;
    } catch (error) {
      this.storageError = true;
      console.error("Unable to save maze level progression.", error);
    }
  }

  resetProgress() {
    this.highestUnlockedLevel = 0;
    try {
      localStorage.removeItem(PROGRESS_KEY);
      this.storageError = false;
    } catch (error) {
      this.storageError = true;
      console.error("Unable to reset maze level progression.", error);
    }
    this.render();
  }

  destroy() {
    document.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("pointerup", this.handlePointerEnd);
    window.removeEventListener("pointercancel", this.handlePointerEnd);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.clearTouchDirections();
    this.root.remove();
  }

  private loadProgress(): number {
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      if (stored === null) {
        return 0;
      }

      const value = Number(stored);
      return Number.isInteger(value) && value >= 0 ? Math.min(value, levels.length - 1) : 0;
    } catch (error) {
      this.storageError = true;
      console.error("Unable to load maze level progression.", error);
      return 0;
    }
  }

  private render() {
    this.clearTouchDirections();
    this.root.replaceChildren();
    this.root.classList.toggle("is-visible", this.screen !== "hidden");
    this.root.classList.toggle("is-playing", this.screen === "playing");
    if (this.screen === "hidden") {
      return;
    }
    if (this.screen === "playing") {
      if (this.showMovementHint) {
        this.root.append(this.createMovementHint());
      }
      const pause = this.createButton("Pause", "pause-control", this.actions.pause);
      pause.setAttribute("aria-label", "Pause game");
      this.root.append(pause, this.createTouchControls());
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "menu-backdrop";
    backdrop.append(this.createMiniMaze());

    const panel = document.createElement("main");
    panel.className = `menu-panel menu-panel--${this.screen}`;
    panel.setAttribute("aria-label", "Maze game menu");

    if (this.screen === "title") {
      this.renderTitle(panel);
    } else if (this.screen === "levels") {
      this.renderLevels(panel);
    } else if (this.screen === "pause") {
      this.renderPause(panel);
    } else {
      this.renderComplete(panel);
    }

    if (this.storageError) {
      const warning = document.createElement("p");
      warning.className = "storage-warning";
      warning.textContent = "Progress storage is unavailable in this browser.";
      panel.append(warning);
    }

    this.root.append(backdrop, panel);
  }

  private createMovementHint() {
    const hint = document.createElement("aside");
    hint.className = "movement-hint";
    hint.setAttribute("aria-label", "Move with WASD or the arrow keys");

    const label = document.createElement("span");
    label.textContent = "MOVE";
    const wasd = document.createElement("kbd");
    wasd.textContent = "W A S D";
    const separator = document.createElement("span");
    separator.textContent = "OR";
    const arrows = document.createElement("kbd");
    arrows.textContent = "↑ ↓ ← →";

    hint.append(label, wasd, separator, arrows);
    return hint;
  }

  private createTouchControls() {
    const controls = document.createElement("div");
    controls.className = "touch-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Touch movement controls");

    for (const direction of ["up", "left", "down", "right"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `touch-button touch-button--${direction}`;
      button.setAttribute("aria-label", `Move ${direction}`);
      button.textContent = { up: "↑", left: "←", down: "↓", right: "→" }[direction];
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.activeTouchPointers.set(event.pointerId, TOUCH_DIRECTIONS[direction]);
        this.updateTouchDirection();
      });
      controls.append(button);
    }

    return controls;
  }

  private updateTouchDirection() {
    let direction: GridPosition | null = null;
    for (const activeDirection of this.activeTouchPointers.values()) {
      direction = activeDirection;
    }
    this.actions.setTouchDirection(direction);
  }

  private clearTouchDirections() {
    this.activeTouchPointers.clear();
    this.actions.setTouchDirection(null);
  }

  private renderTitle(panel: HTMLElement) {
    const reset = this.createButton("Reset progress", "menu-reset", () => {
      if (window.confirm("Erase all unlocked levels and reset your progress?")) {
        this.actions.resetProgress();
      }
    });
    reset.setAttribute("aria-label", "Reset game progression");
    panel.append(reset);
    panel.append(
      this.createEyebrow("A MAZE IN THE DARK"),
      this.createHeading("THE QUIET\nBELOW"),
      this.createCopy("Find your way through the dark. Listen for what follows."),
      this.createButton("Enter the maze", "menu-primary", this.actions.showLevels),
    );
  }

  private renderLevels(panel: HTMLElement) {
    panel.append(
      this.createEyebrow("THE WAY DOWN"),
      this.createHeading("Choose a level"),
      this.createCopy("Some paths have not opened yet."),
    );

    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((_, index) => {
      const unlocked = index <= this.highestUnlockedLevel;
      const button = document.createElement("button");
      button.className = `level-card${unlocked ? "" : " is-locked"}`;
      button.disabled = !unlocked;
      button.type = "button";
      button.setAttribute(
        "aria-label",
        unlocked ? `Start level ${index + 1}` : `Level ${index + 1} locked`,
      );
      const number = document.createElement("span");
      number.className = "level-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const status = document.createElement("span");
      status.className = "level-status";
      status.textContent = unlocked ? "ENTER" : "SEALED";
      button.append(number, status);
      if (unlocked) {
        button.addEventListener("click", () => this.actions.startLevel(index));
      }
      levelList.append(button);
    });

    panel.append(levelList);
    panel.append(this.createButton("Back to title", "menu-secondary", this.actions.showTitle));
  }

  private renderPause(panel: HTMLElement) {
    panel.append(
      this.createEyebrow("THE DARK CAN WAIT"),
      this.createHeading("Paused"),
      this.createButton("Resume", "menu-primary", this.actions.resume),
      this.createButton("Level selector", "menu-secondary", this.actions.showLevels),
      this.createButton("Title screen", "menu-secondary", this.actions.showTitle),
    );
  }

  private renderComplete(panel: HTMLElement) {
    panel.append(
      this.createEyebrow("SILENCE, AT LAST"),
      this.createHeading("You made it out."),
      this.createCopy("The maze has nothing left to keep."),
      this.createButton("Return to title", "menu-primary", this.actions.showTitle),
      this.createButton("Reset progression", "menu-secondary", () => {
        if (window.confirm("Erase all unlocked levels and reset your progress?")) {
          this.actions.resetProgress();
          this.actions.showTitle();
        }
      }),
    );
  }

  private createMiniMaze() {
    const miniature = document.createElement("div");
    miniature.className = "mini-maze";
    miniature.setAttribute("aria-hidden", "true");
    miniature.style.setProperty("--maze-columns", String(MINI_MAZE[0].length));
    for (const [rowIndex, row] of MINI_MAZE.entries()) {
      for (const [columnIndex, cell] of [...row].entries()) {
        const tile = document.createElement("span");
        tile.className = cell === "#" ? "mini-maze-cell is-wall" : "mini-maze-cell";
        if (rowIndex === 1 && columnIndex === 1) {
          tile.classList.add("is-start");
        }
        if (rowIndex === MINI_MAZE.length - 2 && columnIndex === row.length - 2) {
          tile.classList.add("is-exit");
        }
        miniature.append(tile);
      }
    }
    return miniature;
  }

  private createEyebrow(text: string) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "menu-eyebrow";
    eyebrow.textContent = text;
    return eyebrow;
  }

  private createHeading(text: string) {
    const heading = document.createElement("h1");
    heading.textContent = text;
    return heading;
  }

  private createCopy(text: string) {
    const copy = document.createElement("p");
    copy.className = "menu-copy";
    copy.textContent = text;
    return copy;
  }

  private createButton(text: string, className: string, action: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }
}
