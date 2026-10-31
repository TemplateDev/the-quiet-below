import Phaser from "phaser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Player from "../player";
import type Maze from "../../maze/maze";

describe("Player touch movement", () => {
  const keyboardKey = () => ({ isDown: false, _justDown: false });
  let player: Player;
  let onStep: () => void;

  beforeEach(() => {
    vi.spyOn(Phaser.Input.Keyboard, "JustDown").mockReturnValue(false);
    onStep = vi.fn();

    const maze = {
      startPosition: { row: 1, column: 1 },
      cellCenter: (row: number, column: number) => ({ x: column, y: row }),
      updateVisibility: vi.fn(),
      unlockAdjacentLocks: vi.fn(),
      canPlayerOccupy: vi.fn(() => true),
      collectKeyAt: vi.fn(() => null),
    } as unknown as Maze;

    const scene = {
      input: {
        keyboard: {
          createCursorKeys: () => ({
            up: keyboardKey(),
            down: keyboardKey(),
            left: keyboardKey(),
            right: keyboardKey(),
          }),
          addKey: keyboardKey,
        },
      },
      add: {
        circle: (x: number, y: number) => ({
          x,
          y,
          setVisible: vi.fn(),
        }),
      },
      tweens: {
        add: vi.fn(),
        killTweensOf: vi.fn(),
      },
    } as unknown as Phaser.Scene;

    player = new Player(scene, maze, onStep);
  });

  it("does not queue an extra move when touch input is released during cooldown", () => {
    player.setTouchDirection({ row: 0, column: 1 });
    player.update(0);
    player.update(50);
    player.setTouchDirection(null);
    player.update(150);

    expect(player.position).toEqual({ row: 1, column: 2 });
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("continues moving at the normal interval while touch input stays held", () => {
    player.setTouchDirection({ row: 0, column: 1 });
    player.update(0);
    player.update(100);
    expect(player.position).toEqual({ row: 1, column: 2 });

    player.update(150);

    expect(player.position).toEqual({ row: 1, column: 3 });
    expect(onStep).toHaveBeenCalledTimes(2);
  });
});
