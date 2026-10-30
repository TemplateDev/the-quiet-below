import Phaser from "phaser";
import Maze, { type GridPosition } from "../maze/maze";
import { GAME_SETTINGS } from "../settings";

export default abstract class Entity<T extends Phaser.GameObjects.GameObject & {
    x: number;
    y: number;
    setVisible(visible: boolean): T;
}> {
    private readonly scene: Phaser.Scene;
    protected readonly maze: Maze;
    protected row: number;
    protected column: number;
    private readonly gameObject: T;

    protected constructor(
        scene: Phaser.Scene,
        maze: Maze,
        row: number,
        column: number,
        gameObject: T
    ) {
        this.scene = scene;
        this.maze = maze;
        this.row = row;
        this.column = column;
        this.gameObject = gameObject;
    }

    get x() {
        return this.gameObject.x;
    }

    get y() {
        return this.gameObject.y;
    }

    get position(): GridPosition {
        return { row: this.row, column: this.column };
    }

    protected setVisible(visible: boolean) {
        this.gameObject.setVisible(visible);
    }

    protected resetPosition(position: GridPosition) {
        this.scene.tweens.killTweensOf(this.gameObject);
        this.row = position.row;
        this.column = position.column;
        const { x, y } = this.maze.cellCenter(this.row, this.column);
        this.gameObject.x = x;
        this.gameObject.y = y;
        this.gameObject.setVisible(true);
    }

    protected moveTo(
        position: GridPosition,
        canOccupy: (row: number, column: number) => boolean
    ): boolean {
        if (!canOccupy(position.row, position.column)) {
            return false;
        }

        this.row = position.row;
        this.column = position.column;
        const { x, y } = this.maze.cellCenter(this.row, this.column);
        this.scene.tweens.add({
            targets: this.gameObject,
            x,
            y,
            duration: GAME_SETTINGS.entity.moveAnimationMs,
            ease: "Sine.easeInOut"
        });
        return true;
    }
}
