# 🟩 Creep Craft: Reborn

**Creep Craft: Reborn** is a massive 2D sandbox game with survival elements, inspired by Minecraft. The game runs directly in your browser and is built entirely with Vanilla JavaScript, HTML5 Canvas, and CSS3, without the use of any third-party game engines or libraries.

## 📖 The Story

You are a creeper who has somehow ended up in Steve's world. However, Steve has died, and since he was playing in hardcore mode, he will never respawn. Your task is to finish the game for him, survive using his methods, and ultimately defeat the dragon.

## 🌟 Key Features

* **Procedural World Generation:** Explore a massive world of 20,000 by 256 blocks featuring different biomes, cave systems, water and lava pools, and ore generation (Coal, Iron, Gold, Diamonds).
* **Advanced Game Mechanics:** 
  * Full crafting system (Crafting Table) and ore smelting (Furnace).
  * Fluid physics for water and lava with 8 levels of flow.
  * Fire spreading mechanics and TNT explosions.
  * Farming (tilling dirt with a hoe, planting seeds, growing wheat).
* **Dynamic Environment:** 
  * Smooth Day/Night cycle with dynamic sky palettes and a starry night sky.
  * Advanced lighting system (Lightmap) — light from torches, lava, and active furnaces realistically scatters in the dark.
  * Particle System v2 for immersive visual effects (block breaking chunks, blood, sparks, falling leaves, smoke).
* **Entities & AI:**
  * Hostile mobs (Zombies, Spiders) with advanced pathfinding and jumping logic.
  * Passive mobs (Cows, Pigs, Sheep) featuring different behavioral states (wandering, eating grass, fleeing, panic).
* **Custom Audio Engine:** Procedurally generated sound effects and music using the Web Audio API (oscillators, noise, filters). Features 3D spatial audio for mob footsteps and eerie cave ambient sounds.
* **Rich User Interface:**
  * Interactive inventory with Drag & Drop support, chests (including large double chests), and furnace GUI.
  * In-game Commands Encyclopedia, Achievements system, and Chat.

## 🛠 Technologies

* **JavaScript (ES6+)** — Core game logic, physics, AI, and collision detection.
* **HTML5 Canvas** — Graphics rendering (including tile caching for maximum optimization).
* **CSS3** — Pixel-art style UI elements (menus, HUD, inventory).

## 🚀 How to Play

The game requires no installation, servers, or databases.

1. Clone the repository to your local machine:
   \`\`\`bash
   git clone https://github.com/YOUR_USERNAME/creepcraft-reborn.git
   \`\`\`
2. Navigate to the project folder and simply open the `index.html` file in any modern web browser.
   *Note: For the best performance, it is recommended to use Google Chrome or Chromium-based browsers.*

## 🎮 Controls

* **W, A, S, D / Arrow Keys** — Move
* **Space / W / Up Arrow** — Jump
* **LMB (Left Mouse Button)** — Attack mobs / Mine blocks
* **RMB (Right Mouse Button)** — Place blocks / Interact (eat food, use buckets)
* **E** — Open/Close Inventory
* **Q** — Drop item (while hovering over it in the inventory)
* **1-9 / Mouse Wheel** — Select item in the hotbar
* **T / \` / /** — Open in-game chat / command prompt
* **F3** — Toggle Debug screen (FPS, coordinates)
* **Esc** — Pause / Settings Menu

## ⌨️ Commands (Chat)
The game features a variety of cheat commands. Here are a few examples:
* `/time day` or `/time night` — Change the time of day.
* `/give [item_name] [count]` — Give yourself an item.
* `/summon [zombie/spider/pig/cow/sheep]` — Spawn an entity near you.
* `/noclip` — Toggle free-flight mode through blocks.
* A full list can be found in the **Help & Controls -> Commands Encyclopedia** menu.

## 🤝 Contributing

Pull requests are highly appreciated! If you want to add new blocks, crafting recipes, or improve mob AI, feel free to fork the repository, create a new branch, and submit your improvements.