import Phaser from "phaser";
import Entity from "./entity";
import Maze, { type GridPosition } from "../maze/maze";
import Player from "./player";

export default class Enemy extends Entity<Phaser.GameObjects.Arc> {
    private readonly player: Player;
    private allies: Enemy[] = [];
    private lastKnownPlayerPosition: GridPosition | null = null;
    private wanderTarget: GridPosition | null = null;
    private nextMoveAt = 0;
    private playerSpotted = false;

    constructor(scene: Phaser.Scene, maze: Maze, start: GridPosition, player: Player) {
        const { x, y } = maze.cellCenter(start.row, start.column);
        super(
            scene,
            maze,
            start.row,
            start.column,
            scene.add.circle(x, y, maze.playerRadius * 0.8, 0xf97316)
        );
        this.player = player;
    }

    setAllies(allies: Enemy[]) {
        this.allies = allies.filter(enemy => enemy !== this);
    }

    update(time: number) {
        this.setVisible(this.maze.isVisible(this.position));

        const playerPosition = this.player.position;
        const hasLineOfSight = this.maze.hasLineOfSight(this.position, playerPosition);
        if (hasLineOfSight) {
            if (!this.playerSpotted) {
                this.nextMoveAt = Math.max(time, this.nextMoveAt) + 300;
                this.playerSpotted = true;
            }
            this.lastKnownPlayerPosition = playerPosition;
            this.wanderTarget = null;
            this.alertAllies(playerPosition);
        } else {
            this.playerSpotted = false;
            if (
                this.lastKnownPlayerPosition &&
                this.samePosition(this.position, this.lastKnownPlayerPosition)
            ) {
                this.lastKnownPlayerPosition = null;
            }
        }

        if (time < this.nextMoveAt) {
            return;
        }

        const target = this.lastKnownPlayerPosition ?? this.getWanderTarget();
        if (!target) {
            return;
        }

        const path = this.lastKnownPlayerPosition
            ? this.maze.findPathToTarget(this.position, target)
            : this.maze.findPath(this.position, target);
        if (path === null) {
            if (this.lastKnownPlayerPosition) {
                this.lastKnownPlayerPosition = null;
            } else {
                this.wanderTarget = null;
            }
            return;
        }

        const nextPosition = path?.[0];
        if (!nextPosition) {
            if (this.lastKnownPlayerPosition) {
                this.lastKnownPlayerPosition = null;
            } else {
                this.wanderTarget = null;
            }
            return;
        }

        if (this.moveTo(
            nextPosition,
            (row, column) => this.maze.canEnemyOccupy(row, column)
        )) {
            this.nextMoveAt = time + 300;
        }
    }

    private alertAllies(position: GridPosition) {
        for (const ally of this.allies) {
            ally.receiveAlert(position);
        }
    }

    private receiveAlert(position: GridPosition) {
        if (this.maze.hasLineOfSight(this.position, this.player.position)) {
            return;
        }
        this.lastKnownPlayerPosition = { ...position };
        this.wanderTarget = null;
    }

    private getWanderTarget(): GridPosition | null {
        if (this.wanderTarget && !this.samePosition(this.position, this.wanderTarget)) {
            return this.wanderTarget;
        }

        const candidates = this.maze
            .getMarkerPositions(".")
            .filter(position => !this.samePosition(this.position, position))
            .filter(position => this.maze.findPath(this.position, position) !== null);
        this.wanderTarget = Phaser.Utils.Array.GetRandom(candidates) ?? null;
        return this.wanderTarget;
    }

    private samePosition(first: GridPosition, second: GridPosition): boolean {
        return first.row === second.row && first.column === second.column;
    }
}
