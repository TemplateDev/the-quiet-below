import Phaser from "phaser";
import Entity from "./entity";
import Maze, { type GridPosition } from "../maze/maze";

type MovementKeys = {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
};

export default class Player extends Entity<Phaser.GameObjects.Arc> {
    private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private readonly wasdKeys: MovementKeys;
    private bufferedMove: GridPosition | null = null;
    private nextMoveAt = 0;

    constructor(scene: Phaser.Scene, maze: Maze) {
        const keyboard = scene.input.keyboard;
        if (!keyboard) {
            throw new Error("Keyboard input is unavailable.");
        }

        const start = maze.startPosition;
        const { x, y } = maze.cellCenter(start.row, start.column);
        super(
            scene,
            maze,
            start.row,
            start.column,
            scene.add.circle(x, y, maze.playerRadius, 0x38bdf8)
        );

        this.cursors = keyboard.createCursorKeys();
        this.wasdKeys = {
            up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };
        maze.updateVisibility(this.position);
    }

    update(time: number) {
        const move = this.readMovementInput();
        if (move) {
            this.bufferedMove = move;
        }

        if (time < this.nextMoveAt) {
            return;
        }

        const bufferedMove = this.bufferedMove;
        this.bufferedMove = null;
        if (!bufferedMove) {
            return;
        }

        const moved = this.moveTo({
            row: this.row + bufferedMove.row,
            column: this.column + bufferedMove.column
        });
        if (!moved) {
            return;
        }

        this.maze.updateVisibility(this.position);
        this.nextMoveAt = time + 150;
    }

    private readMovementInput(): GridPosition | null {
        const up = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
            Phaser.Input.Keyboard.JustDown(this.wasdKeys.up);
        const down = Phaser.Input.Keyboard.JustDown(this.cursors.down) ||
            Phaser.Input.Keyboard.JustDown(this.wasdKeys.down);
        const left = Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
            Phaser.Input.Keyboard.JustDown(this.wasdKeys.left);
        const right = Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
            Phaser.Input.Keyboard.JustDown(this.wasdKeys.right);

        if (up) return { row: -1, column: 0 };
        if (down) return { row: 1, column: 0 };
        if (left) return { row: 0, column: -1 };
        if (right) return { row: 0, column: 1 };
        return null;
    }
}
