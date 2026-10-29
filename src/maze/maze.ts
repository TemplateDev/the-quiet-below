import Phaser from "phaser";

export interface GridPosition {
    row: number;
    column: number;
}

export type LevelGrid = readonly (readonly string[])[];

export default class Maze {
    private readonly tiles: Phaser.GameObjects.Rectangle[][] = [];
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
            m: 0xe2e8f0
        };

        grid.forEach((row, rowIndex) => {
            this.tiles[rowIndex] = row.map((cell, columnIndex) => {
                const { x, y } = this.cellCenter(rowIndex, columnIndex);
                return scene.add.rectangle(
                    x,
                    y,
                    this.tileSize - 2,
                    this.tileSize - 2,
                    colors[cell] ?? colors["."]
                );
            });
        });
    }

    get startPosition(): GridPosition {
        return { ...this.start };
    }

    canOccupy(row: number, column: number): boolean {
        const cell = this.grid[row]?.[column];
        return cell !== undefined && cell !== "#";
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
                if (this.grid[row][column] === "#") {
                    break;
                }
            }
        }

        this.tiles.forEach((tileRow, rowIndex) => {
            tileRow.forEach((tile, columnIndex) => {
                tile.setVisible(visible[rowIndex][columnIndex]);
            });
        });
    }
}
