# Solmar Bay: A Tide of Trouble

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/emasinves0-commits/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/emasinves0-commits/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the make.fun [Make GTA 6](https://make.fun/bounty/gta6-01) bounty.

A fully original, 2D top-down open-world crime game set in the sun-soaked coastal city of **Solmar Bay**.
You play Jax Merrin, fresh out of prison and broke, working your way up through a four-mission story
(First Job, The Pickup, The Getaway, The Big Score) while the police of Solmar Bay take an interest.

Everything is written in vanilla JavaScript (ES modules) on an HTML5 canvas. All art is drawn in code and
all sound (engines, sirens, gunshots, music) is synthesized with WebAudio. No libraries, no assets, no network.

## Features

- A seeded grid city with buildings, a park, parking lots, a plaza, a beach and the sea, with soft shadows and day/dusk/night lighting
- Six car types (sedan, taxi, pickup, sports car, van, police cruiser) with arcade drift physics, skid marks, damage, smoke and explosions
- Traffic that follows the roads, pedestrians that stroll on sidewalks and flee from guns and cars
- A 1 to 5 star wanted system: police cars chase and ram, cops get out and shoot, roadblocks at higher stars, escape by breaking line of sight
- Busted and wasted respawns that cost you cash
- Pistol with ammo and reloading, melee, health and ammo pickups
- A four-mission story with waypoint arrow, minimap markers, objective tracker and mission banners
- A dense GTA-style HUD driven by real game state: SBPD dispatch panel (named units SBPD-01.., distance in metres, PURSUIT / RAMMING / ROADBLOCK, CODE n), big gold wanted stars, fists/pistol slots with ammo, district label (Marina Row, City Park, The Strand...), speed + car name and a SOLMAR FM 98.4 radio line that changes track each in-game hour
- Minimap, HUD, start screen, pause menu, help screen, localStorage save and Continue, M to mute

## How to play

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and press Play. Any static file server pointed at `game/` works too.

Screenshot staging URLs: `?shot=chase` (4 stars, police pursuit and a roadblock), `?shot=mission`, `?shot=drive`, `?shot=foot` (add `&seed=N` for another city seed). `shots.json` lists them in that order, so the most dramatic shot (1-chase.jpg) is first; ?shot= scenes use a slightly closer camera, normal play is unchanged.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move on foot; accelerate, steer and brake in a car |
| Mouse | Aim |
| Left click | Shoot |
| R | Reload |
| Shift | Sprint |
| E | Enter or exit a nearby car (punches when no car is near) |
| F | Punch |
| Space | Handbrake / drift |
| H | Horn |
| Esc or P | Pause menu |
| M | Mute |

Follow the green marker to start the next mission and the yellow marker during one. Stealing cars, hitting
pedestrians and shooting raise your wanted level.
