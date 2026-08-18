// Enforces design-token usage in apps/web CSS (issue #148). `tokens.css` is
// the single declaration site (#147); every other stylesheet must consume
// `--hf-*` custom properties instead of raw color/radius literals. A
// justified escape hatch exists for genuine one-offs — see the reportDescriptionless*
// options below and docs/specs/cross-cutting/testing.md.

/** @type {import('stylelint').Config} */
export default {
  // A `stylelint-disable` comment with no `-- reason` is itself a lint error,
  // an unnecessary one is flagged, and disabling a rule that doesn't exist
  // (e.g. a typo) is flagged too. Together these make the escape hatch an
  // explicit, reviewable exception rather than a silent bypass.
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    "color-no-hex": true,
    // Named colors ("white", "black") are exactly as raw as a hex/oklch
    // literal — the codebase's few uses (button text, spinner rings) are
    // all a plain white foreground on a colored/dark background, now
    // tokenized via --hf-on-brand.
    "color-named": "never",
    // oklch/rgba had live usage at merge; rgb/hsl/hsla had none but are
    // banned pre-emptively — the Why here is "no raw color literal outside
    // tokens.css", not just the functions the issue happened to measure.
    "function-disallowed-list": ["oklch", "rgb", "rgba", "hsl", "hsla"],
    "declaration-property-value-disallowed-list": {
      // Matches border-radius and its four longhand corners. Requires at
      // least one bare `Npx` component so a plain `0` reset (no scale
      // concept applies to "no rounding") isn't forced through a token.
      "/^border(-(top|bottom)-(left|right))?-radius$/": [
        /^(?=.*px)(0|\d+(?:\.\d+)?px)(?:\s+(?:0|\d+(?:\.\d+)?px)){0,3}$/,
      ],
    },
  },
  overrides: [
    {
      // The token source itself declares the raw values everything else
      // must reference.
      files: ["apps/web/src/design/styles/tokens.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null,
        "declaration-property-value-disallowed-list": null,
      },
    },
  ],
};
