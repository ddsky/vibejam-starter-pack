import Phaser from "phaser";
import type { Team, GameMode } from "../config/units";
import { TEAM_COLORS } from "../config/units";
import type { TurnManager } from "../systems/TurnManager";
import { sounds } from "../audio/SoundManager";
import {
  CHARGE_MODE_LABELS,
  CHARGE_MODE_REGISTRY_KEY,
  CHARGE_MODES,
  isChargeMode,
  readStoredChargeMode,
  writeStoredChargeMode,
  type ChargeMode,
} from "../config/charge";

export interface HUDInit {
  turnManager: TurnManager;
  mode?: GameMode;
}

type HudButtonTone = "brown" | "green" | "blue" | "red";

export class HUDScene extends Phaser.Scene {
  private turnManager!: TurnManager;
  private overlay?: HTMLDivElement;
  private turnLabel?: HTMLDivElement;
  private apIcons: HTMLSpanElement[] = [];
  private chargeModeButtons = new Map<ChargeMode, HTMLButtonElement>();
  private muteButton?: HTMLButtonElement;
  private fullscreenButton?: HTMLButtonElement;
  private currentTeam: Team = "player";
  private mode: GameMode = "ai";

  private readonly handleAPChanged = (ap: number) => this.refreshAP(ap);
  private readonly handleTurnChanged = (team: Team) => this.refreshTurn(team);
  private readonly handleGameOver = () => {
    this.overlay?.classList.add("slide-battle-hud--disabled");
    this.events.emit("hud-disable");
  };
  private readonly handleResize = () => this.syncOverlayBounds();
  private readonly handleFullscreenChange = () => this.refreshFullscreenButton();

  constructor() {
    super("HUDScene");
  }

