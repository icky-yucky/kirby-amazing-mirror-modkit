# Contributing

- **No ROMs or game assets** in commits, issues, or PRs (the `.gitignore` blocks `*.gba`, `*.zip`, saves).
- **Verify before documenting.** Anything added to `docs/MODDING_NOTES.md` should be confirmed in an emulator
  (mGBA via `tools/dbg`), with the method noted. Mark guesses clearly as unverified.
- Offsets are ROM file offsets (GBA address = `0x08000000 + offset`), USA ROM, SHA-1 `274b102b6d940f46861a92b4e65f89a51815c12c`.
- The apps are TypeScript, built to a single self-contained HTML file. No network calls at runtime. Run `npm run typecheck` and `npm test` before pushing.
- When changing app logic, load the ROM and exercise it (edit → undo → export IPS → apply IPS → compare bytes).
- Update `CHANGELOG.md` for user-visible changes.
