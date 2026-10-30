import Phaser from "phaser";
import { GAME_SETTINGS, type KeySymbol, type LockSymbol } from "../settings";
import type { GridPosition, LevelGrid } from "./maze";

type CellVisual = {
  tile: Phaser.GameObjects.Rectangle;
  decoration: Phaser.GameObjects.Container | null;
  color: number;
  baseAlpha: number;
  currentAlpha: number;
  targetAlpha: number;
  currentDecorationAlpha: number;
  targetDecorationAlpha: number;
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
  private readonly lockPositions: GridPosition[] = [];
  private readonly tileSize: number;
  private readonly offsetX: number;
  private readonly offsetY: number;

  constructor(
    scene: Phaser.Scene,
    grid: LevelGrid,
    tileSize: number,
    offsetX: number,
    offsetY: number,
  ) {
    this.scene = scene;
    this.grid = grid;
    grid.forEach((row, rowIndex) => {
      row.forEach((symbol, columnIndex) => {
        if (this.isLock(symbol)) {
          this.lockPositions.push({ row: rowIndex, column: columnIndex });
        }
      });
    });
    this.tileSize = tileSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.visibleCells = grid.map((row) => row.map(() => false));
    this.createTiles();
    this.createParticles();
  }

  setVisibility(
    visible: boolean[][],
    playerPosition: GridPosition,
    collectedKeys: ReadonlySet<string>,
    unlockedLocks: ReadonlySet<string>,
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
          : this.getFloorColor(this.grid[rowIndex][columnIndex]);
        const isIlluminated = visible[rowIndex][columnIndex] && !isCollected;
        const distance = Math.hypot(
          rowIndex - playerPosition.row,
          columnIndex - playerPosition.column,
        );
        const playerBrightness = Math.max(
          GAME_SETTINGS.rendering.minimumBrightness,
          1 - distance / GAME_SETTINGS.rendering.darknessDistance,
        );
        const gateLight = this.getGateLightBrightness(position, unlockedLocks);
        const brightness = Math.max(playerBrightness, gateLight);

        cell.baseAlpha = isUnlockedLock
          ? GAME_SETTINGS.maze.openedLockAlpha
          : this.isVent(this.grid[rowIndex][columnIndex])
            ? GAME_SETTINGS.maze.ventAlpha
            : 1;
        cell.targetAlpha = isIlluminated ? cell.baseAlpha : 0;
        cell.targetDecorationAlpha =
          isIlluminated && !isCollected && !isUnlockedLock ? cell.baseAlpha : 0;
        cell.targetBrightness = brightness;
        const colorChanged = cell.color !== targetColor;
        cell.color = targetColor;

        if (cell.targetAlpha > 0) {
          cell.tile.setVisible(true);
        }
        if (cell.targetDecorationAlpha > 0) {
          if (cell.currentDecorationAlpha === 0) {
            if (cell.decoration) {
              this.scene.tweens.killTweensOf(cell.decoration);
            }
            cell.decoration?.setScale(1);
          }
          cell.decoration?.setVisible(true);
        }
        if (
          colorChanged ||
          Math.abs(cell.currentAlpha - cell.targetAlpha) > 0.01 ||
          Math.abs(cell.currentDecorationAlpha - cell.targetDecorationAlpha) > 0.01 ||
          Math.abs(cell.currentBrightness - cell.targetBrightness) > 0.01
        ) {
          this.transitioningCells.add(cell);
        } else {
          this.transitioningCells.delete(cell);
        }
      });
    });
  }

  animateMarkerInteraction(position: GridPosition) {
    const decoration = this.cells[position.row]?.[position.column]?.decoration;
    if (!decoration) {
      return;
    }

    this.scene.tweens.add({
      targets: decoration,
      scale: 0,
      duration: GAME_SETTINGS.maze.markerShrinkDurationMs,
      ease: "Back.easeIn",
      onComplete: () => {
        const cell = this.cells[position.row]?.[position.column];
        if (cell?.targetDecorationAlpha === 0) {
          decoration.setVisible(false);
        }
      },
    });
  }

  update(delta: number) {
    this.updateCellTransitions(delta);

    this.particleVisibilityElapsed += delta;
    if (this.particleVisibilityElapsed >= GAME_SETTINGS.rendering.particleVisibilityIntervalMs) {
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
          this.getFloorColor(symbol),
        );
        if (this.isVent(symbol)) {
          tile.setDepth(10);
        }
        const decoration = this.createDecoration(symbol, x, y);
        const baseAlpha = this.isVent(symbol) ? GAME_SETTINGS.maze.ventAlpha : 1;
        const cell: CellVisual = {
          tile: tile.setVisible(false).setAlpha(0),
          decoration,
          color: this.getFloorColor(symbol),
          baseAlpha,
          currentAlpha: 0,
          targetAlpha: 0,
          currentDecorationAlpha: 0,
          targetDecorationAlpha: 0,
          currentBrightness: GAME_SETTINGS.rendering.minimumBrightness,
          targetBrightness: GAME_SETTINGS.rendering.minimumBrightness,
        };
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
      const particle = this.scene.add
        .circle(
          startX,
          startY,
          GAME_SETTINGS.rendering.particleRadius,
          GAME_SETTINGS.rendering.particleColor,
          Phaser.Math.FloatBetween(
            GAME_SETTINGS.rendering.particleMinAlpha,
            GAME_SETTINGS.rendering.particleMaxAlpha,
          ),
        )
        .setDepth(1)
        .setVisible(false);

      const drift = GAME_SETTINGS.rendering.particleDriftDistance;
      const targetX = Phaser.Math.Clamp(
        startX + Phaser.Math.FloatBetween(-drift, drift),
        this.offsetX,
        this.offsetX + width,
      );
      const targetY = Phaser.Math.Clamp(
        startY + Phaser.Math.FloatBetween(-drift, drift),
        this.offsetY,
        this.offsetY + height,
      );
      this.scene.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        duration: Phaser.Math.Between(
          GAME_SETTINGS.rendering.particleMinDriftDurationMs,
          GAME_SETTINGS.rendering.particleMaxDriftDurationMs,
        ),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.particles.push({ object: particle, visible: false });
    }
  }

  private updateCellTransitions(delta: number) {
    const fadeTimeConstant = GAME_SETTINGS.rendering.visibilityFadeMs / 3;
    const amount = 1 - Math.exp(-delta / fadeTimeConstant);

    for (const cell of this.transitioningCells) {
      cell.currentAlpha = Phaser.Math.Linear(cell.currentAlpha, cell.targetAlpha, amount);
      cell.currentDecorationAlpha = Phaser.Math.Linear(
        cell.currentDecorationAlpha,
        cell.targetDecorationAlpha,
        amount,
      );
      cell.currentBrightness = Phaser.Math.Linear(
        cell.currentBrightness,
        cell.targetBrightness,
        amount,
      );
      cell.tile
        .setAlpha(cell.currentAlpha)
        .setFillStyle(this.scaleColor(cell.color, cell.currentBrightness));
      cell.decoration?.setAlpha(cell.currentDecorationAlpha);

      const alphaSettled = Math.abs(cell.currentAlpha - cell.targetAlpha) < 0.01;
      const decorationAlphaSettled =
        Math.abs(cell.currentDecorationAlpha - cell.targetDecorationAlpha) < 0.01;
      const brightnessSettled = Math.abs(cell.currentBrightness - cell.targetBrightness) < 0.01;
      if (alphaSettled && decorationAlphaSettled && brightnessSettled) {
        cell.currentAlpha = cell.targetAlpha;
        cell.currentDecorationAlpha = cell.targetDecorationAlpha;
        cell.currentBrightness = cell.targetBrightness;
        cell.tile.setAlpha(cell.currentAlpha);
        cell.decoration?.setAlpha(cell.currentDecorationAlpha);
        if (cell.currentAlpha === 0) {
          cell.tile.setVisible(false);
        }
        if (cell.currentDecorationAlpha === 0) {
          cell.decoration?.setVisible(false);
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

  private startParticleDrift(particle: Phaser.GameObjects.Arc, cell: GridPosition) {
    this.scene.tweens.killTweensOf(particle);
    const target = this.randomPointInCell(cell);
    this.scene.tweens.add({
      targets: particle,
      x: target.x,
      y: target.y,
      duration: Phaser.Math.Between(
        GAME_SETTINGS.rendering.particleMinDriftDurationMs,
        GAME_SETTINGS.rendering.particleMaxDriftDurationMs,
      ),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private randomPointInCell(position: GridPosition) {
    const center = this.cellCenter(position.row, position.column);
    const margin = Math.min(GAME_SETTINGS.rendering.particleDriftDistance, this.tileSize * 0.25);
    return {
      x: Phaser.Math.FloatBetween(center.x - margin, center.x + margin),
      y: Phaser.Math.FloatBetween(center.y - margin, center.y + margin),
    };
  }

  private cellCenter(row: number, column: number) {
    return {
      x: this.offsetX + column * this.tileSize + this.tileSize / 2,
      y: this.offsetY + row * this.tileSize + this.tileSize / 2,
    };
  }

  private scaleColor(color: number, brightness: number): number {
    const red = Math.round(((color >> 16) & 0xff) * brightness);
    const green = Math.round(((color >> 8) & 0xff) * brightness);
    const blue = Math.round((color & 0xff) * brightness);
    return (red << 16) | (green << 8) | blue;
  }

  private getFloorColor(symbol: string): number {
    switch (symbol) {
      case GAME_SETTINGS.maze.symbols.wall:
        return GAME_SETTINGS.maze.wallColor;
      case GAME_SETTINGS.maze.symbols.vent:
        return GAME_SETTINGS.maze.ventColor;
      default:
        return GAME_SETTINGS.maze.floorColor;
    }
  }

  private createDecoration(
    symbol: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container | null {
    if (symbol === GAME_SETTINGS.maze.symbols.exit) {
      return this.createExitMarker(x, y);
    }
    if (this.isKey(symbol)) {
      return this.createKeyMarker(x, y, symbol);
    }
    if (this.isLock(symbol)) {
      return this.createGateMarker(x, y, symbol);
    }
    return null;
  }

  private createExitMarker(x: number, y: number) {
    const container = this.scene.add.container(x, y).setDepth(3);
    const size = this.tileSize - GAME_SETTINGS.maze.tileGap;
    const border = this.scene.add.graphics();
    border.lineStyle(Math.max(2, this.tileSize * 0.055), GAME_SETTINGS.maze.exitBorderColor, 1);
    border.strokeRect(-size / 2, -size / 2, size, size);
    container.add(border);
    return container.setVisible(false).setAlpha(0);
  }

  private createKeyMarker(x: number, y: number, key: KeySymbol) {
    const container = this.scene.add.container(x, y).setDepth(3);
    const glow = this.scene.add.container(0, 0);
    const size = this.tileSize * 0.23;
    const points = this.diamondPoints(size);
    for (const [scale, alpha] of [
      [1.8, 0.1],
      [1.4, 0.28],
    ]) {
      const glowShape = this.scene.add.graphics();
      glowShape.fillStyle(this.getKeyColor(key), GAME_SETTINGS.maze.keyGlowAlpha * alpha);
      glowShape.fillPoints(this.diamondPoints(size * scale), true);
      glow.add(glowShape);
    }

    const face = this.scene.add.graphics();
    face.fillStyle(this.getKeyColor(key), 1);
    face.fillPoints(points, true);
    face.lineStyle(Math.max(1, this.tileSize * 0.025), 0xffffff, 0.9);
    face.strokePoints(points, true);

    const highlight = this.scene.add.graphics();
    highlight.fillStyle(0xffffff, 0.48);
    highlight.fillPoints(this.diamondPoints(size * 0.36, -size * 0.1), true);
    container.add([glow, face, highlight]);
    this.scene.tweens.add({
      targets: container,
      y: y - this.tileSize * GAME_SETTINGS.maze.keyHoverDistance,
      duration: GAME_SETTINGS.maze.keyHoverDurationMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.55, to: 1 },
      duration: GAME_SETTINGS.maze.keyHoverDurationMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return container.setVisible(false).setAlpha(0);
  }

  private createGateMarker(x: number, y: number, lock: LockSymbol) {
    const container = this.scene.add.container(x, y).setDepth(3);
    const color = this.getLockColor(lock);
    const width = this.tileSize * 0.5;
    const height = this.tileSize * 0.62;
    const glow = this.scene.add.graphics();
    glow.lineStyle(
      Math.max(6, this.tileSize * 0.2),
      color,
      GAME_SETTINGS.maze.lockGlowAlpha * 0.12,
    );
    glow.strokeRoundedRect(-width / 2, -height / 2, width, height, this.tileSize * 0.08);
    glow.lineStyle(Math.max(3, this.tileSize * 0.1), color, GAME_SETTINGS.maze.lockGlowAlpha * 0.3);
    glow.strokeRoundedRect(-width / 2, -height / 2, width, height, this.tileSize * 0.08);

    const frame = this.scene.add.graphics();
    frame.fillStyle(0x101014, 0.94);
    frame.fillRoundedRect(-width / 2, -height / 2, width, height, this.tileSize * 0.08);
    frame.lineStyle(Math.max(2, this.tileSize * 0.035), color, 1);
    frame.strokeRoundedRect(-width / 2, -height / 2, width, height, this.tileSize * 0.08);
    frame.fillStyle(color, 0.95);
    const barWidth = this.tileSize * 0.065;
    for (const offset of [-0.28, 0, 0.28]) {
      frame.fillRoundedRect(
        offset * width - barWidth / 2,
        -height * 0.34,
        barWidth,
        height * 0.68,
        barWidth / 2,
      );
    }
    container.add([glow, frame]);
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.68, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return container.setVisible(false).setAlpha(0);
  }

  private diamondPoints(size: number, offsetY = 0) {
    return [
      new Phaser.Math.Vector2(0, -size + offsetY),
      new Phaser.Math.Vector2(size, offsetY),
      new Phaser.Math.Vector2(0, size + offsetY),
      new Phaser.Math.Vector2(-size, offsetY),
    ];
  }

  private getGateLightBrightness(position: GridPosition, unlockedLocks: ReadonlySet<string>) {
    let brightness: number = GAME_SETTINGS.rendering.minimumBrightness;
    const radius = GAME_SETTINGS.maze.lockLightRadiusCells;
    for (const lockPosition of this.lockPositions) {
      if (unlockedLocks.has(this.positionId(lockPosition))) {
        continue;
      }

      const distance = Math.hypot(
        position.row - lockPosition.row,
        position.column - lockPosition.column,
      );
      const falloff = Phaser.Math.Clamp(1 - distance / radius, 0, 1);
      const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
      brightness = Math.max(brightness, GAME_SETTINGS.maze.lockLightIntensity * smoothFalloff);
    }
    return brightness;
  }

  private getKeyColor(key: KeySymbol): number {
    return GAME_SETTINGS.maze.keyColors[key];
  }

  private getLockColor(lock: LockSymbol): number {
    return GAME_SETTINGS.maze.lockColors[lock];
  }

  private isVent(symbol: string): boolean {
    return symbol === GAME_SETTINGS.maze.symbols.vent;
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
