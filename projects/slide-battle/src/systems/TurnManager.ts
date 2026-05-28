import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import type { Team } from "../config/units";
import { STARTING_AP } from "../config/balance";

export type TurnManagerEvent =
  | "turn-changed"
  | "ap-changed"
  | "units-at-rest"
  | "game-over";

export class TurnManager extends Phaser.Events.EventEmitter {
  private scene: Phaser.Scene;
  private unitsGroup: Phaser.Physics.Arcade.Group;
  private currentTeam: Team = "player";
  private ap: number = STARTING_AP;
  private gameOver: boolean = false;
  private winner: Team | null = null;
  private atRest: boolean = true;

  constructor(scene: Phaser.Scene, unitsGroup: Phaser.Physics.Arcade.Group) {
    super();
    this.scene = scene;
    this.unitsGroup = unitsGroup;
  }

  getCurrentTeam(): Team {
    return this.currentTeam;
  }

  getAP(): number {
    return this.ap;
  }

  getStartingAP(): number {
    return STARTING_AP;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  getWinner(): Team | null {
    return this.winner;
  }

  canAct(team: Team): boolean {
    if (this.gameOver) return false;
    if (this.currentTeam !== team) return false;
    if (this.ap <= 0) return false;
    if (!this.atRest) return false;
    return true;
  }

  consumeAP(): void {
    if (this.ap <= 0) return;
    this.ap -= 1;
    this.emit("ap-changed", this.ap);
    this.atRest = false;
  }

  /** Called every frame by the scene to detect when units have settled. */
  tick(): void {
    if (this.gameOver) return;
    const anyMoving = this.unitsGroup
      .getChildren()
      .some((u) => (u as Unit).active && (u as Unit).isMoving);
    if (!this.atRest && !anyMoving) {
      this.atRest = true;
      this.emit("units-at-rest");
      this.checkVictory();
      if (!this.gameOver && this.ap <= 0) this.endTurn();
    }
  }

  endTurn(): void {
    if (this.gameOver) return;
    this.currentTeam = this.currentTeam === "player" ? "ai" : "player";
    this.ap = STARTING_AP;
    this.atRest = true;
    this.emit("turn-changed", this.currentTeam);
    this.emit("ap-changed", this.ap);
  }

  giveUp(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.winner = this.currentTeam === "player" ? "ai" : "player";
    this.emit("game-over", this.winner);
  }

  private checkVictory(): void {
    const alive = this.unitsGroup
      .getChildren()
      .filter((u) => (u as Unit).active && (u as Unit).isAlive()) as Unit[];
    const playerLeft = alive.some((u) => u.team === "player");
    const aiLeft = alive.some((u) => u.team === "ai");
    if (!playerLeft || !aiLeft) {
      this.gameOver = true;
      this.winner = playerLeft ? "player" : "ai";
      this.emit("game-over", this.winner);
    }
  }
}
