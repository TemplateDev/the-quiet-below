export const GAME_SETTINGS = {
    viewport: {
        width: window.innerWidth,
        height: window.innerHeight
    },
    levelIndex: 1,
    backgroundColor: "#0f172a",
    maze: {
        symbols: {
            wall: "#",
            floor: ".",
            start: "s",
            exit: "e",
            enemy: "m",
            veil: "v"
        },
        maxTileSize: 96,
        tileGap: 2,
        visibilityRayLength: 6,
        wallColor: 0x334155,
        floorColor: 0xe2e8f0,
        startColor: 0x22c55e,
        exitColor: 0xef4444,
        veilColor: 0x38bdf8,
        veilAlpha: 0.45,
        openedLockColor: 0x64748b,
        openedLockAlpha: 0.35,
        keyColors: {
            a: 0xfacc15,
            b: 0x38bdf8,
            c: 0xc084fc
        },
        lockColors: {
            "1": 0xca8a04,
            "2": 0x0284c7,
            "3": 0x9333ea
        }
    },
    player: {
        color: 0x38bdf8,
        radius: 12,
        moveIntervalMs: 150
    },
    enemy: {
        color: 0xf97316,
        radiusScale: 0.8,
        moveIntervalMs: 300,
        spottedDelayMs: 300
    },
    entity: {
        moveAnimationMs: 100
    },
    camera: {
        zoom: 0.85,
        playerBias: 0.4,
        smoothingMs: 480
    },
    collision: {
        restartDelayMs: 500
    }
} as const;

export type KeySymbol = keyof typeof GAME_SETTINGS.maze.keyColors;
export type LockSymbol = keyof typeof GAME_SETTINGS.maze.lockColors;
