# The Quiet Below

The Quiet Below is a browser-based maze puzzle game built with TypeScript, Phaser, and Vite. Find your way through the dark, collect keys, unlock doors, and avoid enemies that hunt the player.

## Getting started

You need [Bun](https://bun.sh/) or Node.js with npm installed, any would do.

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

or npm:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in your browser.

## Controls and gameplay

- Move with the **arrow keys** or **WASD**.
- Press **Escape** to pause or resume.
- Reach the exit to complete a level.
- Collect a colored key to open its matching colored door.
- Vents can be crossed by the player, but block enemies. Enemies pursue the player through paths they can traverse.
- Progress through unlocked levels using the level selector. Unlocked progress is saved in browser storage.

## Creating and editing mazes

Game levels are defined as arrays of character matrices in [`src/maze/levels.ts`](./src/maze/levels.ts). Each row is a sequence of cells:

| Symbol        | Meaning                                             |
| ------------- | --------------------------------------------------- |
| `#`           | Wall                                                |
| `.`           | Open floor                                          |
| `s`           | Player start                                        |
| `e`           | Exit                                                |
| `m`           | Enemy                                               |
| `v`           | Vent: passable by the player, impassable by enemies |
| `a`, `b`, `c` | Coded keys                                          |
| `1`, `2`, `3` | Doors for keys `a`, `b`, `c`, respectively          |

Every maze should be a rectangular grid with one start and one exit. The game expects the level matrices in `levels.ts` to use these symbols.

An in-browser level editor is also available at [`maze-level-editor.html`](./maze-level-editor.html). Run the Vite development server and open `/maze-level-editor.html` to create, edit, save, and export maze layouts. The editor saves its own working levels in browser storage; export a layout and add it to `src/maze/levels.ts` to use it in the game.

## Project commands

| Command                                 | Description                              |
| --------------------------------------- | ---------------------------------------- |
| `bun run dev` / `npm run dev`           | Start the Vite development server        |
| `bun run build` / `npm run build`       | Type-check and create a production build |
| `bun run preview` / `npm run preview`   | Preview the production build locally     |
| `bun run lint` / `npm run lint`         | Run Oxlint and check formatting          |
| `bun run lint:fix` / `npm run lint:fix` | Apply lint and formatting fixes          |
| `bun run test` / `npm run test`         | Run unit tests with Vitest               |

Production files are generated in `dist/`.
