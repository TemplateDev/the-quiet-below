import Phaser from "phaser";
import { GAME_SETTINGS, type KeySymbol, type LockSymbol } from "../settings";
import type { GridPosition, LevelGrid } from "./maze";

type CellVisual = {
    tile: Phaser.GameObjects.Rectangle;
    color: number;
    baseAlpha: number;
    currentAlpha: number;
    targetAlpha: number;
    currentBrightness: number;
    targetBrightness: number;
};

type AmbientParticle = {
    object: Phaser.GameObjects.Arc;
    visible: boolean;
};

export default class MazeRenderer {
    private readonly cells: CellVisual[][] = [];
    private readonly transitioningCells = new Set<CellVisual>();
    private readonly particles: AmbientParticle[] = [];
    private visibleCells: boolean[][];
    private particleVisibilityElapsed = 0;
    private readonly scene: Phaser.Scene;
    private readonly grid: LevelGrid;
    private readonly tileSize: number;
    private readonly offsetX: number;
    private readonly offsetY: number;

    constructor(
        scene: Phaser.Scene,
        grid: LevelGrid,
        tileSize: number,
        offsetX: number,
        offsetY: number
    ) {
        this.scene = scene;
        this.grid = grid;
        this.tileSize = tileSize;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.visibleCells = grid.map(row => row.map(() => false));
        this.createTiles();
        this.createParticles();
    }

