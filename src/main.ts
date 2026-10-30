import Phaser from "phaser";
import Game from "./rendering/game";
import { GAME_SETTINGS } from "./settings";
import "./index.css";

const config = {
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_SETTINGS.viewport.width,
  height: GAME_SETTINGS.viewport.height,
  backgroundColor: GAME_SETTINGS.backgroundColor,
  scene: Game
}

new Phaser.Game(config);

let canvas = document.querySelector("canvas");
if (canvas) {
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.style.cursor = "none";
}