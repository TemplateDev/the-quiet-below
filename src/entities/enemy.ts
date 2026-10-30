import Phaser from "phaser";
import Entity from "./entity";
import Maze, { type GridPosition } from "../maze/maze";
import Player from "./player";
import { GAME_SETTINGS } from "../settings";

export default class Enemy extends Entity<Phaser.GameObjects.Arc> {
  private readonly startPosition: GridPosition;
  private readonly player: Player;
  private readonly onSpotted: () => void;
  private readonly onStep: (position: GridPosition) => void;
  private allies: Enemy[] = [];
  private lastKnownPlayerPosition: GridPosition | null = null;
  private wanderTarget: GridPosition | null = null;
  private nextMoveAt = 0;
  private playerSpotted = false;
  private hasSightOfPlayer = false;

  constructor(
    scene: Phaser.Scene,
    maze: Maze,
    start: GridPosition,
    player: Player,
    onSpotted: () => void,
    onStep: (position: GridPosition) => void,
  ) {
    const { x, y } = maze.cellCenter(start.row, start.column);
    super(
      scene,
      maze,
      start.row,
      start.column,
      scene.add.circle(
        x,
        y,
        maze.playerRadius * GAME_SETTINGS.enemy.radiusScale,
        GAME_SETTINGS.enemy.color,
      ),
    );
    this.player = player;
    this.startPosition = { ...start };
    this.onSpotted = onSpotted;
    this.onStep = onStep;
  }

  setAllies(allies: Enemy[]) {
    this.allies = allies.filter((enemy) => enemy !== this);
  }

  canSeePlayer(): boolean {
    return this.hasSightOfPlayer;
  }

  reset() {
    this.resetPosition(this.startPosition);
    this.setVisible(this.maze.isVisible(this.startPosition));
    this.lastKnownPlayerPosition = null;
    this.wanderTarget = null;
    this.nextMoveAt = 0;
    this.playerSpotted = false;
    this.hasSightOfPlayer = false;
  }

  update(time: number) {
    this.setVisible(this.maze.isVisible(this.position));

    const playerPosition = this.player.position;
    this.hasSightOfPlayer = this.maze.hasLineOfSight(this.position, playerPosition);
    const hasLineOfSight = this.hasSightOfPlayer;
    if (hasLineOfSight) {
      if (!this.playerSpotted) {
        this.nextMoveAt = Math.max(time, this.nextMoveAt) + GAME_SETTINGS.enemy.spottedDelayMs;
        this.playerSpotted = true;
        this.onSpotted();
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
      this.clearUnreachableTarget();
      return;
    }

    const nextPosition = path?.[0];
    if (!nextPosition) {
      this.clearUnreachableTarget();
      return;
    }

    if (this.moveTo(nextPosition, (row, column) => this.maze.canEnemyOccupy(row, column))) {
      this.nextMoveAt = time + GAME_SETTINGS.enemy.moveIntervalMs;
      this.onStep(this.position);
    }
  }

  private clearUnreachableTarget() {
    if (this.lastKnownPlayerPosition) {
      this.lastKnownPlayerPosition = null;
    } else {
      this.wanderTarget = null;
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
      .getMarkerPositions(GAME_SETTINGS.maze.symbols.floor)
      .filter((position) => !this.samePosition(this.position, position))
      .filter((position) => this.maze.findPath(this.position, position) !== null);
    this.wanderTarget = Phaser.Utils.Array.GetRandom(candidates) ?? null;
    return this.wanderTarget;
  }

  private samePosition(first: GridPosition, second: GridPosition): boolean {
    return first.row === second.row && first.column === second.column;
  }
}
