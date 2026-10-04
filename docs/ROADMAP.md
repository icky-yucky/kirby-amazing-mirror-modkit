# Roadmap

Reverse engineering is done one system at a time; each system gets documented formats **and** an editor.

## Done
- [x] Sprite database (animations, frames, OAM pieces, tile bank, palette bank)
- [x] Sprite Studio (browse, assemble, recolor, paint)
- [x] Kirby color slots and spray paints
- [x] Overall color tool
- [x] TypeScript migration, tests, CI

## Next
- [ ] **Enemies** - find the enemy definition tables (health, contact damage, copy ability, sprite/palette); editor
- [ ] Lives icon / HUD palettes
- [ ] Copy abilities (stats, projectiles, palette per ability)
- [ ] Items and collectibles (spray paints, treasures, food)
- [x] Room tile layers: viewer and editor (experimental)
- [x] Room collision maps: located, viewer and editor (only 0 and 0D understood)
- [ ] Collision value meanings (slopes, ice, hazards, doors), then enemy and object placement
- [ ] Text and dialogue
- [ ] Music and sound effects
- [ ] Engine symbol map (radare2 project) for the object system, VBlank handler, palette/DMA code

## Not planned
- A complete matching decompilation of the whole game.
