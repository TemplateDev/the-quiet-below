import Phaser from "phaser";
import levels from "../maze/levels";
import Maze from "../maze/maze";
import Player from "../entities/player";
import Enemy from "../entities/enemy";
import { GAME_SETTINGS } from "../settings";

export default class Game extends Phaser.Scene {
    private maze!: Maze;
    private player!: Player;
    private enemies: Enemy[] = [];
    private cameraFocusX = 0;
    private cameraFocusY = 0;
    private restarting = false;

    create() {
        this.restarting = false;
        this.cameras.main.setBackgroundColor(GAME_SETTINGS.backgroundColor);
        this.maze = new Maze(this, levels[GAME_SETTINGS.levelIndex]);
        this.player = new Player(this, this.maze);
        this.enemies = this.maze
            .getMarkerPositions(GAME_SETTINGS.maze.symbols.enemy)
            .map(position => new Enemy(this, this.maze, position, this.player));
        this.enemies.forEach(enemy => enemy.setAllies(this.enemies));

        this.cameraFocusX = this.maze.centerX;
        this.cameraFocusY = this.maze.centerY;
        this.cameras.main.setZoom(GAME_SETTINGS.camera.zoom);
        this.cameras.main.centerOn(this.cameraFocusX, this.cameraFocusY);
    }

    update(time: number, delta: number) {
        if (this.restarting) {
            return;
        }

        this.player.update(time);
        this.enemies.forEach(enemy => enemy.update(time));
        if (
            this.enemies.some(enemy =>
                enemy.position.row === this.player.position.row &&
                enemy.position.column === this.player.position.column
            )
        ) {
            this.restarting = true;
            this.time.delayedCall(
                GAME_SETTINGS.collision.restartDelayMs,
                () => this.scene.restart()
            );
            return;
        }

        const targetX = Phaser.Math.Linear(
            this.maze.centerX,
            this.player.x,
            GAME_SETTINGS.camera.playerBias
        );
        const targetY = Phaser.Math.Linear(
            this.maze.centerY,
            this.player.y,
            GAME_SETTINGS.camera.playerBias
        );
        const lerp = 1 - Math.exp(-delta / GAME_SETTINGS.camera.smoothingMs);
        this.cameraFocusX = Phaser.Math.Linear(this.cameraFocusX, targetX, lerp);
        this.cameraFocusY = Phaser.Math.Linear(this.cameraFocusY, targetY, lerp);
        this.cameras.main.centerOn(this.cameraFocusX, this.cameraFocusY);
    }
}
