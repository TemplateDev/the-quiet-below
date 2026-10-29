import Phaser from "phaser";
import { GAME_SETTINGS, type KeySymbol, type LockSymbol } from "../settings";

export interface GridPosition {
    row: number;
    column: number;
}

export type LevelGrid = readonly (readonly string[])[];

export default class Maze {
    private readonly tiles: Phaser.GameObjects.Rectangle[][] = [];
    private readonly visibleCells: boolean[][];
    private readonly unlockedLocks = new Set<string>();
    private readonly collectedKeys = new Set<string>();
    private readonly tileSize: number;
    private readonly offsetX: number;
    private readonly offsetY: number;
    private readonly start: GridPosition;
    private readonly grid: LevelGrid;
    readonly playerRadius: number;
    readonly centerX: number;
    readonly centerY: number;

    constructor(
        scene: Phaser.Scene,
        grid: LevelGrid
    ) {
        this.grid = grid;
        const rows = grid.length;
        const columns = grid[0]?.length ?? 0;
        if (rows === 0 || columns === 0 || grid.some(row => row.length !== columns)) {
            throw new Error("Maze levels must be non-empty rectangular grids.");
        }
        this.visibleCells = grid.map(row => row.map(() => false));

        const startSymbol = GAME_SETTINGS.maze.symbols.start;
        const startRow = grid.findIndex(row => row.includes(startSymbol));
        const startColumn = startRow === -1 ? -1 : grid[startRow].indexOf(startSymbol);
        if (startRow === -1 || startColumn === -1) {
            throw new Error(`Maze level must contain a start cell ('${startSymbol}').`);
        }
        this.start = { row: startRow, column: startColumn };

        this.tileSize = Math.max(
            1,
            Math.min(
                GAME_SETTINGS.maze.maxTileSize,
                scene.scale.width / columns,
                scene.scale.height / rows
            )
        );
        this.playerRadius = this.tileSize * 0.3;
        const gridWidth = columns * this.tileSize;
        const gridHeight = rows * this.tileSize;
        this.offsetX = (scene.scale.width - gridWidth) / 2;
        this.offsetY = (scene.scale.height - gridHeight) / 2;
        this.centerX = this.offsetX + gridWidth / 2;
        this.centerY = this.offsetY + gridHeight / 2;

        grid.forEach((row, rowIndex) => {
            this.tiles[rowIndex] = row.map((cell, columnIndex) => {
                const { x, y } = this.cellCenter(rowIndex, columnIndex);
                const tile = scene.add.rectangle(
                    x,
                    y,
                    this.tileSize - GAME_SETTINGS.maze.tileGap,
                    this.tileSize - GAME_SETTINGS.maze.tileGap,
                    this.getCellColor(cell)
                );
                if (cell === GAME_SETTINGS.maze.symbols.veil) {
                    tile.setAlpha(GAME_SETTINGS.maze.veilAlpha).setDepth(10);
                } else if (this.isKey(cell)) {
                    tile.setFillStyle(this.getKeyColor(cell));
                } else if (this.isLock(cell)) {
                    tile.setFillStyle(this.getLockColor(cell));
                }
                return tile;
            });
        });
    }

    get startPosition(): GridPosition {
        return { ...this.start };
    }

    canPlayerOccupy(row: number, column: number): boolean {
        const cell = this.grid[row]?.[column];
        return cell !== undefined &&
            cell !== GAME_SETTINGS.maze.symbols.wall &&
            !this.isLockedCell(row, column);
    }

    canEnemyOccupy(row: number, column: number): boolean {
        const cell = this.grid[row]?.[column];
        return cell !== undefined &&
            cell !== GAME_SETTINGS.maze.symbols.wall &&
            cell !== GAME_SETTINGS.maze.symbols.veil &&
            !this.isLockedCell(row, column);
    }

    collectKeyAt(position: GridPosition): string | null {
        const key = this.grid[position.row]?.[position.column];
        const id = this.positionId(position);
        if (!key || !this.isKey(key) || this.collectedKeys.has(id)) {
            return null;
        }

        this.collectedKeys.add(id);
        this.tiles[position.row][position.column].setVisible(false);
        return key;
    }

