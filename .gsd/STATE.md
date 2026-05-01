# STATE.md — Project Memory

> Last Updated: 2026-05-02

## Current Status
- Phase 1 not yet started
- Project initialized, awaiting execution

## Key Decisions Made
- Pure browser JavaScript, no backend
- Canvas API for all rendering
- Monte Carlo simulation approach (not ML — no training data available)
- Erangel only for v1

## Zone Physics Constants Locked In
```js
const SHRINK_RATIOS = [
  null,       // phase 0 (unused)
  null,       // phase 1 (initial, user-drawn)
  0.725,      // phase 1→2
  0.700,      // phase 2→3
  0.650,      // phase 3→4
  0.600,      // phase 4→5
  0.550,      // phase 5→6
  0.500,      // phase 6→7
  0.400,      // phase 7→8 (final)
];
// Erangel map world size: 816000 units (816km?), use normalized coords
// Map image: use public domain Erangel PNG
```

## Open Questions
- [ ] Get exact Erangel Zone 1 radius in game world units — need research
- [ ] Verify shrink ratios from community data (PUBG Fandom wiki / dataminers)
- [ ] Decide on heatmap color scheme (thermal vs green-red)

## Blockers
- None currently

## Session Log
- 2026-05-02: Project initialized via /new-project
