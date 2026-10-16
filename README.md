# the-day-before
A survival crafting game inspired by The Day Before - explore post-apocalyptic environments, craft items, and survive

Single-player prototype built with **Three.js (WebGL2)** and **Vite**. Every asset (city, textures, characters, sounds, and music) is generated procedurally at runtime, so there are no external asset files.

## Quick start

```bash
npm install
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the production build
npm test          # unit tests (Vitest)
```

Requires a browser with WebGL2 support.

## Visual direction

The West End demo targets grounded, third-person urban survival: dusty olive and
concrete tones, hazy daylight, shuttered shops, rusted vehicles, cracked asphalt
and weeds reclaiming the curbs. Lower residential blocks border the denser city.
A closer shoulder camera frames a rounded survivor silhouette with backpack,
straps, pouches and a bedroll. The subdued field UI leaves the street readable.

Start an expedition, follow the avenue and search vehicles with **E**; starter
supplies are scattered around the first intersection. Inventory (**Tab**) and
crafting (**C**) remain available, as do combat, weather and the day/night cycle.
All visuals remain procedural and offline: this is an art-direction blockout,
not a photorealistic asset pack. Future art should preserve human-scale street
detail, weathering and muted materials rather than saturated colors or neon.

## Features

- **Procedural Manhattan-style city**: a seeded grid of avenues, streets, and alleys. It has abandoned buildings of varying heights (some ruined), wrecked and burned cars, rubble, debris, bent streetlights, and burning barrels.
- **Third-person player**: walk, sprint, and jump, with idle/walk/run/jump/attack/dead animation states. Health, stamina, hunger, and thirst, plus an overweight penalty.
- **Combat**: melee weapons with cooldowns, damage, knockback, and blood particles. Infected enemies use a patrol → chase → attack AI and grow more aggressive at night.
- **Inventory and crafting**: weight-limited inventory (35 kg), a 5-slot hotbar, and a detailed inventory view. Recipes include bandages, food rations, a wooden club, a metal pipe, a spiked bat, a pickaxe, and a flashlight.
- **Looting**: pick up ground items and search crates, barrels, bodies, and vehicles. Scrap piles can be harvested with a pickaxe. Lootable objects show a highlight marker and an interaction prompt.
- **Day/night cycle**: a full day lasts 20 minutes by default and can be changed in Settings. The sun and moon move across the sky, which fades from day to night with stars. The HUD shows the in-game time.
- **Weather**: dynamic clear, fog, and rain, with lightning and thunder.
- **HUD**: health/stamina/hunger/thirst bars, rotating minimap, clock, hotbar, carried weight, notifications, and interaction prompts.
- **Menus**: loading screen, main menu, pause, settings (audio volumes, graphics quality, post-processing, day length, mouse sensitivity, invert Y, FPS counter), controls, and death/respawn screen. Settings persist in `localStorage`.
- **Audio**: procedural Web Audio music with separate day, night, and combat moods. It also includes footsteps, swings, hits, screams, pickups, crafting sounds, rain, and thunder.
- **Polish**: bloom, film grain, vignette, a low-health desaturation effect, and particles (fire, smoke, dust, blood). Gamepads use the standard mapping. Touch devices get an on-screen joystick and buttons.

## Controls

| Action | Keyboard / Mouse | Gamepad |
| --- | --- | --- |
| Move | WASD / Arrow keys | Left stick |
| Look | Mouse | Right stick |
| Sprint | Shift | LT / L3 |
| Jump | Space | A |
| Attack / use selected consumable | Left click | RT |
| Interact / loot | E | X |
| Hotbar | 1–5, mouse wheel | LB / RB |
| Flashlight | F | D-pad up |
| Inventory | Tab / I | Y |
| Crafting | C | B |
| Pause | Esc / P | Start |

## Project structure

```
src/
├── index.js               entry point / bootstrapping
├── scenes/                GameScene (world, loop, state machine), MainMenu
├── objects/               Player, Enemy, WorldObject, Weather, Humanoid rig, particles
├── systems/               MapGenerator, Inventory, Crafting, Combat, DayNightCycle, Physics
├── ui/                    HUD, InventoryUI, CraftingUI, MenuUI
├── audio/                 AudioManager (procedural Web Audio)
├── utils/                 Constants (items, recipes, tuning), InputHandler, Helpers
└── styles/index.css
tests/                     Vitest unit tests for the pure game logic
```

Game states: `loading`, `menu`, `exploration`, `combat`, `inventory`, `crafting`, `paused`, `dead`.
Item, recipe, loot table, and tuning data live in `src/utils/Constants.js`.
