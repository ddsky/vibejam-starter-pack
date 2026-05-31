import Phaser from "phaser";

type MenuButtonTone = "blue" | "red" | "brown" | "full";

export class MainMenuScene extends Phaser.Scene {
  private overlay?: HTMLDivElement;
  private fullscreenButton?: HTMLButtonElement;
  private hint?: HTMLDivElement;

  private readonly handleResize = () => this.syncOverlayBounds();
  private readonly handleFullscreenChange = () => this.refreshFullscreenButton();

  constructor() {
    super("MainMenuScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.drawBackdrop(width, height);
    this.createDOMMenu();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyDOMMenu, this);
  }

  private createDOMMenu(): void {
    this.destroyDOMMenu();

    const overlay = document.createElement("div");
    overlay.className = "slide-battle-menu";

    this.fullscreenButton = this.createButton("Fullscreen", "full", () => this.toggleFullscreen());
    this.fullscreenButton.classList.add("slide-battle-menu__fullscreen");

    const center = document.createElement("div");
    center.className = "slide-battle-menu__center";

    const title = document.createElement("div");
    title.className = "slide-battle-menu__title";
    title.textContent = "Slide Battle";

    const subtitle = document.createElement("div");
    subtitle.className = "slide-battle-menu__subtitle";
    subtitle.textContent = "Drag. Release. Crush.";

    const buttons = document.createElement("div");
    buttons.className = "slide-battle-menu__buttons";
    buttons.append(
      this.createButton("Play vs AI", "blue", () => this.scene.start("GameScene", { mode: "ai" })),
      this.createButton("Play Local PvP", "red", () => this.scene.start("GameScene", { mode: "pvp" })),
      this.createButton("Quit", "brown", () => this.handleQuit()),
    );

    center.append(title, subtitle, buttons);
    overlay.append(this.fullscreenButton, center);
    (this.game.canvas.parentElement ?? document.body).appendChild(overlay);

    this.overlay = overlay;
    this.refreshFullscreenButton();
    this.syncOverlayBounds();
    requestAnimationFrame(this.handleResize);
  }

  private createButton(label: string, tone: MenuButtonTone, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = `slide-battle-menu__button slide-battle-menu__button--${tone}`;
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

  private handleQuit(): void {
    window.close();
    this.hint?.remove();
    this.hint = document.createElement("div");
    this.hint.className = "slide-battle-menu__hint";
    this.hint.textContent = "Close this tab to quit.";
    this.overlay?.appendChild(this.hint);
    this.time.delayedCall(2000, () => {
      this.hint?.remove();
      this.hint = undefined;
    });
  }

  private destroyDOMMenu(): void {
    this.scale?.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scale?.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    this.scale?.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    this.overlay?.remove();
    this.overlay = undefined;
    this.fullscreenButton = undefined;
    this.hint = undefined;
  }

  private drawBackdrop(width: number, height: number): void {
    const g = this.add.graphics();
    // sand gradient
    g.fillStyle(0x3a3127, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x4a4036, 1);
    g.fillRect(0, height * 0.45, width, height * 0.1);

    // decorative chips
    const chipKeys: Array<{ key: string; x: number; y: number; tint: number }> = [
      { key: "chip-player", x: 180, y: height - 160, tint: 0xffffff },
      { key: "chip-ai", x: width - 180, y: 160, tint: 0xffffff },
      { key: "chip-player", x: 300, y: height - 100, tint: 0xffffff },
      { key: "chip-ai", x: width - 300, y: 100, tint: 0xffffff },
    ];
    for (const c of chipKeys) {
      this.add.image(c.x, c.y, c.key).setScale(0.8).setAlpha(0.7);
    }
  }
}
