import { describe, it, expect, vi } from "vitest";
import Maze from "../maze";

describe("Maze", () => {
  const mockScene = {
    scale: { width: 800, height: 600 },
    add: {
      rectangle: vi.fn().mockReturnValue({
        setVisible: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setFillStyle: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
      }),
      container: vi.fn().mockReturnValue({
        setDepth: vi.fn().mockReturnThis(),
        add: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setScale: vi.fn().mockReturnThis(),
      }),
      graphics: vi.fn().mockReturnValue({
        clear: vi.fn().mockReturnThis(),
        fillStyle: vi.fn().mockReturnThis(),
        fillRect: vi.fn().mockReturnThis(),
        strokeStyle: vi.fn().mockReturnThis(),
        strokeRect: vi.fn().mockReturnThis(),
        beginPath: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        stroke: vi.fn().mockReturnThis(),
        fill: vi.fn().mockReturnThis(),
        closePath: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        fillPoints: vi.fn().mockReturnThis(),
        strokePoints: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
      }),
      circle: vi.fn().mockReturnValue({
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
      }),
    },
    tweens: {
      add: vi.fn().mockReturnValue({}),
      killTweensOf: vi.fn(),
    },
  } as any;

  const mockOnInteraction = vi.fn();

  const simpleGrid: any = [
    ["#", "#", "#", "#", "#"],
    ["#", "s", ".", "e", "#"],
    ["#", "#", "#", "#", "#"],
  ];

  const keyDoorGrid: any = [
    ["#", "#", "#", "#", "#"],
    ["#", "s", "a", "1", "e"],
    ["#", "#", "#", "#", "#"],
  ];

  const ventGrid: any = [
    ["#", "#", "#", "#", "#"],
    ["#", "s", "v", ".", "#"],
    ["#", "#", "#", "#", "#"],
  ];

  it("should correctly identify the start position", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    expect(maze.startPosition).toEqual({ row: 1, column: 1 });
  });

  it("should throw error if no start cell is present", () => {
    const badGrid = [
      ["#", "#"],
      ["#", "#"],
    ];
    expect(() => new Maze(mockScene, badGrid, mockOnInteraction)).toThrow(
      /must contain a start cell/,
    );
  });

  it("should correctly identify the exit cell", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    expect(maze.isExitAt({ row: 1, column: 3 })).toBe(true);
    expect(maze.isExitAt({ row: 1, column: 2 })).toBe(false);
  });

  it("should allow player to occupy empty cells and start cell", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    expect(maze.canPlayerOccupy(1, 1)).toBe(true);
    expect(maze.canPlayerOccupy(1, 2)).toBe(true);
  });

  it("should prevent player from occupying walls", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    expect(maze.canPlayerOccupy(0, 0)).toBe(false);
  });

  it("should prevent player from occupying locked doors", () => {
    const maze = new Maze(mockScene, keyDoorGrid, mockOnInteraction);
    expect(maze.canPlayerOccupy(1, 3)).toBe(false);
  });

  it("should allow player to occupy vents", () => {
    const maze = new Maze(mockScene, ventGrid, mockOnInteraction);
    expect(maze.canPlayerOccupy(1, 2)).toBe(true);
  });

  it("should prevent enemies from occupying vents", () => {
    const maze = new Maze(mockScene, ventGrid, mockOnInteraction);
    expect(maze.canEnemyOccupy(1, 2)).toBe(false);
  });

  it("should allow collecting keys", () => {
    const maze = new Maze(mockScene, keyDoorGrid, mockOnInteraction);
    const key = maze.collectKeyAt({ row: 1, column: 2 });
    expect(key).toBe("a");
    expect(mockOnInteraction).toHaveBeenCalledWith("key");
  });

  it("should return null when collecting already collected key", () => {
    const maze = new Maze(mockScene, keyDoorGrid, mockOnInteraction);
    maze.collectKeyAt({ row: 1, column: 2 });
    const key = maze.collectKeyAt({ row: 1, column: 2 });
    expect(key).toBeNull();
  });

  it("should unlock adjacent doors if the correct key is held", () => {
    const maze = new Maze(mockScene, keyDoorGrid, mockOnInteraction);
    const keys = new Set(["a"]);
    const unlocked = maze.unlockAdjacentLocks({ row: 1, column: 2 }, keys);
    expect(unlocked).toBe(true);
    expect(maze.canPlayerOccupy(1, 3)).toBe(true);
    expect(mockOnInteraction).toHaveBeenCalledWith("gate");
  });

  it("should not unlock door if wrong key is held", () => {
    const maze = new Maze(mockScene, keyDoorGrid, mockOnInteraction);
    const keys = new Set(["b"]);
    const unlocked = maze.unlockAdjacentLocks({ row: 1, column: 2 }, keys);
    expect(unlocked).toBe(false);
    expect(maze.canPlayerOccupy(1, 3)).toBe(false);
  });

  it("should find a path between two points for enemies", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    const path = maze.findPath({ row: 1, column: 1 }, { row: 1, column: 3 });
    expect(path).toEqual([
      { row: 1, column: 2 },
      { row: 1, column: 3 },
    ]);
  });

  it("should return null if no path exists for enemies (blocked by vent)", () => {
    const ventGridBlocked: any = [
      ["#", "#", "#"],
      ["s", "v", "e"],
      ["#", "#", "#"],
    ];
    const maze = new Maze(mockScene, ventGridBlocked, mockOnInteraction);
    const path = maze.findPath({ row: 1, column: 0 }, { row: 1, column: 2 });
    expect(path).toBeNull();
  });

  it("should check line of sight correctly", () => {
    const maze = new Maze(mockScene, simpleGrid, mockOnInteraction);
    // Direct line of sight
    expect(maze.hasLineOfSight({ row: 1, column: 1 }, { row: 1, column: 3 })).toBe(true);
    // Blocked by wall - test a clearly blocked path
    const blockedGrid: any = [
      ["#", "#", "#"],
      ["s", "#", "e"],
      [".", "#", "."],
    ];
    const blockedMaze = new Maze(mockScene, blockedGrid, mockOnInteraction);
    expect(blockedMaze.hasLineOfSight({ row: 1, column: 0 }, { row: 1, column: 2 })).toBe(false);
  });
});
