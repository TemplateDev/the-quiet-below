import Phaser from "phaser";
import levels from "../maze/levels";
import Maze from "../maze/maze";
import Player from "../entities/player";
import Enemy from "../entities/enemy";

export default class Game extends Phaser.Scene {
    private maze!: Maze;
    private player!: Player;
    private enemies: Enemy[] = [];
    private cameraFocusX = 0;
    private cameraFocusY = 0;
    private restarting = false;

    create() {
        this.restarting = false;
        this.cameras.main.setBackgroundColor("#0f172a");
        this.maze = new Maze(this, levels[1]);
        this.player = new Player(this, this.maze);
        this.enemies = this.maze
            .getMarkerPositions("m")
            .map(position => new Enemy(this, this.maze, position, this.player));
        this.enemies.forEach(enemy => enemy.setAllies(this.enemies));

        this.cameraFocusX = this.maze.centerX;
        this.cameraFocusY = this.maze.centerY;
        this.cameras.main.setZoom(0.85);
        this.cameras.main.centerOn(this.cameraFocusX, this.cameraFocusY);
    }

    update(time: number, delta: number) {
        if (this.restarting) {
            return;
        }

        this.player.update(time);
        this.enemies.forEach(enemy => enemy.update(time));
        if (
            !this.restarting &&
            this.enemies.some(enemy =>
                enemy.position.row === this.player.position.row &&
                enemy.position.column === this.player.position.column
            )
        ) {
            this.restarting = true;
            this.time.delayedCall(500, () => this.scene.restart());
            return;
        }

        const targetX = Phaser.Math.Linear(this.maze.centerX, this.player.x, 0.4);
        const targetY = Phaser.Math.Linear(this.maze.centerY, this.player.y, 0.4);
        const lerp = 1 - Math.exp(-delta / 480);
        this.cameraFocusX = Phaser.Math.Linear(this.cameraFocusX, targetX, lerp);
        this.cameraFocusY = Phaser.Math.Linear(this.cameraFocusY, targetY, lerp);
        this.cameras.main.centerOn(this.cameraFocusX, this.cameraFocusY);
    }
}
