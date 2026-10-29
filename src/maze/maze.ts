import Phaser from "phaser";

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

        const startRow = grid.findIndex(row => row.includes("s"));
        const startColumn = startRow === -1 ? -1 : grid[startRow].indexOf("s");
        if (startRow === -1 || startColumn === -1) {
            throw new Error("Maze level must contain a start cell ('s').");
        }
        this.start = { row: startRow, column: startColumn };

        this.tileSize = Math.max(
            1,
            Math.min(96, scene.scale.width / columns, scene.scale.height / rows)
        );
        this.playerRadius = this.tileSize * 0.3;
        const gridWidth = columns * this.tileSize;
        const gridHeight = rows * this.tileSize;
        this.offsetX = (scene.scale.width - gridWidth) / 2;
        this.offsetY = (scene.scale.height - gridHeight) / 2;
        this.centerX = this.offsetX + gridWidth / 2;
        this.centerY = this.offsetY + gridHeight / 2;

        const colors: Record<string, number> = {
            "#": 0x334155,
            ".": 0xe2e8f0,
            s: 0x22c55e,
            e: 0xef4444,
            m: 0xe2e8f0,
            v: 0x38bdf8
        };

        grid.forEach((row, rowIndex) => {
            this.tiles[rowIndex] = row.map((cell, columnIndex) => {
                const { x, y } = this.cellCenter(rowIndex, columnIndex);
                const tile = scene.add.rectangle(
                    x,
                    y,
                    this.tileSize - 2,
                    this.tileSize - 2,
                    colors[cell] ?? colors["."]
                );
                if (cell === "v") {
                    tile.setAlpha(0.45).setDepth(10);
                } else if (this.isKey(cell)) {
                    tile.setFillStyle(this.keyColor(cell));
                } else if (this.isLock(cell)) {
                    tile.setFillStyle(this.lockColor(cell));
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
        return cell !== undefined && cell !== "#" && !this.isLockedCell(row, column);
    }

    canEnemyOccupy(row: number, column: number): boolean {
        const cell = this.grid[row]?.[column];
        return cell !== undefined &&
            cell !== "#" &&
            cell !== "v" &&
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
                .setFillStyle(0x64748b)
                .setAlpha(0.35);
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
            this.grid[target.row]?.[target.column] !== "v" &&
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
                this.grid[row]?.[column] === "#" ||
                this.grid[row]?.[column] === "v" ||
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
        const maxVisibleCells = 6;
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
                    this.grid[row][column] === "#" ||
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

    private isKey(cell: string): boolean {
        return cell === "a" || cell === "b" || cell === "c";
    }

    private isLock(cell: string): boolean {
        return cell === "1" || cell === "2" || cell === "3";
    }

    private keyForLock(lock: string): string {
        return String.fromCharCode("a".charCodeAt(0) + Number(lock) - 1);
    }

    private keyColor(key: string): number {
        const colors: Record<string, number> = {
            a: 0xfacc15,
            b: 0x38bdf8,
            c: 0xc084fc
        };
        return colors[key];
    }

    private lockColor(lock: string): number {
        const colors: Record<string, number> = {
            "1": 0xca8a04,
            "2": 0x0284c7,
            "3": 0x9333ea
        };
        return colors[lock];
    }

    private positionId(position: GridPosition): string {
        return `${position.row},${position.column}`;
    }
}