    setVisibility(
        visible: boolean[][],
        playerPosition: GridPosition,
        collectedKeys: ReadonlySet<string>,
        unlockedLocks: ReadonlySet<string>
    ) {
        this.visibleCells = visible;
        this.cells.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                const position = { row: rowIndex, column: columnIndex };
                const id = this.positionId(position);
                const isCollected = collectedKeys.has(id);
                const isUnlockedLock =
                    this.isLock(this.grid[rowIndex][columnIndex]) && unlockedLocks.has(id);
                const targetColor = isUnlockedLock
                    ? GAME_SETTINGS.maze.openedLockColor
                    : this.getCellColor(this.grid[rowIndex][columnIndex]);
                const isIlluminated = visible[rowIndex][columnIndex] && !isCollected;
                const distance = Math.hypot(
                    rowIndex - playerPosition.row,
                    columnIndex - playerPosition.column
                );
                const brightness = Math.max(
                    GAME_SETTINGS.rendering.minimumBrightness,
                    1 - distance / GAME_SETTINGS.rendering.darknessDistance
                );

                cell.baseAlpha = isUnlockedLock
                    ? GAME_SETTINGS.maze.openedLockAlpha
                    : this.isVeil(this.grid[rowIndex][columnIndex])
                        ? GAME_SETTINGS.maze.veilAlpha
                        : 1;
                cell.targetAlpha = isIlluminated ? cell.baseAlpha : 0;
                cell.targetBrightness = brightness;
                const colorChanged = cell.color !== targetColor;
                cell.color = targetColor;

                if (cell.targetAlpha > 0) {
                    cell.tile.setVisible(true);
                }
                if (
                    colorChanged ||
                    Math.abs(cell.currentAlpha - cell.targetAlpha) > 0.01 ||
                    Math.abs(cell.currentBrightness - cell.targetBrightness) > 0.01
                ) {
                    this.transitioningCells.add(cell);
                } else {
                    this.transitioningCells.delete(cell);
                }
            });
        });
    }

    update(delta: number) {
        this.updateCellTransitions(delta);

        this.particleVisibilityElapsed += delta;
        if (
            this.particleVisibilityElapsed >=
            GAME_SETTINGS.rendering.particleVisibilityIntervalMs
        ) {
            this.particleVisibilityElapsed = 0;
            this.updateParticleVisibility();
        }
    }

    private createTiles() {
        this.grid.forEach((row, rowIndex) => {
            this.cells[rowIndex] = row.map((symbol, columnIndex) => {
                const { x, y } = this.cellCenter(rowIndex, columnIndex);
                const tile = this.scene.add.rectangle(
                    x,
                    y,
                    this.tileSize - GAME_SETTINGS.maze.tileGap,
                    this.tileSize - GAME_SETTINGS.maze.tileGap,
                    this.getCellColor(symbol)
                );
                if (this.isVeil(symbol)) {
                    tile.setDepth(10);
                }
                const baseAlpha = this.isVeil(symbol)
                    ? GAME_SETTINGS.maze.veilAlpha
                    : 1;
                const cell: CellVisual = {
                    tile: tile.setVisible(false).setAlpha(0),
                    color: this.getCellColor(symbol),
                    baseAlpha,
                    currentAlpha: 0,
                    targetAlpha: 0,
                    currentBrightness: GAME_SETTINGS.rendering.minimumBrightness,
                    targetBrightness: GAME_SETTINGS.rendering.minimumBrightness
                };
                if (this.isKey(symbol)) {
                    cell.color = this.getKeyColor(symbol);
                } else if (this.isLock(symbol)) {
                    cell.color = this.getLockColor(symbol);
                }
                tile.setFillStyle(cell.color);
                return cell;
            });
        });
    }

    private createParticles() {
        const width = this.grid[0].length * this.tileSize;
        const height = this.grid.length * this.tileSize;

        for (let index = 0; index < GAME_SETTINGS.rendering.particleCount; index++) {
            const startX = this.offsetX + Phaser.Math.FloatBetween(0, width);
            const startY = this.offsetY + Phaser.Math.FloatBetween(0, height);
            const particle = this.scene.add.circle(
                startX,
                startY,
                GAME_SETTINGS.rendering.particleRadius,
                GAME_SETTINGS.rendering.particleColor,
                Phaser.Math.FloatBetween(
                    GAME_SETTINGS.rendering.particleMinAlpha,
                    GAME_SETTINGS.rendering.particleMaxAlpha
                )
            ).setDepth(1).setVisible(false);

            const drift = GAME_SETTINGS.rendering.particleDriftDistance;
            const targetX = Phaser.Math.Clamp(
                startX + Phaser.Math.FloatBetween(-drift, drift),
                this.offsetX,
                this.offsetX + width
            );
            const targetY = Phaser.Math.Clamp(
                startY + Phaser.Math.FloatBetween(-drift, drift),
                this.offsetY,
                this.offsetY + height
            );
            this.scene.tweens.add({
                targets: particle,
                x: targetX,
                y: targetY,
                duration: Phaser.Math.Between(
                    GAME_SETTINGS.rendering.particleMinDriftDurationMs,
                    GAME_SETTINGS.rendering.particleMaxDriftDurationMs
                ),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
            });
            this.particles.push({ object: particle, visible: false });
        }
    }

    private updateCellTransitions(delta: number) {
        const fadeTimeConstant = GAME_SETTINGS.rendering.visibilityFadeMs / 3;
        const amount = 1 - Math.exp(-delta / fadeTimeConstant);

        for (const cell of this.transitioningCells) {
            cell.currentAlpha = Phaser.Math.Linear(
                cell.currentAlpha,
                cell.targetAlpha,
                amount
            );
            cell.currentBrightness = Phaser.Math.Linear(
                cell.currentBrightness,
                cell.targetBrightness,
                amount
            );
            cell.tile
                .setAlpha(cell.currentAlpha)
                .setFillStyle(this.scaleColor(cell.color, cell.currentBrightness));

            const alphaSettled = Math.abs(cell.currentAlpha - cell.targetAlpha) < 0.01;
            const brightnessSettled =
                Math.abs(cell.currentBrightness - cell.targetBrightness) < 0.01;
            if (alphaSettled && brightnessSettled) {
                cell.currentAlpha = cell.targetAlpha;
                cell.currentBrightness = cell.targetBrightness;
                cell.tile.setAlpha(cell.currentAlpha);
                if (cell.currentAlpha === 0) {
                    cell.tile.setVisible(false);
                }
                this.transitioningCells.delete(cell);
            }
        }
    }

    private updateParticleVisibility() {
        const visiblePositions: GridPosition[] = [];
        this.visibleCells.forEach((row, rowIndex) => {
            row.forEach((isVisible, columnIndex) => {
                if (isVisible) {
                    visiblePositions.push({ row: rowIndex, column: columnIndex });
                }
            });
        });

        if (visiblePositions.length === 0) {
            return;
        }

        for (const particle of this.particles) {
            const row = Math.floor((particle.object.y - this.offsetY) / this.tileSize);
            const column = Math.floor((particle.object.x - this.offsetX) / this.tileSize);
            const visible = this.visibleCells[row]?.[column] ?? false;
            if (!visible) {
                const position = Phaser.Utils.Array.GetRandom(visiblePositions);
                const point = this.randomPointInCell(position);
                particle.object.setPosition(point.x, point.y).setVisible(true);
                particle.visible = true;
                this.startParticleDrift(particle.object, position);
            }
        }
    }

    private startParticleDrift(
        particle: Phaser.GameObjects.Arc,
        cell: GridPosition
    ) {
        this.scene.tweens.killTweensOf(particle);
        const target = this.randomPointInCell(cell);
        this.scene.tweens.add({
            targets: particle,
            x: target.x,
            y: target.y,
            duration: Phaser.Math.Between(
                GAME_SETTINGS.rendering.particleMinDriftDurationMs,
                GAME_SETTINGS.rendering.particleMaxDriftDurationMs
            ),
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });
    }

    private randomPointInCell(position: GridPosition) {
        const center = this.cellCenter(position.row, position.column);
        const margin = Math.min(
            GAME_SETTINGS.rendering.particleDriftDistance,
            this.tileSize * 0.25
        );
        return {
            x: Phaser.Math.FloatBetween(center.x - margin, center.x + margin),
            y: Phaser.Math.FloatBetween(center.y - margin, center.y + margin)
        };
    }

    private cellCenter(row: number, column: number) {
        return {
            x: this.offsetX + column * this.tileSize + this.tileSize / 2,
            y: this.offsetY + row * this.tileSize + this.tileSize / 2
        };
    }

    private scaleColor(color: number, brightness: number): number {
        const red = Math.round(((color >> 16) & 0xff) * brightness);
        const green = Math.round(((color >> 8) & 0xff) * brightness);
        const blue = Math.round((color & 0xff) * brightness);
        return (red << 16) | (green << 8) | blue;
    }

    private getCellColor(symbol: string): number {
        switch (symbol) {
            case GAME_SETTINGS.maze.symbols.wall: return GAME_SETTINGS.maze.wallColor;
            case GAME_SETTINGS.maze.symbols.start: return GAME_SETTINGS.maze.startColor;
            case GAME_SETTINGS.maze.symbols.exit: return GAME_SETTINGS.maze.exitColor;
            case GAME_SETTINGS.maze.symbols.veil: return GAME_SETTINGS.maze.veilColor;
            default:
                if (this.isKey(symbol)) return this.getKeyColor(symbol);
                if (this.isLock(symbol)) return this.getLockColor(symbol);
                return GAME_SETTINGS.maze.floorColor;
        }
    }

    private getKeyColor(key: KeySymbol): number {
        return GAME_SETTINGS.maze.keyColors[key];
    }

    private getLockColor(lock: LockSymbol): number {
        return GAME_SETTINGS.maze.lockColors[lock];
    }

    private isVeil(symbol: string): boolean {
        return symbol === GAME_SETTINGS.maze.symbols.veil;
    }

    private isKey(symbol: string): symbol is KeySymbol {
        return Object.hasOwn(GAME_SETTINGS.maze.keyColors, symbol);
    }

    private isLock(symbol: string): symbol is LockSymbol {
        return Object.hasOwn(GAME_SETTINGS.maze.lockColors, symbol);
    }

    private positionId(position: GridPosition): string {
        return `${position.row},${position.column}`;
    }
}