  create(data: HUDInit): void {
    this.turnManager = data.turnManager;
    this.mode = data.mode ?? "ai";
    this.registry.set(CHARGE_MODE_REGISTRY_KEY, this.currentChargeMode());
    this.createDOMHUD();

    this.refreshTurn(this.turnManager.getCurrentTeam());
    this.refreshAP(this.turnManager.getAP());

    this.turnManager.on("ap-changed", this.handleAPChanged);
    this.turnManager.on("turn-changed", this.handleTurnChanged);
    this.turnManager.on("game-over", this.handleGameOver);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyDOMHUD, this);
  }

  private createDOMHUD(): void {
    this.destroyDOMHUD();

    const overlay = document.createElement("div");
    overlay.className = "slide-battle-hud";

    const bar = document.createElement("div");
    bar.className = "slide-battle-hud__bar";

    this.muteButton = this.createButton(sounds.isMuted() ? "Unmute" : "Mute", "brown", () => {
      sounds.setMuted(!sounds.isMuted());
      if (sounds.isMuted()) sounds.stopMusic();
      else sounds.startMusic();
      if (this.muteButton) this.muteButton.textContent = sounds.isMuted() ? "Unmute" : "Mute";
    });

    this.fullscreenButton = this.createButton("Fullscreen", "blue", () => this.toggleFullscreen());
    const randomizeButton = this.createButton("Randomize", "green", () => this.handleRandomize());
    const chargeModeControl = this.createChargeModeControl();
    const giveUpButton = this.createButton("Give Up", "red", () => this.handleGiveUp());

    const turnPanel = document.createElement("div");
    turnPanel.className = "slide-battle-hud__turn-panel";

    this.turnLabel = document.createElement("div");
    this.turnLabel.className = "slide-battle-hud__turn-label";

    const apList = document.createElement("div");
    apList.className = "slide-battle-hud__ap-list";
    this.apIcons = [];
    for (let i = 0; i < this.turnManager.getStartingAP(); i++) {
      const dot = document.createElement("span");
      dot.className = "slide-battle-hud__ap-dot";
      apList.appendChild(dot);
      this.apIcons.push(dot);
    }

    turnPanel.append(this.turnLabel, apList);
    bar.append(
      this.muteButton,
      this.fullscreenButton,
      randomizeButton,
      chargeModeControl,
      turnPanel,
      giveUpButton,
    );
    overlay.appendChild(bar);
    (this.game.canvas.parentElement ?? document.body).appendChild(overlay);

    this.overlay = overlay;
    this.refreshFullscreenButton();
    this.refreshChargeModeButtons();
    this.syncOverlayBounds();
    requestAnimationFrame(this.handleResize);
  }

  private createChargeModeControl(): HTMLDivElement {
    const control = document.createElement("div");
    control.className = "slide-battle-hud__mode-control";
    control.setAttribute("role", "group");
    control.setAttribute("aria-label", "Charge mode");
    this.chargeModeButtons.clear();

    for (const mode of CHARGE_MODES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = CHARGE_MODE_LABELS[mode];
      button.className = "slide-battle-hud__mode-button";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setChargeMode(mode);
      });
      control.appendChild(button);
      this.chargeModeButtons.set(mode, button);
    }

    return control;
  }

  private createButton(label: string, tone: HudButtonTone, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = `slide-battle-hud__button slide-battle-hud__button--${tone}`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private syncOverlayBounds(): void {
    if (!this.overlay) return;
    const rect = this.game.canvas.getBoundingClientRect();
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  private refreshAP(ap: number): void {
    const teamColor = "#" + TEAM_COLORS[this.currentTeam].toString(16).padStart(6, "0");
    this.apIcons.forEach((icon, i) => {
      const used = i >= ap;
      icon.style.backgroundColor = used ? "#1a1510" : teamColor;
      icon.classList.toggle("slide-battle-hud__ap-dot--spent", used);
    });
  }

  private refreshTurn(team: Team): void {
    this.currentTeam = team;
    if (!this.turnLabel) return;

    const isBlue = team === "player";
    const hex = "#" + TEAM_COLORS[team].toString(16).padStart(6, "0");
    if (this.mode === "pvp") {
      this.turnLabel.textContent = isBlue ? "Blue's Turn" : "Red's Turn";
    } else {
      this.turnLabel.textContent = isBlue ? "Your Turn" : "AI Turn";
    }
    this.turnLabel.style.color = hex;
    this.refreshAP(this.turnManager.getAP());
  }

  private currentChargeMode(): ChargeMode {
    const registryMode = this.registry.get(CHARGE_MODE_REGISTRY_KEY);
    return isChargeMode(registryMode) ? registryMode : readStoredChargeMode();
  }

  private setChargeMode(mode: ChargeMode): void {
    writeStoredChargeMode(mode);
    this.registry.set(CHARGE_MODE_REGISTRY_KEY, mode);
    this.refreshChargeModeButtons(mode);
  }

  private refreshChargeModeButtons(mode: ChargeMode = this.currentChargeMode()): void {
    for (const [buttonMode, button] of this.chargeModeButtons) {
      const selected = buttonMode === mode;
      button.classList.toggle("slide-battle-hud__mode-button--selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  private handleGiveUp(): void {
    this.turnManager.giveUp();
  }

  private handleRandomize(): void {
    this.scene.stop("HUDScene");
    this.scene.stop("GameScene");
    this.scene.start("GameScene", { mode: this.mode });
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
    this.time.delayedCall(50, () => {
      this.refreshFullscreenButton();
      this.syncOverlayBounds();
    });
  }

  private refreshFullscreenButton(): void {
    if (!this.fullscreenButton) return;
    this.fullscreenButton.textContent = this.scale.isFullscreen || !!document.fullscreenElement
      ? "Exit Full"
      : "Fullscreen";
  }

  private destroyDOMHUD(): void {
    this.turnManager?.off("ap-changed", this.handleAPChanged);
    this.turnManager?.off("turn-changed", this.handleTurnChanged);
    this.turnManager?.off("game-over", this.handleGameOver);
    this.scale?.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scale?.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    this.scale?.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    this.overlay?.remove();
    this.overlay = undefined;
    this.turnLabel = undefined;
    this.muteButton = undefined;
    this.fullscreenButton = undefined;
    this.apIcons = [];
    this.chargeModeButtons.clear();
  }
}
