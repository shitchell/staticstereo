---
title: Experiments — anticorrelated stereograms (binocular luster)
description: A one-off encoder variant where the raised plane's eye-pieces are complements rather than copies; produces luster/rivalry instead of depth. Kept as a possible material effect, not a fix.
status: parked — gloss ruled out; the effect is a symbolic device, not a material one
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

---

# Chasing gloss, and what we learned instead

Three follow-up experiments (`gloss-eccentricity.mjs`, `gloss-gradient.mjs`,
`yinyang.mjs`). The gloss hypothesis is **dead**, and the negative result is the most
useful thing in this file.

## 1. Position: prediction wrong

The hypothesis was that an anticorrelated patch would read as a specular highlight, so an
**off-centre** patch should look more like gloss than a centred one — real highlights sit
off-centre, toward the light. Both of us predicted that.

The opposite happened. Shaun, on a centred r=55 patch versus an r=38 patch at 75%
eccentricity:

> "especially for the centered one, my brain can't decide if the anti-correlated center is
> raised or part of the background :p it keeps perceptually shifting back and forth. not in
> an oscillatory sort of way; it'll just flip from looking like part of the back plane to
> being raised above the circle. and the centered one does work much better. the 75% one
> doesn't even fully look like a circle?"

**That first comparison was a flawed experiment** — it varied patch radius (55 vs 38) *and*
position at once. `gloss-eccentricity.mjs` fixes it: radius pinned at 45, eccentricity
swept 0 / 0.25 / 0.5 / 0.7. Note that at 0.7 the rim clip shrinks the patch anyway
(5384px vs ~6370px), so position and figure integrity genuinely do trade off at the edge.

Two durable observations:

- **The percept is tri-stable**, not merely absent: *depressed* (part of the back plane),
  *raised above the host surface*, and the phantom there/not-there state, flipping
  non-periodically. "Raised" is the strange one, since nothing in the geometry asks for
  nearer-than-the-host — it has to be the matcher finding a false correspondence at some
  other offset, which fits "no valid solution, settle into a local minimum".
- **A patch near the boundary damages the figure.** The edge is what identifies the shape;
  put the ambiguity next to it and the shape stops reading. So this effect wants to live in
  a shape's **interior**.

## 2. Gradient: the generalisable finding

Shaun's diagnosis of why a hard patch fails, which was mechanically right:

> "i think the reason it doesn't work is because gloss is more of a gradient that extends
> further across an image. we could try that by having the anti-correlation effect set up
> as more of a gradient"

Anticorrelation is binary per pixel, but the *inverted fraction* is continuous, so partner
agreement can be swept smoothly — 1.000 (none inverted) through 0.500 (half: no
correlation at all) to 0.000 (all inverted). `gloss-gradient.mjs` does this with a
gaussian falloff and three widths; measured agreement by ring confirms a real gradient,
e.g. tight: `0.06 → 0.38 → 0.69 → 0.86 → 0.96 → 1.00`.

It still does not read as shading:

> "it's still phantom-y, even where the gradient is clearly there … it just looks like
> increasingly tiny patches/pixels of phantom :p"

**The rule this establishes: you cannot dither correspondence the way you can dither
luminance.** Luminance integrates spatially, so a stipple reads as a tone. Correspondence
is evaluated per pixel and *failure is salient*, so a 40%-inverted region does not read as
40% glossy — it reads as 40% density of phantom pixels. Stereo correspondence carries
**surfaces, not materials.** That is a ceiling on the medium, not a defect in the
implementation, and it is worth knowing before anyone tries to express texture, gloss,
translucency or roughness this way.

## 3. The symbolic use, and a lesson about depth budgets

`yinyang.mjs`: the symbol rendered as two depth planes with both dots anticorrelated.

A stereogram has **no luminance channel for the viewer** — everything is depth — so a
light-half/dark-half symbol cannot be rendered as drawn. Both halves at one depth would
make the S-curve invisible. They are therefore two planes, which is a different symbol
than the painted one: *the halves differ in height*. On theme by accident, since the dots
mean "each half contains the seed of its opposite" and they are the one part a viewer
cannot resolve.

Shaun:

> "the right part of it looks... wonky :p it's not really there. but the left part -- i do
> dig the effect with the anti-correlated dot! i think that's a good use for it, just…
> maybe not this exact symbol since it doesn't map to stereograms well lmao"

**The wonky half was my error, and it is a reusable warning.** To make the two halves
clearly distinct I widened the budget from the shipped 18px to 60px, putting yang at
`sep 60` against a background of `120`. A **2:1 separation ratio is hard to hold in
simultaneous fusion**, and the near plane is the one that breaks. The yin half at `sep 93`
sits much closer to the background and read fine. Design §1's warning that the budget is a
perceptual decision rather than a tuning knob has a concrete failure mode: widen it to make
planes distinguishable and you lose the nearest plane instead.

So the verdict on the whole detour: **anticorrelation is a symbolic device, not a
material one.** It adds mystique to a small interior region of an otherwise solid figure,
and it is worth reaching for when unresolvability is the *point* — Shaun's suggestion was a
tesseract with elevated edges and anticorrelated inner faces.

## Open question if this is ever productised

How would a scene *declare* an anticorrelated region? Shaun's idea:

> "it might be worth trying to see how we define 'make this area anti-correlated'. maybe a
> 50% alpha (give or take, some minor error margin) area gets treated as
> 'anti-correlated'?"

Worth noting the collision: **alpha is already load-bearing.** In silhouette mode the mask
*is* the alpha channel and compositing is `max(depth, layerDepth × mask)`, so 50% alpha
already means "half depth" — a real surface halfway up, which is exactly what `emerge`
animates through. Overloading it would make a half-faded layer suddenly mean something
categorically different. A separate per-layer field (`anti: true`, or an `anticorrelate`
mask source alongside `alpha` and `{luma}`) keeps both meanings available. Not urgent;
recorded so the next attempt starts from the conflict rather than discovering it.
