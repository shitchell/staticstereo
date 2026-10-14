import type { AssertNever, Layer } from '../core/index.js'

/**
 * What to call a layer in the UI.
 *
 * Design §4.1: `name` is optional and **derived from content when absent**
 * (`HELLO`, `ball.png`, `circle`). The alternative — numbering layers and
 * letting the author rename them — is PowerPoint's animation pane, whose
 * documented first step is to go and rename everything, because "Rectangle 7"
 * tells you nothing about which rectangle it is. A derived name is already
 * the one fact the author would have typed.
 *
 * Shared, not per-surface: the panel, the CLI's diagnostics and any future
 * scene writer must agree on what a layer is called, or a bug report naming a
 * layer will not match what the reporter saw.
 */

/**
 * The last path segment of a `src` or `fn`.
 *
 * Only `/` is treated as a separator. A scene's `src` is a path *or a URL*,
 * both of which use it, and treating `\` as one too would mangle the handful
 * of filenames that legitimately contain a backslash on POSIX. Extensions are
 * kept — `ball.png` is the design's own example, and `.png` vs `.gif` is often
 * the only difference between two otherwise identically named layers.
 */
function basename(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? path : path.slice(cut + 1)
}

/**
 * `layer.name` if it has one, else a name derived from what the layer draws.
 *
 * **Never truncated**, however long the text is. Truncation is a view
 * concern: how much fits depends on the panel's width, its font and whether
 * the row is selected, none of which this module can see — and a model-level
 * function that silently shortened the value would also make the derived name
 * differ from the text the author typed, so searching for a layer by its own
 * content would fail. The renderer that has the width ellipsises; this
 * returns the whole thing.
 */
export function layerName(layer: Layer): string {
  if (layer.name !== undefined && layer.name !== '') return layer.name

  switch (layer.type) {
    case 'text':
      // The empty fallbacks below are not defensive padding: the site
      // validator accepts `text: ""`, and a `src` of `art/` has no basename.
      // A blank row in a panel names nothing at all, so the type — the one
      // thing still true about the layer — is what is left to say.
      return layer.text || layer.type
    case 'image':
    case 'gif':
      return basename(layer.src) || layer.type
    case 'shape':
      // The discriminator, not the type: `circle` and `rect` are what the
      // author distinguishes between, and both are already `shape`.
      return layer.shape
    case 'draw':
      // `fn` is a module path, so the same basename rule reads correctly and
      // keeps the extension that tells a `.js` plugin from a `.ts` one.
      return basename(layer.fn) || layer.type
    default: {
      // Adding a variant to `Layer` without naming it here is a COMPILE
      // error, not a blank row discovered in the panel. `layer` is `never`
      // only while every variant above is handled.
      const unhandled: AssertNever<typeof layer> = layer
      return unhandled
    }
  }
}
