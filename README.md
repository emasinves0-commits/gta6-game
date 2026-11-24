# Solmar Bay: A Tide of Trouble

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/emasinves0-commits/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/emasinves0-commits/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the make.fun [Make GTA 6](https://make.fun/bounty/gta6-01) bounty.

A fully original 3D third-person open-world crime game set in the sun-soaked, golden-hour coastal city of
**Solmar Bay**. You play Jax Merrin, fresh out of prison and broke, working through a eight-mission story
(First Job, The Pickup, The Getaway, The Big Score) while the SBPD takes an interest.

Built on three.js (vendored in `game/vendor/`, no network at all). Every model, texture and sound is made in
code: low-poly buildings with canvas window textures, palms, a park, plaza, beach, pier and marina; sound is
synthesised with WebAudio.

## Features

- Low-poly 3D city from a seeded RNG (same seed, same city) with soft shadows, fog and a golden-hour sky
- Third-person chase camera that follows the car or the player and pulls in so it never sits inside a wall
- Six car types (sedan, taxi, pickup, sports car, van, police cruiser): arcade drift physics, skid marks, damage, smoke, explosions
- Traffic on the road grid, pedestrians on sidewalks that flee from guns and cars
- 1-5 star wanted system: cruisers pursue / ram / flank, officers get out and shoot, roadblocks at 3+ stars,
  a helicopter with a visible spotlight cone, escape by breaking line of sight, busted and wasted respawns
- Pistol, SMG and shotgun with ammo and reloads, melee, health, armour and weapon pickups
- Crew abilities: Kenji drops a wanted star, Mina repairs the car, Dez marks every cop on the minimap
- Street race checkpoints, 12 golden crabs, rank + RP progression, per-district standing
- Dense HUD driven by real state: mission banner with chapter / STAGE x/y / progress / NEXT, SBPD dispatch
  panel (SBPD-01.. with role and distance), wanted stars, heading-up round minimap, health + armour, cash,
  clock, district standing, weapon slots, vehicle name / speed / condition, SOLMAR FM 98.4 radio, crew cards, dialogue box
- Start screen, pause menu, help, localStorage save + Continue

## How to play

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Any static server pointed at `game/` works too.

Staged screenshot scenes: `?shot=chase`, `?shot=stats` (the Tab career screen), `?shot=drive` (storm), `?shot=foot` (night, carjack prompt) (add `&seed=N` for another city). They are listed in `shots.json`, chase first.

## Source layout (game/src)

| File | Job |
| --- | --- |
| main.js | boot, renderer, sky, update order, camera, menus, staged scenes |
| config.js, random.js | tuning constants, seeded RNG |
| city.js, cityscape.js, geometry.js | grid layout + collision, 3D scenery, mesh merging |
| vehicles.js, traffic.js, pedestrians.js, characters.js | cars, ambient traffic, people, low-poly figures |
| police.js, combat.js, player.js | SBPD, weapons and pickups, Jax |
| weather.js, statsscreen.js | per-shot night / storm looks, Tab career screen |
| missions.js, activities.js, stats.js | story, crew / crabs / race, rank and standing |
| hud.js, minimap.js | DOM HUD, canvas minimap |
| audio.js, effects.js, input.js, save.js | WebAudio, particles, keyboard + mouse, saves |

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move on foot; drive a car |
| Mouse / click | Aim / shoot |
| Shift | Sprint |
| R, F | Reload, punch |
| 1-4 | Weapons |
| E | Enter or exit a car |
| Space, H | Handbrake, horn |
| Z / X / C | Crew: drop a star / repair / mark police |
| Left / Right arrows, wheel | Camera on foot, zoom |
| Esc or P, M, T | Pause, mute, next radio track |
