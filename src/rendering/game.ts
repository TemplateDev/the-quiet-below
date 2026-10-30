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
    private ambienceSound!: Phaser.Sound.BaseSound;
    private stepSound!: Phaser.Sound.BaseSound;
    private pendingStep = false;
    private pendingStinger = false;
    private readonly pendingSounds: Array<{
        key: string;
        volume: number;
        rate: number;
    }> = [];
    private lastStingerAt = Number.NEGATIVE_INFINITY;
    private enemySightVignette!: Phaser.GameObjects.Image;
    private staticOverlay!: Phaser.GameObjects.Image;
    private staticTexture!: Phaser.Textures.CanvasTexture;
    private staticColor: "red" | "gray" = "red";
    private staticRefreshElapsed = 0;
    private enemySightActive = false;
    private isShowingLevelTransitionStatic = false;
    private cameraFocusX = 0;
    private cameraFocusY = 0;
    private isGameOver = false;
    private isLevelTransitioning = false;
    private currentLevelIndex: number = GAME_SETTINGS.levelIndex;

    preload() {
        this.load.audio(
            GAME_SETTINGS.audio.ambienceKey,
            new URL("../assets/ambience.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.stepKey,
            new URL("../assets/step.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.stingerKey,
            new URL("../assets/stinger.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.spawnKey,
            new URL("../assets/spawn.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.bleepKey,
            new URL("../assets/bleep.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.hitKey,
            new URL("../assets/hit.ogg", import.meta.url).href
        );
        this.load.audio(
            GAME_SETTINGS.audio.failKey,
            new URL("../assets/fail.ogg", import.meta.url).href
        );
    }

    create(data: { levelIndex?: number; showLevelTransition?: boolean } = {}) {
        if (data.levelIndex !== undefined) {
            this.currentLevelIndex = data.levelIndex;
        }
        this.isGameOver = false;
        this.isLevelTransitioning = false;
        this.isShowingLevelTransitionStatic =
            data.showLevelTransition === true;
        this.pendingStep = false;
        this.pendingStinger = false;
        this.pendingSounds.length = 0;
        this.enemySightActive = false;
        this.cameras.main.setBackgroundColor(GAME_SETTINGS.backgroundColor);
        this.ambienceSound = this.sound.add(GAME_SETTINGS.audio.ambienceKey, {
            loop: true,
            volume: GAME_SETTINGS.audio.ambienceVolume
        });
        this.stepSound = this.sound.add(GAME_SETTINGS.audio.stepKey, {
            volume: GAME_SETTINGS.audio.stepVolume
        });
        this.startAmbienceWhenAudioIsReady();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownAudio, this);
        this.enemySightVignette = this.createEnemySightVignette();
        this.staticOverlay = this.createStaticOverlay(
            data.showLevelTransition === true
        );

        this.maze = new Maze(
            this,
            levels[this.currentLevelIndex],
            interaction => this.playOneShot(
                GAME_SETTINGS.audio.bleepKey,
                GAME_SETTINGS.audio.bleepVolume,
                interaction === "key" ? 4 : 2
            )
        );
        this.player = new Player(this, this.maze, () => this.playStep());
        this.enemies = this.maze
            .getMarkerPositions(GAME_SETTINGS.maze.symbols.enemy)
            .map(position => new Enemy(
                this,
                this.maze,
                position,
                this.player,
                () => this.playStinger(),
                enemyPosition => this.playEnemyStep(enemyPosition)
            ));
        this.enemies.forEach(enemy => enemy.setAllies(this.enemies));

        this.cameras.main.setZoom(GAME_SETTINGS.camera.zoom);
        const cameraTarget = this.getCameraTarget();
        this.cameraFocusX = cameraTarget.x;
        this.cameraFocusY = cameraTarget.y;
        this.cameras.main.centerOn(cameraTarget.x, cameraTarget.y);

        if (data.showLevelTransition) {
            this.tweens.add({
                targets: this.staticOverlay,
                alpha: 0,
                duration: GAME_SETTINGS.effects.staticFadeOutMs,
                ease: GAME_SETTINGS.effects.vignetteEase,
                onComplete: () => {
                    this.isShowingLevelTransitionStatic = false;
                    if (this.enemySightActive) {
                        this.setStaticColor("red");
                        this.tweens.add({
                            targets: this.staticOverlay,
                            alpha: GAME_SETTINGS.effects.sightStaticAlpha,
                            duration: GAME_SETTINGS.effects.vignetteTransitionMs,
                            ease: GAME_SETTINGS.effects.vignetteEase
                        });
                    }
                }
            });
        }
    }

    private startAmbienceWhenAudioIsReady() {
        if (this.sound.locked) {
            this.sound.once(
                Phaser.Sound.Events.UNLOCKED,
                this.handleAudioUnlocked,
                this
            );
            return;
        }

        this.ambienceSound.play();
    }

    private handleAudioUnlocked() {
        if (!this.ambienceSound.isPlaying) {
            this.ambienceSound.play();
        }
        if (this.pendingStep) {
            this.pendingStep = false;
            this.stepSound.play();
        }
        if (this.pendingStinger) {
            this.pendingStinger = false;
            this.playOneShot(GAME_SETTINGS.audio.stingerKey, GAME_SETTINGS.audio.stingerVolume);
        }
        for (const pendingSound of this.pendingSounds.splice(0)) {
            this.playOneShot(
                pendingSound.key,
                pendingSound.volume,
                pendingSound.rate
            );
        }
    }

    private playStep() {
        if (this.sound.locked) {
            this.pendingStep = true;
            return;
        }
        this.stepSound.play();
    }

    private shutdownAudio() {
        this.sound.off(
            Phaser.Sound.Events.UNLOCKED,
            this.handleAudioUnlocked,
            this
        );
        this.ambienceSound?.stop();
        this.ambienceSound?.destroy();
        this.stepSound?.stop();
        this.stepSound?.destroy();
    }

    update(time: number, delta: number) {
        this.updateStaticGrain(delta);
        if (this.isGameOver || this.isLevelTransitioning) {
            return;
        }

        this.maze.updateRendering(delta);
        this.player.update(time);
        this.enemies.forEach(enemy => enemy.update(time));
        this.updateEnemySightEffects();
        if (
            this.enemies.some(enemy =>
                enemy.position.row === this.player.position.row &&
                enemy.position.column === this.player.position.column
            )
        ) {
            this.handlePlayerHit();
            return;
        }
        if (this.maze.isExitAt(this.player.position)) {
            const nextLevelIndex = (this.currentLevelIndex + 1) % levels.length;
            this.beginLevelTransition(nextLevelIndex);
            return;
        }

        const target = this.getCameraTarget();
        const lerp = 1 - Math.exp(-delta / GAME_SETTINGS.camera.smoothingMs);
        this.cameraFocusX = Phaser.Math.Linear(this.cameraFocusX, target.x, lerp);
        this.cameraFocusY = Phaser.Math.Linear(this.cameraFocusY, target.y, lerp);
        this.cameras.main.centerOn(this.cameraFocusX, this.cameraFocusY);
    }

    private getCameraTarget() {
        const target = {
            x: Phaser.Math.Linear(
                this.maze.centerX,
                this.player.x,
                GAME_SETTINGS.camera.playerBias
            ),
            y: Phaser.Math.Linear(
                this.maze.centerY,
                this.player.y,
                GAME_SETTINGS.camera.playerBias
            )
        };
        let totalWeight = 1;

        for (const enemy of this.enemies) {
            if (!enemy.canSeePlayer()) {
                continue;
            }

            const weight = GAME_SETTINGS.camera.enemyInfluenceWeight;
            target.x += enemy.x * weight;
            target.y += enemy.y * weight;
            totalWeight += weight;
        }

        return {
            x: target.x / totalWeight,
            y: target.y / totalWeight
        };
    }

    private createEnemySightVignette(): Phaser.GameObjects.Image {
        const key = "enemy-sight-vignette";
        if (!this.textures.exists(key)) {
            const texture = this.textures.createCanvas(
                key,
                GAME_SETTINGS.viewport.width,
                GAME_SETTINGS.viewport.height
            );
            if (!texture) {
                throw new Error("Unable to create the enemy sight vignette texture.");
            }

            const { width, height, context } = texture;
            const centerX = width / 2;
            const centerY = height / 2;
            const gradient = context.createRadialGradient(
                centerX,
                centerY,
                Math.min(width, height) * 0.18,
                centerX,
                centerY,
                Math.max(width, height) * 0.72
            );
            gradient.addColorStop(0, "rgba(120, 0, 0, 0)");
            gradient.addColorStop(0.55, "rgba(150, 0, 0, 0.5)");
            gradient.addColorStop(1, "rgba(180, 0, 0, 0.9)");
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
            texture.refresh();
        }

        return this.add.image(0, 0, key)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDisplaySize(GAME_SETTINGS.viewport.width, GAME_SETTINGS.viewport.height)
            .setDepth(10000)
            .setAlpha(0);
    }

    private createStaticOverlay(showLevelTransition: boolean): Phaser.GameObjects.Image {
        const key = "static-grain";
        const texture = this.textures.exists(key)
            ? this.getStaticTexture(key)
            : this.textures.createCanvas(
                key,
                GAME_SETTINGS.viewport.width / 2.0,
                GAME_SETTINGS.viewport.height / 2.0
            );
        if (!texture) {
            throw new Error("Unable to create the static grain texture.");
        }
        this.staticTexture = texture;
        this.staticColor = showLevelTransition ? "gray" : "red";
        this.refreshStaticTexture();

        return this.add.image(0, 0, key)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDisplaySize(GAME_SETTINGS.viewport.width, GAME_SETTINGS.viewport.height)
            .setDepth(10001)
            .setAlpha(showLevelTransition ? 1 : 0);
    }

    private getStaticTexture(key: string): Phaser.Textures.CanvasTexture {
        const texture = this.textures.get(key);
        if (!(texture instanceof Phaser.Textures.CanvasTexture)) {
            throw new Error(`Texture '${key}' exists but is not a canvas texture.`);
        }
        return texture;
    }

    private refreshStaticTexture() {
        const { width, height, context } = this.staticTexture;
        const imageData = context.createImageData(width, height);
        for (let pixel = 0; pixel < imageData.data.length; pixel += 4) {
            const shade = Phaser.Math.Between(80, 255);
            imageData.data[pixel] =
                this.staticColor === "gray" ? shade / 4.0 : shade;
            imageData.data[pixel + 1] =
                this.staticColor === "gray" ? shade / 4.0 : shade / 5.0;
            imageData.data[pixel + 2] =
                this.staticColor === "gray" ? shade / 4.0 : shade / 5.0;
            imageData.data[pixel + 3] = Phaser.Math.Between(255, 255);
        }
        context.putImageData(imageData, 0, 0);
        this.staticTexture.refresh();
    }

    private setStaticColor(color: "red" | "gray") {
        if (this.staticColor === color) {
            return;
        }
        this.staticColor = color;
        this.refreshStaticTexture();
    }

    private updateStaticGrain(delta: number) {
        if (this.staticOverlay.alpha <= 0) {
            return;
        }

        this.staticRefreshElapsed += delta;
        if (this.staticRefreshElapsed >= GAME_SETTINGS.effects.staticRefreshMs) {
            this.staticRefreshElapsed %= GAME_SETTINGS.effects.staticRefreshMs;
            this.refreshStaticTexture();
        }
    }

    private updateEnemySightEffects(
        enemySightActive = this.enemies.some(enemy => enemy.canSeePlayer())
    ) {
        if (enemySightActive === this.enemySightActive) {
            return;
        }

        this.enemySightActive = enemySightActive;
        if (enemySightActive && !this.isShowingLevelTransitionStatic) {
            this.setStaticColor("red");
        }
        this.tweens.killTweensOf(this.enemySightVignette);
        this.tweens.add({
            targets: this.enemySightVignette,
            alpha: enemySightActive
                ? GAME_SETTINGS.effects.enemySightVignetteAlpha
                : 0,
            duration: GAME_SETTINGS.effects.vignetteTransitionMs,
            ease: GAME_SETTINGS.effects.vignetteEase
        });
        if (!this.isShowingLevelTransitionStatic) {
            this.tweens.killTweensOf(this.staticOverlay);
            this.tweens.add({
                targets: this.staticOverlay,
                alpha: enemySightActive ? GAME_SETTINGS.effects.sightStaticAlpha : 0,
                duration: GAME_SETTINGS.effects.vignetteTransitionMs,
                ease: GAME_SETTINGS.effects.vignetteEase
            });
        }

        this.tweens.killTweensOf(this.cameras.main);
        this.tweens.add({
            targets: this.cameras.main,
            zoom: enemySightActive
                ? GAME_SETTINGS.camera.enemySightZoom
                : GAME_SETTINGS.camera.zoom,
            duration: GAME_SETTINGS.camera.zoomTransitionMs,
            ease: GAME_SETTINGS.camera.zoomEase
        });
    }

    private playStinger() {
        const now = this.time.now;
        if (now - this.lastStingerAt < GAME_SETTINGS.audio.stingerCooldownMs) {
            return;
        }
        this.lastStingerAt = now;

        if (this.sound.locked) {
            this.pendingStinger = true;
            return;
        }
        this.playOneShot(GAME_SETTINGS.audio.stingerKey, GAME_SETTINGS.audio.stingerVolume);
    }

    private playOneShot(key: string, volume: number, rate: number = 1.0) {
        if (this.sound.locked) {
            this.pendingSounds.push({ key, volume, rate });
            return;
        }
        this.sound.play(key, { volume, rate });
    }

    private handlePlayerHit() {
        this.isGameOver = true;
        this.setStaticColor("red");
        this.playOneShot(GAME_SETTINGS.audio.hitKey, GAME_SETTINGS.audio.hitVolume);
        this.playOneShot(GAME_SETTINGS.audio.failKey, GAME_SETTINGS.audio.failVolume, 2.0);
        this.updateEnemySightEffects(false);
        this.tweens.killTweensOf(this.staticOverlay);
        this.staticOverlay.setAlpha(GAME_SETTINGS.effects.hitStaticAlpha);

        this.time.delayedCall(GAME_SETTINGS.effects.staticHoldMs, () => {
            this.resetGame()
            this.tweens.add({
                targets: this.staticOverlay,
                alpha: 0,
                duration: GAME_SETTINGS.effects.staticFadeOutMs,
                ease: GAME_SETTINGS.effects.vignetteEase
            });
        });
    }

    private resetGame() {
        this.maze.reset();
        this.player.reset();
        this.enemies.forEach(enemy => enemy.reset());
        this.isGameOver = false;
        this.enemySightActive = false;
        this.enemySightVignette.setAlpha(0);
        this.tweens.killTweensOf(this.enemySightVignette);
        this.tweens.killTweensOf(this.staticOverlay);
        this.tweens.killTweensOf(this.cameras.main);

        this.cameras.main.setZoom(GAME_SETTINGS.camera.zoom);
        const cameraTarget = this.getCameraTarget();
        this.cameraFocusX = cameraTarget.x;
        this.cameraFocusY = cameraTarget.y;
        this.cameras.main.centerOn(cameraTarget.x, cameraTarget.y);

        this.playOneShot(GAME_SETTINGS.audio.spawnKey, GAME_SETTINGS.audio.spawnVolume);
        this.playOneShot(GAME_SETTINGS.audio.bleepKey, GAME_SETTINGS.audio.bleepVolume);
    }

    private beginLevelTransition(nextLevelIndex: number) {
        this.isLevelTransitioning = true;
        this.isShowingLevelTransitionStatic = true;
        this.setStaticColor("gray");
        this.tweens.killTweensOf(this.staticOverlay);
        this.staticOverlay.setAlpha(1);
        this.playOneShot(
            GAME_SETTINGS.audio.spawnKey,
            GAME_SETTINGS.audio.spawnVolume
        );
        this.time.delayedCall(
            GAME_SETTINGS.effects.levelTransitionStaticMs,
            () => this.scene.restart({
                levelIndex: nextLevelIndex,
                showLevelTransition: true
            })
        );
    }

    private playEnemyStep(position: { row: number; column: number }) {
        const playerPosition = this.player.position;
        const deltaRow = position.row - playerPosition.row;
        const deltaColumn = position.column - playerPosition.column;
        const distance = Math.hypot(deltaRow, deltaColumn);
        const radius = GAME_SETTINGS.audio.enemyStepRadiusCells;
        if (distance >= radius || this.sound.locked) {
            return;
        }

        const volume = GAME_SETTINGS.audio.enemyStepVolume * (1 - distance / radius);
        const pan = Phaser.Math.Clamp(deltaColumn / radius, -1, 1);
        this.sound.play(GAME_SETTINGS.audio.stepKey, { volume, pan });
    }
}
