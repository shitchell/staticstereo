---
title: Experiments — anticorrelated stereograms (binocular luster)
description: A one-off encoder variant where the raised plane's eye-pieces are complements rather than copies; produces luster/rivalry instead of depth. Kept as a possible material effect, not a fix.
status: parked — interesting, no committed use yet
date: 2026-10-09
tags: [autostereogram, sirds, stereopsis, anticorrelated, luster, experiment]
---

# Anticorrelated stereograms

Throwaway experiments live here, outside `src/`, so the encoder stays clean. Run with
`node docs/experiments/anticorrelated.mjs` after `npm run build`.

## What it does

Shaun's idea, verbatim:

> "i'd be curious to see if we could set it up so that the left-eye pieces and right-eye
> pieces on the elevated plane are inverted. i.e.: the pieces that are intended for the
> elevated plane that the left eye sees might have `[0,1,0,...]` for a row of static, and
> that same piece for the elevated plane that the right eye sees would be `[1,0,1,...]`"

One extra term in the shift walk: where the pair belongs to the raised plane, the pixel is
the **complement** of its partner rather than a copy.

```js
out[x] = (invert && z > 0.5) ? (255 - out[x - sep]) : out[x - sep]
```

Measured agreement with the fusion partner:

| region | normal | inverted |
|---|---|---|
| raised slab | 1.000 (identical) | **0.000** (perfectly complementary) |
| background | 1.000 | 1.000 (untouched) |

The correlated background is left intact deliberately, so the image carries its own
reference surface.

## What it looks like

Shown blinded alongside a normal render. Shaun's report, which is worth keeping in full
because it is a better phenomenological description than the textbook vocabulary:

> "omg haha that is such a bizarre effect. idk how to describe it. i will say: the
> anti-correlated one is *quite* difficult to maintain focus on xD i have to focus on the
> background to make sure i keep my eyes at the correct focus, and then not try to focus
> *too* hard on the elevated area. it *does* look almost like it's elevated? but also like
> it might not be elevated? and a little like it's... not there... like the best way i
> could describe it, is it looks like what i might expect a "phantom" shape to look like
> lol if a clean correlated square were to die in the stereogram and then come back as a
> spirit xD i'm going to conjecture that that's because each eye sees "through" what the
> other eye sees, so it gives the sense that the pieces are there but also not there? …
> hard to make out clean edges. … at the left/right edges, it looks almost like i'm not
> able to focus correctly and the sides are not there"

## Why it does that

This is an **anticorrelated random-dot stereogram**, and the percept is **binocular
luster** — a classic stereopsis stimulus.

- **The conjecture above is essentially the accepted mechanism.** Stereo depth is computed
  by *correlating* the two retinal images. Here correlation is maximally negative, so the
  matcher finds no correspondence; rather than fusing into a surface the two monocular
  images rival. Hence "there but also not there".
- **Vergence is driven by correlation**, so an anticorrelated region gives the eyes nothing
  to lock onto — which is why holding fixation on the background was necessary.
- **The edges break down** because that boundary is where the matcher switches between a
  valid correspondence and none.

A well-known neurophysiology result sits underneath: disparity-selective V1 neurons respond
to anticorrelated stereograms with *inverted* disparity tuning, while observers report no
inverted depth (Cumming & Parker, ~1997). V1 disparity signals are therefore not the
percept — something downstream validates the match before depth is committed. *(Recalled
literature, not verified against a source; check before relying on it.)*

## Possible use — material, not depth

Luster is how genuinely shiny things look: real specular highlights differ between the
eyes, so the visual system reads inter-ocular mismatch as **gloss**. So this is not broken
depth, it is a plausible signal for *wet, metallic, glassy, ghostly, fogged*. Any case
where, in Shaun's words, "cleanly discerning what the object is isn't paramount".

Parked rather than productised: it actively impairs identification, so it is a texture
effect looking for a scene that wants one.
