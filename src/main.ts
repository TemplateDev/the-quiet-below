import Phaser from "phaser";
import Game from "./rendering/game";
import "./index.css";

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  scene: Game
}

new Phaser.Game(config);