    unlockAdjacentLocks(position: GridPosition, keys: ReadonlySet<string>): boolean {
        const neighbors = [
            { row: position.row - 1, column: position.column },
            { row: position.row + 1, column: position.column },
            { row: position.row, column: position.column - 1 },
            { row: position.row, column: position.column + 1 }
        ];
        let unlockedAny = false;

        for (const neighbor of neighbors) {
            const lock = this.grid[neighbor.row]?.[neighbor.column];
            if (!lock || !this.isLock(lock) || !keys.has(this.keyForLock(lock))) {
                continue;
            }

            const id = this.positionId(neighbor);
            if (this.unlockedLocks.has(id)) {
                continue;
            }

            this.unlockedLocks.add(id);
            this.tiles[neighbor.row][neighbor.column]
                .setFillStyle(GAME_SETTINGS.maze.openedLockColor)
                .setAlpha(GAME_SETTINGS.maze.openedLockAlpha);
            unlockedAny = true;
        }

        if (unlockedAny) {
            this.updateVisibility(position);
        }
        return unlockedAny;
    }

    getMarkerPositions(marker: string): GridPosition[] {
        const positions: GridPosition[] = [];
        this.grid.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                if (cell === marker) {
                    positions.push({ row: rowIndex, column: columnIndex });
                }
            });
        });
        return positions;
    }

    findPath(from: GridPosition, to: GridPosition): GridPosition[] | null {
        if (
            !this.canEnemyOccupy(from.row, from.column) ||
            !this.canEnemyOccupy(to.row, to.column)
        ) {
            return null;
        }

        const columns = this.grid[0].length;
        const toIndex = to.row * columns + to.column;
        const fromIndex = from.row * columns + from.column;
        const previous = new Map<number, number | null>([[fromIndex, null]]);
        const queue = [fromIndex];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (let cursor = 0; cursor < queue.length; cursor++) {
            const current = queue[cursor];
            if (current === toIndex) {
                break;
            }

            const row = Math.floor(current / columns);
            const column = current % columns;
            for (const [rowOffset, columnOffset] of directions) {
                const nextRow = row + rowOffset;
                const nextColumn = column + columnOffset;
                const nextIndex = nextRow * columns + nextColumn;

                if (
                    !this.canEnemyOccupy(nextRow, nextColumn) ||
                    previous.has(nextIndex)
                ) {
                    continue;
                }

                previous.set(nextIndex, current);
                queue.push(nextIndex);
            }
        }

        if (!previous.has(toIndex)) {
            return null;
        }

        const path: GridPosition[] = [];
        let current: number | null = toIndex;
        while (current !== null && current !== fromIndex) {
            path.push({
                row: Math.floor(current / columns),
                column: current % columns
            });
            current = previous.get(current) ?? null;
        }
        return path.reverse();
    }

    findPathToTarget(from: GridPosition, target: GridPosition): GridPosition[] | null {
        if (this.canEnemyOccupy(target.row, target.column)) {
            return this.findPath(from, target);
        }

        if (
            this.grid[target.row]?.[target.column] !== GAME_SETTINGS.maze.symbols.veil &&
            !this.isLockedCell(target.row, target.column)
        ) {
            return null;
        }

        const approaches = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([rowOffset, columnOffset]) => ({
                row: target.row + rowOffset,
                column: target.column + columnOffset
            }))
            .filter(position => this.canEnemyOccupy(position.row, position.column));

        let shortestPath: GridPosition[] | null = null;
        for (const approach of approaches) {
            const path = this.findPath(from, approach);
            if (path && (shortestPath === null || path.length < shortestPath.length)) {
                shortestPath = path;
            }
        }
        return shortestPath;
    }

    hasLineOfSight(from: GridPosition, to: GridPosition): boolean {
        let row = from.row;
        let column = from.column;
        const deltaRow = Math.abs(to.row - from.row);
        const deltaColumn = Math.abs(to.column - from.column);
        const rowStep = from.row < to.row ? 1 : -1;
        const columnStep = from.column < to.column ? 1 : -1;
        let error = deltaColumn - deltaRow;

        while (row !== to.row || column !== to.column) {
            const doubledError = 2 * error;
            if (doubledError > -deltaRow) {
                error -= deltaRow;
                column += columnStep;
            }
            if (doubledError < deltaColumn) {
                error += deltaColumn;
                row += rowStep;
            }

            if (row === to.row && column === to.column) {
                return true;
            }
            if (
                this.grid[row]?.[column] === GAME_SETTINGS.maze.symbols.wall ||
                this.grid[row]?.[column] === GAME_SETTINGS.maze.symbols.veil ||
                this.isLockedCell(row, column)
            ) {
                return false;
            }
        }
        return true;
    }

    isVisible(position: GridPosition): boolean {
        return this.visibleCells[position.row]?.[position.column] ?? false;
    }

    cellCenter(row: number, column: number) {
        return {
            x: this.offsetX + column * this.tileSize + this.tileSize / 2,
            y: this.offsetY + row * this.tileSize + this.tileSize / 2
        };
    }

    updateVisibility(position: GridPosition) {
        const maxVisibleCells = GAME_SETTINGS.maze.visibilityRayLength;
        const visible = this.grid.map(row => row.map(() => false));
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1]
        ];

        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            for (let columnOffset = -1; columnOffset <= 1; columnOffset++) {
                const row = position.row + rowOffset;
                const column = position.column + columnOffset;

                if (this.grid[row]?.[column] !== undefined) {
                    visible[row][column] = true;
                }
            }
        }

        for (const [rowStep, columnStep] of directions) {
            for (let distance = 1; distance < maxVisibleCells; distance++) {
                const row = position.row + rowStep * distance;
                const column = position.column + columnStep * distance;

                if (this.grid[row]?.[column] === undefined) {
                    break;
                }

                visible[row][column] = true;
                if (
                    this.grid[row][column] === GAME_SETTINGS.maze.symbols.wall ||
                    this.isLockedCell(row, column)
                ) {
                    break;
                }
            }
        }

        this.tiles.forEach((tileRow, rowIndex) => {
            tileRow.forEach((tile, columnIndex) => {
                tile.setVisible(
                    visible[rowIndex][columnIndex] &&
                    !this.collectedKeys.has(this.positionId({ row: rowIndex, column: columnIndex }))
                );
            });
        });
        this.visibleCells.forEach((row, rowIndex) => {
            row.forEach((_, columnIndex) => {
                this.visibleCells[rowIndex][columnIndex] = visible[rowIndex][columnIndex];
            });
        });
    }

    private isLockedCell(row: number, column: number): boolean {
        const id = this.positionId({ row, column });
        return this.isLock(this.grid[row]?.[column] ?? "") && !this.unlockedLocks.has(id);
    }

    private isKey(cell: string): cell is KeySymbol {
        return Object.hasOwn(GAME_SETTINGS.maze.keyColors, cell);
    }

    private isLock(cell: string): cell is LockSymbol {
        return Object.hasOwn(GAME_SETTINGS.maze.lockColors, cell);
    }

    private keyForLock(lock: LockSymbol): KeySymbol {
        const keyByLock: Record<LockSymbol, KeySymbol> = {
            "1": "a",
            "2": "b",
            "3": "c"
        };
        return keyByLock[lock];
    }

    private getCellColor(cell: string): number {
        switch (cell) {
            case GAME_SETTINGS.maze.symbols.wall: return GAME_SETTINGS.maze.wallColor;
            case GAME_SETTINGS.maze.symbols.start: return GAME_SETTINGS.maze.startColor;
            case GAME_SETTINGS.maze.symbols.exit: return GAME_SETTINGS.maze.exitColor;
            case GAME_SETTINGS.maze.symbols.veil: return GAME_SETTINGS.maze.veilColor;
            default: return GAME_SETTINGS.maze.floorColor;
        }
    }

    private getKeyColor(key: KeySymbol): number {
        return GAME_SETTINGS.maze.keyColors[key];
    }

    private getLockColor(lock: LockSymbol): number {
        return GAME_SETTINGS.maze.lockColors[lock];
    }

    private positionId(position: GridPosition): string {
        return `${position.row},${position.column}`;
    }
}
