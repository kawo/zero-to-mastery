/* ==========================================================================
   Random Aesthetic Generator — behaviour
   --------------------------------------------------------------------------
   No dependencies, no build step. Sections:
     1. Curated data (fonts, pairings, presets)
     2. Small helpers
     3. Color maths and the WCAG contrast check
     4. Generators (palette, font pair)
     5. Applying and rendering
     6. Storage (favorites, settings)
     7. Exports and clipboard
     8. Events, shortcuts, init
   Loaded with `defer` from index.html, so it never blocks parsing and runs
   once the document is ready.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1. Curated data
     ====================================================================== */

  /* Twenty Google Fonts families, each with the weights actually loaded and a
     real fallback stack (so a blocked CDN degrades to something sensible).
     Only the weights listed are requested: asking for a weight a family
     doesn't publish makes the whole request fail. */
  var FONTS = {
    'Space Grotesk':      { weights: [400, 700], stack: 'system-ui, sans-serif' },
    'IBM Plex Sans':      { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'Playfair Display':   { weights: [400, 700], stack: 'Georgia, "Times New Roman", serif' },
    'Source Sans 3':      { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'Fraunces':           { weights: [400, 700], stack: 'Georgia, serif' },
    'Karla':              { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'DM Serif Display':   { weights: [400],      stack: 'Georgia, serif' },
    'DM Sans':            { weights: [400, 500], stack: 'system-ui, sans-serif' },
    'Bebas Neue':         { weights: [400],      stack: 'Impact, system-ui, sans-serif' },
    'Work Sans':          { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'Syne':               { weights: [600, 800], stack: 'system-ui, sans-serif' },
    'Manrope':            { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'Lora':               { weights: [400, 700], stack: 'Georgia, serif' },
    'Lato':               { weights: [400, 700], stack: 'system-ui, sans-serif' },
    'Outfit':             { weights: [400, 700], stack: 'system-ui, sans-serif' },
    'Nunito Sans':        { weights: [400, 600], stack: 'system-ui, sans-serif' },
    'Libre Baskerville':  { weights: [400, 700], stack: 'Georgia, serif' },
    'Oswald':             { weights: [400, 600], stack: 'Impact, system-ui, sans-serif' },
    'Merriweather':       { weights: [400, 700], stack: 'Georgia, serif' },
    'Rubik':              { weights: [400, 500], stack: 'system-ui, sans-serif' }
  };

  var DEFAULT_FONT = { weights: [400, 700], stack: 'system-ui, sans-serif' };

  /* Hand-checked pairings. Randomising from a curated list (rather than
     pairing any two families) is what keeps the results usable. */
  var PAIRS = [
    { heading: 'Space Grotesk',     body: 'IBM Plex Sans' },
    { heading: 'Playfair Display',  body: 'Source Sans 3' },
    { heading: 'Fraunces',          body: 'Karla' },
    { heading: 'DM Serif Display',  body: 'DM Sans' },
    { heading: 'Bebas Neue',        body: 'Work Sans' },
    { heading: 'Syne',              body: 'Manrope' },
    { heading: 'Lora',              body: 'Lato' },
    { heading: 'Outfit',            body: 'Nunito Sans' },
    { heading: 'Libre Baskerville', body: 'Work Sans' },
    { heading: 'Oswald',            body: 'Lato' },
    { heading: 'Merriweather',      body: 'Rubik' },
    { heading: 'Playfair Display',  body: 'Karla' },
    { heading: 'Fraunces',          body: 'Manrope' },
    { heading: 'Outfit',            body: 'IBM Plex Sans' }
  ];

  /* Three curated starting points, so the page is never empty on load. */
  var PRESETS = {
    minimal: {
      label: 'Minimal',
      scheme: 'Curated · neutral ramp',
      palette: ['#0F172A', '#334155', '#94A3B8', '#E2E8F0', '#F8FAFC'],
      fonts: { heading: 'Space Grotesk', body: 'IBM Plex Sans' }
    },
    playful: {
      label: 'Playful',
      scheme: 'Curated · warm to cool',
      palette: ['#073B4C', '#118AB2', '#06D6A0', '#FFD166', '#FF6B6B'],
      fonts: { heading: 'Outfit', body: 'Nunito Sans' }
    },
    bold: {
      label: 'Bold',
      scheme: 'Curated · high contrast',
      palette: ['#0A0A0A', '#1D3557', '#E63946', '#F4A261', '#F1FAEE'],
      fonts: { heading: 'Bebas Neue', body: 'Work Sans' }
    }
  };

  var STORAGE = { favorites: 'aesthetic.favorites', settings: 'aesthetic.settings' };
  var MAX_FAVORITES = 60;          // keeps localStorage small and the list scannable
  var AA_NORMAL = 4.5;             // WCAG 2.1 AA, normal text
  var AA_LARGE = 3;                // WCAG 2.1 AA, large text (18.66px bold / 24px)
  var HEX_RE = /^#[0-9A-Fa-f]{6}$/;
  var FAMILY_RE = /^[A-Za-z0-9 ]{2,40}$/;   // Google family names are plain words

  /* ======================================================================
     2. Small helpers
     ====================================================================== */
  var $ = function (id) { return document.getElementById(id); };
  var randInt = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };
  var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function stackOf(family) {
    return (FONTS[family] || DEFAULT_FONT).stack;
  }

  function headingWeight(family) {
    var weights = (FONTS[family] || DEFAULT_FONT).weights;
    return Math.max.apply(null, weights);
  }

  /* ======================================================================
     3. Color maths and contrast
     ====================================================================== */
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      var k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    var toHex = function (x) { return Math.round(x * 255).toString(16).padStart(2, '0'); };
    return ('#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4))).toUpperCase();
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** The reverse of hslToHex: used to read a hue and saturation out of a picked color. */
  function hexToHsl(hex) {
    var rgb = hexToRgb(hex).map(function (value) { return value / 255; });
    var max = Math.max.apply(null, rgb);
    var min = Math.min.apply(null, rgb);
    var delta = max - min;
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (delta) {
      saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === rgb[0]) hue = (rgb[1] - rgb[2]) / delta + (rgb[1] < rgb[2] ? 6 : 0);
      else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
      else hue = (rgb[0] - rgb[1]) / delta + 4;
      hue *= 60;
    }
    return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
  }

  /* WCAG 2.1 relative luminance (sRGB) */
  function relativeLuminance(hex) {
    var channels = hexToRgb(hex).map(function (value) {
      var c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  /* WCAG 2.1 contrast ratio: (lighter + 0.05) / (darker + 0.05) */
  function contrastRatio(hexA, hexB) {
    var a = relativeLuminance(hexA);
    var b = relativeLuminance(hexB);
    var lighter = Math.max(a, b);
    var darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /* Contrast of one color used as text on white and on black.
     The displayed number is floored, not rounded: rounding 4.49 up to "4.5"
     next to a FAIL badge looks like a bug. */
  function checkContrast(hex) {
    var build = function (against) {
      var ratio = contrastRatio(hex, against);
      return {
        ratio: ratio,
        display: (Math.floor(ratio * 100) / 100).toFixed(2),
        passAA: ratio >= AA_NORMAL,
        passAALarge: ratio >= AA_LARGE
      };
    };
    return { white: build('#FFFFFF'), black: build('#000000') };
  }

  /* Whichever of black/white is more readable on a given color. Pure black,
     not a softer near-black: at the luminance where the two are equally
     readable (around #767676) black is exactly 4.5:1, while #111111 only
     reaches 3.9:1 — which would leave mid-tone chips and buttons under AA. */
  function bestTextOn(hex) {
    return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#000000') ? '#FFFFFF' : '#000000';
  }

  /* Rough chroma (0–255): how far a color is from grey. Used to find the one
     color in a palette that can carry a call to action. */
  function chroma(hex) {
    var rgb = hexToRgb(hex);
    return Math.max.apply(null, rgb) - Math.min.apply(null, rgb);
  }

  /* ======================================================================
     4. Generators (pure: same input shape in, new combination out)
     ====================================================================== */

  /* Hue relationships that reliably look intentional. Each returns enough
     hues for a six-color palette. */
  var SCHEMES = {
    'Analogous':          function (h) { return [h, h + 18, h + 36, h - 18, h - 36, h + 54]; },
    'Complementary':      function (h) { return [h, h + 180, h + 12, h + 192, h - 12, h + 168]; },
    'Triadic':            function (h) { return [h, h + 120, h + 240, h + 12, h + 132, h + 252]; },
    'Split complementary':function (h) { return [h, h + 150, h + 210, h + 15, h + 165, h + 195]; },
    'Monochrome':         function (h) { return [h, h + 4, h - 4, h + 8, h - 8, h]; }
  };

  /**
   * A cohesive palette of 4–6 colors.
   * Lightness runs from a dark anchor to a light anchor so every palette is
   * usable as a real UI scale (and so the contrast badges are never all-fail).
   * Saturation eases off at the extremes, which is what keeps the darks from
   * going muddy and the lights from going neon.
   */
  /**
   * A "recipe" is everything a palette is built from. Keeping it around is
   * what lets the base-color and saturation controls morph a palette
   * smoothly: only the hue or the saturation changes, while the scheme, the
   * number of colors and the lightness ramp stay put. Shuffle rolls a new one.
   */
  function randomRecipe(options) {
    options = options || {};
    var count = options.count || randInt(4, 6);
    var jitter = [];
    for (var i = 0; i < count; i++) {
      jitter.push(i === 0 || i === count - 1 ? 0 : randInt(-4, 4));  // the anchors stay put
    }
    return {
      scheme: options.scheme || pick(Object.keys(SCHEMES)),
      hue: typeof options.hue === 'number' ? options.hue : randInt(0, 359),
      saturation: typeof options.saturation === 'number' ? options.saturation : randInt(38, 82),
      count: count,
      darkest: typeof options.darkest === 'number' ? options.darkest : randInt(8, 18),
      lightest: typeof options.lightest === 'number' ? options.lightest : randInt(88, 96),
      jitter: jitter,
      exact: options.exact || null
    };
  }

  /**
   * Builds the colors of a recipe. Lightness runs from a dark anchor to a
   * light one so every palette works as a real UI scale, and saturation eases
   * off at both ends, which keeps the darks from going muddy and the lights
   * from going neon. A picked base color is dropped into the slot closest to
   * its own lightness, so the color you chose is really in the palette.
   */
  function buildPalette(recipe) {
    var hues = SCHEMES[recipe.scheme](recipe.hue);
    var step = (recipe.lightest - recipe.darkest) / Math.max(1, recipe.count - 1);
    var palette = [];
    for (var i = 0; i < recipe.count; i++) {
      var lightness = recipe.darkest + step * i + (recipe.jitter[i] || 0);
      var edge = Math.abs(lightness - 50) / 50;                       // 0 mid, 1 at the extremes
      var saturation = Math.round(recipe.saturation * (1 - edge * 0.45));
      palette.push(hslToHex(hues[i % hues.length], Math.max(6, saturation), lightness));
    }
    if (recipe.exact && HEX_RE.test(recipe.exact)) {
      var target = hexToHsl(recipe.exact).l;
      var nearest = 0;
      var smallest = Infinity;
      palette.forEach(function (hex, index) {
        var distance = Math.abs(hexToHsl(hex).l - target);
        if (distance < smallest) { smallest = distance; nearest = index; }
      });
      palette[nearest] = recipe.exact.toUpperCase();
    }
    return palette;
  }

  /** A fresh random palette. `options` can pin the hue, saturation or count. */
  function getRandomPalette(options) {
    var recipe = randomRecipe(options);
    return {
      palette: buildPalette(recipe),
      recipe: recipe,
      scheme: recipe.scheme + ' · ' + recipe.count + ' colors'
    };
  }

  /** The most colorful swatch: what the base-color control shows for a palette
      that didn't come from a recipe (a preset or a saved favorite). */
  function baseFromPalette(palette) {
    var main = palette.slice().sort(function (a, b) { return chroma(b) - chroma(a); })[0] || palette[0];
    var hsl = hexToHsl(main);
    return { hex: main, hue: hsl.h, saturation: hsl.s };
  }

  /** A heading/body pair from the curated list, never the one already shown. */
  function pickFontPair(current) {
    var options = PAIRS.filter(function (pair) {
      return !current || pair.heading !== current.heading || pair.body !== current.body;
    });
    var chosen = pick(options);
    return { heading: chosen.heading, body: chosen.body };
  }

  /**
   * Colors for the preview, chosen from the palette with contrast in mind:
   * the headline takes the darkest color that is genuinely readable, and the
   * button takes the most saturated color that can carry black or white text.
   * The preview can therefore never render an unreadable sample.
   */
  /**
   * Colors for the preview, chosen against the background the preview is
   * actually on: white in light mode, near-black in dark mode. The same
   * palette therefore takes different roles in each theme — the colors that
   * read on white are rarely the ones that read on black.
   */
  function previewColors(palette, background) {
    background = background || '#FFFFFF';

    /* Text may only use colors that pass AA against that background, best
       contrast first. */
    var readable = palette
      .filter(function (hex) { return contrastRatio(hex, background) >= AA_NORMAL; })
      .sort(function (a, b) { return contrastRatio(b, background) - contrastRatio(a, background); });
    var fallbackInk = bestTextOn(background);
    var heading = readable[0] || fallbackInk;

    /* The filled button doesn't carry text of its own color, so it only has
       to stand apart from the background: 3:1, as WCAG asks of UI components. */
    var byChroma = palette.slice().sort(function (a, b) { return chroma(b) - chroma(a); });
    var accent = byChroma.filter(function (hex) { return contrastRatio(hex, background) >= 3; })[0] ||
      byChroma.sort(function (a, b) { return contrastRatio(b, background) - contrastRatio(a, background); })[0] ||
      heading;
    var accentText = bestTextOn(accent);

    /* Different colors for the smaller roles where the palette allows it, so
       the preview shows range rather than one color five times. */
    var others = readable.filter(function (hex) { return hex !== heading; });
    var eyebrow = others[0] || heading;
    var link = others[1] || others[0] || heading;
    /* The outline button avoids the filled button's color as well as the
       headline's: two identical buttons side by side show nothing. */
    var byChromaReadable = readable.slice().sort(function (a, b) { return chroma(b) - chroma(a); });
    var secondary = byChromaReadable.filter(function (hex) { return hex !== heading && hex !== accent; })[0] ||
      byChromaReadable.filter(function (hex) { return hex !== accent; })[0] ||
      byChromaReadable.filter(function (hex) { return hex !== heading; })[0] ||
      heading;

    /* Panel: the palette color closest in tone to the background (the lightest
       on white, the darkest on black), kept different enough to be visible,
       with the most readable palette color on top. */
    var backgroundLuminance = relativeLuminance(background);
    var byTone = palette.slice().sort(function (a, b) {
      return Math.abs(relativeLuminance(a) - backgroundLuminance) - Math.abs(relativeLuminance(b) - backgroundLuminance);
    });
    var surface = byTone.filter(function (hex) { return contrastRatio(hex, background) >= 1.12; })[0] || byTone[0] || background;
    var surfaceText = palette
      .slice()
      .sort(function (a, b) { return contrastRatio(b, surface) - contrastRatio(a, surface); })
      .filter(function (hex) { return contrastRatio(hex, surface) >= AA_NORMAL; })[0] || bestTextOn(surface);

    return {
      background: background,
      heading: heading,
      accent: accent,
      accentText: accentText,
      eyebrow: eyebrow,
      link: link,
      secondary: secondary,
      surface: surface,
      surfaceText: surfaceText,
      buttonRatio: contrastRatio(accent, accentText),
      panelRatio: contrastRatio(surface, surfaceText)
    };
  }

  /**
   * The preview's background. Read from the --preview-bg custom property
   * rather than the computed background-color: that property is in the middle
   * of a transition right after a theme switch, and would hand back the color
   * it is fading *from*. Custom properties jump straight to their new value.
   */
  function previewBackground() {
    var declared = getComputedStyle(elements.preview).getPropertyValue('--preview-bg').trim();
    if (HEX_RE.test(declared)) return declared.toUpperCase();
    var parts = (getComputedStyle(elements.preview).backgroundColor || '').match(/\d+/g);
    if (!parts || parts.length < 3) return '#FFFFFF';
    return ('#' + parts.slice(0, 3).map(function (channel) {
      return Number(channel).toString(16).padStart(2, '0');
    }).join('')).toUpperCase();
  }

  /* ======================================================================
     5. Applying and rendering
     ====================================================================== */
  var state = {
    palette: [],
    recipe: null,                 // how the current palette was built (null for presets/favorites)
    base: { hex: '#0F172A', hue: 222, saturation: 47 },
    keepBase: false,              // keep the base color and saturation when shuffling
    scheme: '',
    fonts: { heading: '', body: '' },
    favorites: [],
    settings: { theme: 'light', shortcuts: true },
    preset: null,
    storageWorks: true
  };

  var elements = {};
  var loadedFamilies = new Set();

  /* The live preview controls. Each role keeps its own settings, because a
     headline and a paragraph want very different sizes. `custom` stays false
     until something is actually changed: while it is false the preview keeps
     the responsive clamp() sizes from the stylesheet. */
  var WEIGHT_NAMES = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extrabold', 900: 'Black' };
  var SPECIMEN_LIMITS = {
    heading: { min: 16, max: 120, leadMin: 0.8, leadMax: 2.2 },
    body: { min: 12, max: 48, leadMin: 1, leadMax: 2.2 }
  };
  var specimen = {
    role: 'heading',
    heading: { text: '', size: 48, weight: 700, leading: 1.1, custom: false },
    body: { text: '', size: 16, weight: 400, leading: 1.65, custom: false }
  };
  var stockCopy = { heading: '', body: null };   // filled in at init

  /** Injects one Google Fonts stylesheet per family, only when first used. */
  function ensureFamilyLoaded(family) {
    if (loadedFamilies.has(family)) return;
    var config = FONTS[family] || DEFAULT_FONT;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' +
      encodeURIComponent(family).replace(/%20/g, '+') +
      ':wght@' + config.weights.join(';') + '&display=swap';
    document.head.appendChild(link);
    loadedFamilies.add(family);
  }

  /** Loads the pair and points the preview's font variables at it. */
  function applyFonts(fonts) {
    ensureFamilyLoaded(fonts.heading);
    ensureFamilyLoaded(fonts.body);

    var preview = elements.preview;
    preview.style.setProperty('--font-heading', '"' + fonts.heading + '", ' + stackOf(fonts.heading));
    preview.style.setProperty('--font-body', '"' + fonts.body + '", ' + stackOf(fonts.body));
    preview.style.setProperty('--weight-heading', String(headingWeight(fonts.heading)));

    elements.headingName.textContent = fonts.heading + ' · ' + headingWeight(fonts.heading);
    elements.bodyName.textContent = fonts.body + ' · 400';
    dressPairingLink(elements.headingLink, fonts.heading);
    dressPairingLink(elements.bodyLink, fonts.body);

    /* Any warning belongs to the pairing that just left: drop it now, and let
       the check below decide again for this one. */
    clearTimeout(checkFontsArrived.retry);
    elements.previewWarning.hidden = true;
    elements.previewWarning.textContent = '';

    /* Dim the preview until the faces are ready, but never wait forever:
       an offline or blocked CDN just falls back to the stack above. */
    preview.classList.add('is-loading');
    var done = function () {
      preview.classList.remove('is-loading');
      /* Shuffling quickly leaves earlier loads still running: only the
         pairing that is actually on screen gets to report. */
      if (state.fonts.heading === fonts.heading && state.fonts.body === fonts.body) {
        checkFontsArrived(fonts);
      }
      syncSpecimenToFonts();   // the new family may not publish the old weight
    };
    if (document.fonts && document.fonts.load) {
      Promise.race([
        Promise.all([
          document.fonts.load(headingWeight(fonts.heading) + ' 1rem "' + fonts.heading + '"'),
          document.fonts.load('400 1rem "' + fonts.body + '"')
        ]),
        new Promise(function (resolve) { setTimeout(resolve, 2500); })
      ]).then(done, done);
    } else {
      setTimeout(done, 400);
    }
  }

  /**
   * The "View on Google Fonts" link under a family name. A font that came
   * from a file has no page to point at, so the link steps aside.
   */
  function dressPairingLink(link, family) {
    var config = FONTS[family];
    /* Built-in families and ones found through the search have a specimen
       page; a font from a file or a direct link does not. */
    var onGoogle = !config || !config.source || config.specimen === true;
    link.hidden = !onGoogle;
    if (!onGoogle) return;
    link.href = 'https://fonts.google.com/specimen/' + family.replace(/ /g, '+');
    link.setAttribute('aria-label', family + ' on Google Fonts (opens in a new tab)');
  }

  /** One contrast badge ("On white 8.59:1 ✓"), readable by screen readers. */
  function renderBadge(against, result) {
    var li = document.createElement('li');
    li.className = 'badge ' + (result.passAA ? 'is-pass' : 'is-fail');

    var mark = document.createElement('span');
    mark.className = 'badge-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = result.passAA ? '✓' : '✕';

    var text = document.createElement('span');
    text.textContent = 'On ' + against + ' ' + result.display + ':1';

    /* Spelled out for screen readers: the tick alone carries no meaning. */
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = result.passAA
      ? ', passes WCAG AA for normal text'
      : (result.passAALarge
        ? ', fails WCAG AA for normal text, passes for large text'
        : ', fails WCAG AA');

    li.appendChild(mark);
    li.appendChild(text);
    li.appendChild(sr);
    return li;
  }

  /** Swatches with HEX labels, copy buttons and contrast badges. */
  function renderPalette(palette, scheme, live) {
    var list = elements.paletteList;
    list.classList.toggle('is-live', Boolean(live));   // no entrance animation while dragging
    list.textContent = '';

    palette.forEach(function (hex, index) {
      var item = document.createElement('li');
      item.className = 'swatch';
      item.style.setProperty('--i', String(index));

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch-btn';
      button.dataset.hex = hex;
      button.setAttribute('aria-label', 'Copy ' + hex + ' to clipboard');

      var chip = document.createElement('span');
      chip.className = 'swatch-chip';
      chip.style.backgroundColor = hex;
      chip.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'swatch-hex';
      label.textContent = hex;

      var hint = document.createElement('span');
      hint.className = 'swatch-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Copy';

      button.appendChild(chip);
      button.appendChild(label);
      button.appendChild(hint);

      var badges = document.createElement('ul');
      badges.className = 'badges';
      var contrast = checkContrast(hex);
      badges.appendChild(renderBadge('white', contrast.white));
      badges.appendChild(renderBadge('black', contrast.black));

      item.appendChild(button);
      item.appendChild(badges);
      list.appendChild(item);
    });

    elements.schemeTag.textContent = scheme;
  }

  /** Applies the palette's colors to the preview and replays its entrance. */
  function renderPreview(combo, live) {
    var preview = elements.preview;
    var colors = previewColors(combo.palette, previewBackground());
    preview.style.setProperty('--preview-heading', colors.heading);
    preview.style.setProperty('--preview-accent', colors.accent);
    preview.style.setProperty('--preview-accent-text', colors.accentText);
    preview.style.setProperty('--preview-secondary', colors.secondary);
    preview.style.setProperty('--preview-link', colors.link);
    preview.style.setProperty('--preview-surface', colors.surface);
    preview.style.setProperty('--preview-surface-text', colors.surfaceText);
    elements.eyebrow.style.color = colors.eyebrow;

    /* The sample controls are real: each copies the color it is showing, the
       way the swatches do, and the link opens the body face's specimen. */
    elements.previewButton.title = 'Copy ' + colors.accent;
    elements.previewButton.dataset.hex = colors.accent;
    elements.previewSecondary.title = 'Copy ' + colors.secondary;
    elements.previewSecondary.dataset.hex = colors.secondary;
    dressPreviewLink();

    elements.previewPanelText.textContent =
      colors.surface + ' as a surface, with ' + colors.surfaceText +
      ' on top: the pairing you would reach for on a card.';

    /* One chip per color, each with the black or white text that reads best
       on it — the contrast badges above, shown in use. */
    elements.previewChips.textContent = '';
    combo.palette.forEach(function (hex) {
      var chip = document.createElement('li');
      chip.className = 'preview-chip';
      chip.style.backgroundColor = hex;
      chip.style.color = bestTextOn(hex);
      chip.textContent = hex;
      elements.previewChips.appendChild(chip);
    });

    var ratio = (Math.floor(colors.buttonRatio * 100) / 100).toFixed(2);
    var panelRatio = (Math.floor(colors.panelRatio * 100) / 100).toFixed(2);
    elements.previewNote.textContent =
      'Every color here is checked first: the button is ' + colors.accent + ' with ' +
      (colors.accentText === '#FFFFFF' ? 'white' : 'black') + ' text (' + ratio + ':1), ' +
      'the panel is ' + colors.surface + ' with ' + colors.surfaceText + ' text (' + panelRatio + ':1), ' +
      'and headings, links and the outline button only use colors that pass AA on ' + colors.background + ', ' +
      'the background this preview is on.';

    /* Restart the animation: drop the class, force a reflow, add it back.
       Skipped while a control is being dragged, or it would flicker. */
    if (!live) {
      preview.classList.remove('is-in');
      void preview.offsetWidth;
      preview.classList.add('is-in');
    }
  }

  function renderExports(combo) {
    elements.cssOutput.textContent = exportCSSVars(combo);
    elements.jsonOutput.textContent = exportJSON(combo);
  }

  /** Marks which curated preset (if any) is showing. */
  function renderPresets() {
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-preset]'), function (chip) {
      chip.setAttribute('aria-pressed', String(chip.dataset.preset === state.preset));
    });
  }

  /** The single entry point for showing a combination. */
  function applyCombo(combo, options) {
    options = options || {};
    state.palette = combo.palette.slice();
    state.scheme = combo.scheme || '';
    state.fonts = { heading: combo.fonts.heading, body: combo.fonts.body };
    state.preset = options.preset || null;
    state.recipe = options.recipe || null;
    /* The base control follows whatever is on screen: the seed it was built
       from, or the most colorful swatch of a preset or saved combination. */
    state.base = options.base || baseFromPalette(state.palette);

    applyFonts(state.fonts);
    renderPalette(state.palette, state.scheme, options.live || options.paletteStill);
    renderPreview(state, options.live);
    renderExports(state);
    renderPresets();
    renderBaseControls();
  }

  /** Puts the current base color and saturation into the two controls. */
  function renderBaseControls() {
    elements.baseColor.value = state.base.hex.toLowerCase();
    elements.baseColorValue.textContent = state.base.hex.toUpperCase();
    elements.saturation.value = String(state.base.saturation);
    elements.saturationValue.textContent = state.base.saturation + '%';
  }

  /* A preset or a favorite has no recipe, so the first tweak makes one from
     what's on screen: same number of colors, the chosen hue and saturation. */
  function ensureRecipe() {
    if (!state.recipe) {
      state.recipe = randomRecipe({
        count: state.palette.length,
        hue: state.base.hue,
        saturation: state.base.saturation
      });
    }
    return state.recipe;
  }

  /**
   * Rebuilds the palette from the two controls, keeping the scheme, the
   * number of colors, the lightness ramp and the fonts. `live` is true while
   * a control is being dragged.
   */
  function updateFromControls(source, live) {
    var hex = elements.baseColor.value.toUpperCase();
    var hsl = hexToHsl(hex);
    var saturation;

    if (source === 'color') {
      /* Picking a color moves the slider to that color's own saturation, so
         the chosen color and the palette around it agree. */
      saturation = hsl.s;
      elements.saturation.value = String(saturation);
    } else {
      /* Dragging the slider carries the base color with it: its hue and
         lightness stay, its saturation follows the slider. */
      saturation = Number(elements.saturation.value);
      hex = hslToHex(hsl.h, saturation, hsl.l);
      hsl = hexToHsl(hex);
    }

    var recipe = Object.assign({}, ensureRecipe(), { hue: hsl.h, saturation: saturation, exact: hex });
    applyCombo(
      { palette: buildPalette(recipe), scheme: recipe.scheme + ' · ' + recipe.count + ' colors', fonts: state.fonts },
      { recipe: recipe, base: { hex: hex, hue: hsl.h, saturation: saturation }, live: live }
    );
  }

  /* Dragging fires many events a second: rebuild at most once per frame. */
  var controlFrame = 0;
  function scheduleControlUpdate(source) {
    if (controlFrame) cancelAnimationFrame(controlFrame);
    controlFrame = requestAnimationFrame(function () {
      controlFrame = 0;
      updateFromControls(source, true);
    });
  }

  function shuffle() {
    /* With "Keep on shuffle" ticked, the base color and saturation carry over
       and only the scheme, the number of colors and the fonts change. */
    var seed = state.keepBase
      ? { hue: state.base.hue, saturation: state.base.saturation, exact: state.base.hex }
      : {};
    var generated = getRandomPalette(seed);
    applyCombo({
      palette: generated.palette,
      scheme: generated.scheme,
      fonts: pickFontPair(state.fonts)
    }, {
      recipe: generated.recipe,
      base: state.keepBase ? state.base : undefined   // undefined: read it back off the new palette
    });
    toast('New palette and pairing: ' + state.fonts.heading + ' with ' + state.fonts.body);
  }

  /** A new pairing for the palette already on screen. */
  function shuffleFonts() {
    applyCombo({
      palette: state.palette,
      scheme: state.scheme,
      fonts: pickFontPair(state.fonts)
    }, {
      recipe: state.recipe,
      base: state.base,
      /* The swatches haven't changed, so they shouldn't replay their
         entrance animation; the preview still does. */
      paletteStill: true
    });
    toast('New pairing: ' + state.fonts.heading + ' with ' + state.fonts.body);
  }

  /* ---------- Live preview controls ---------- */

  /** Keeps a number inside its range; falls back if it isn't a number at all. */
  function clampNumber(value, min, max, fallback) {
    var number = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function specimenTarget(role) {
    return role === 'heading' ? elements.previewHeadline : elements.previewBody;
  }

  /** Puts the stock sample back, links and all (the body holds an <a>). */
  function restoreStock(role) {
    if (role === 'heading') {
      elements.previewHeadline.textContent = stockCopy.heading;
      return;
    }
    elements.previewBody.replaceChildren.apply(elements.previewBody, stockCopy.body.map(function (node) {
      return node.cloneNode(true);
    }));
    /* The link is a fresh node now, so take hold of it again and re-dress it. */
    elements.previewLink = $('preview-link');
    dressPreviewLink();
  }

  function dressPreviewLink() {
    if (!elements.previewLink) return;
    var config = FONTS[state.fonts.body];
    if (config && config.source && !config.specimen) {
      /* A font from a file: nothing to link to, so it reads as plain text. */
      elements.previewLink.removeAttribute('href');
      elements.previewLink.removeAttribute('target');
      elements.previewLink.title = state.fonts.body + ' was added from a file';
      return;
    }
    elements.previewLink.href = 'https://fonts.google.com/specimen/' + state.fonts.body.replace(/ /g, '+');
    elements.previewLink.target = '_blank';
    elements.previewLink.title = state.fonts.body + ' on Google Fonts (opens in a new tab)';
  }

  /** Writes both roles' text and type settings into the preview. */
  function applySpecimen() {
    ['heading', 'body'].forEach(function (role) {
      var settings = specimen[role];
      var target = specimenTarget(role);
      if (settings.text) target.textContent = settings.text;
      else if (target.textContent !== stockCopy[role] || role === 'body') restoreStock(role);

      if (settings.custom) {
        target.style.fontSize = settings.size + 'px';
        target.style.fontWeight = String(settings.weight);
        target.style.lineHeight = String(settings.leading);
      } else {
        /* Nothing set by hand: let the stylesheet's responsive sizes stand. */
        target.style.fontSize = '';
        target.style.fontWeight = '';
        target.style.lineHeight = '';
      }
    });
  }

  /** The weights this role's family really publishes. */
  function weightsForRole(role) {
    var family = role === 'heading' ? state.fonts.heading : state.fonts.body;
    return (FONTS[family] || DEFAULT_FONT).weights;
  }

  /** Fills the controls from the settings of the role being edited. */
  function renderSpecimenControls() {
    var role = specimen.role;
    var settings = specimen[role];
    var limits = SPECIMEN_LIMITS[role];
    var weights = weightsForRole(role);

    [].forEach.call(elements.specimenRole.querySelectorAll('[data-role]'), function (option) {
      var checked = option.dataset.role === role;
      option.setAttribute('aria-checked', String(checked));
      option.tabIndex = checked ? 0 : -1;
    });

    elements.specimenText.value = settings.text;

    elements.specimenSize.min = String(limits.min);
    elements.specimenSize.max = String(limits.max);
    elements.specimenSize.value = String(Math.round(settings.size));
    elements.specimenSizeValue.textContent = Math.round(settings.size) + 'px';

    elements.specimenLeading.min = String(limits.leadMin);
    elements.specimenLeading.max = String(limits.leadMax);
    elements.specimenLeading.value = String(settings.leading);
    elements.specimenLeadingValue.textContent = Number(settings.leading).toFixed(2);

    /* Only the weights the family publishes: asking for one it doesn't have
       would silently render a synthesised face. */
    elements.specimenWeight.replaceChildren.apply(elements.specimenWeight, weights.map(function (weight) {
      var option = document.createElement('option');
      option.value = String(weight);
      option.textContent = weight + (WEIGHT_NAMES[weight] ? ' · ' + WEIGHT_NAMES[weight] : '');
      option.selected = weight === settings.weight;
      return option;
    }));
    elements.specimenWeight.disabled = weights.length < 2;
    elements.specimenReset.disabled = !settings.custom && !settings.text;
  }

  /**
   * Reads whatever the stylesheet is currently rendering, so the controls
   * start from the real values instead of guesses, and clamps the chosen
   * weight to what the new family actually has.
   */
  function syncSpecimenToFonts() {
    ['heading', 'body'].forEach(function (role) {
      var settings = specimen[role];
      var weights = weightsForRole(role);
      if (weights.indexOf(settings.weight) === -1) {
        /* Nearest published weight, so switching families never asks for one
           the font doesn't have. */
        settings.weight = weights.reduce(function (best, weight) {
          return Math.abs(weight - settings.weight) < Math.abs(best - settings.weight) ? weight : best;
        }, weights[0]);
      }
      if (settings.custom) return;
      var computed = getComputedStyle(specimenTarget(role));
      var size = parseFloat(computed.fontSize);
      var limits = SPECIMEN_LIMITS[role];
      if (isFinite(size)) settings.size = clampNumber(Math.round(size), limits.min, limits.max, settings.size);
      var leading = parseFloat(computed.lineHeight) / (size || 1);
      if (isFinite(leading)) settings.leading = clampNumber(Math.round(leading * 20) / 20, limits.leadMin, limits.leadMax, settings.leading);
    });
    renderSpecimenControls();
  }

  /** One control moved: store it, apply it, update the readouts. */
  function updateSpecimen(which) {
    var role = specimen.role;
    var settings = specimen[role];
    var limits = SPECIMEN_LIMITS[role];

    if (which === 'text') {
      settings.text = elements.specimenText.value.slice(0, 300);
    } else {
      settings.custom = true;
      settings.size = clampNumber(elements.specimenSize.value, limits.min, limits.max, settings.size);
      settings.leading = clampNumber(elements.specimenLeading.value, limits.leadMin, limits.leadMax, settings.leading);
      var weights = weightsForRole(role);
      var chosen = clampNumber(elements.specimenWeight.value, 100, 900, settings.weight);
      settings.weight = weights.indexOf(chosen) === -1 ? weights[0] : chosen;
      elements.specimenSizeValue.textContent = Math.round(settings.size) + 'px';
      elements.specimenLeadingValue.textContent = Number(settings.leading).toFixed(2);
    }
    elements.specimenReset.disabled = !settings.custom && !settings.text;
    applySpecimen();
  }

  /** Back to the sample copy and the stylesheet's own sizes, for this role. */
  function resetSpecimen() {
    var role = specimen.role;
    specimen[role] = { text: '', size: specimen[role].size, weight: weightsForRole(role)[0], leading: specimen[role].leading, custom: false };
    applySpecimen();
    syncSpecimenToFonts();
    toast(role === 'heading' ? 'Heading reset to the sample' : 'Body reset to the sample');
  }

  /**
   * Says so when a family didn't arrive (offline, or Google Fonts blocked):
   * the preview falls back to the stack declared with the family, and the
   * message names what happened rather than leaving it a mystery.
   */
  /**
   * True when a family is really there to render with.
   *
   * Not document.fonts.check(): that answers "can this font string be
   * rendered", and an unknown family quietly falls back to a system face, so
   * it returns true for a family that never arrived. Measuring is what tells
   * the truth — the same text is measured with two very different fallbacks,
   * and if the family loaded, both measurements are of the family itself and
   * match; if it didn't, monospace and cursive give different widths.
   */
  function familyIsAvailable(family, weight) {
    /* A face added from JavaScript (an upload, or a URL) is in the document's
       font set. Canvas measuring can't see those — Chromium only measures
       with fonts that came from the stylesheet — so ask the set first. */
    try {
      var added = false;
      document.fonts.forEach(function (face) {
        if (face.family.replace(/^["']|["']$/g, '') === family && face.status === 'loaded') added = true;
      });
      if (added) return true;
    } catch (error) {
      /* No font set to ask: fall through to measuring. */
    }

    try {
      var canvas = familyIsAvailable.canvas || (familyIsAvailable.canvas = document.createElement('canvas'));
      var context = canvas.getContext('2d');
      var sample = 'MMMWWWiiilll0123gjpqy';
      context.font = weight + ' 48px "' + family + '", monospace';
      var withMono = context.measureText(sample).width;
      context.font = weight + ' 48px "' + family + '", cursive';
      var withCursive = context.measureText(sample).width;
      return Math.abs(withMono - withCursive) < 0.5;
    } catch (error) {
      return true;   // can't tell: say nothing rather than warn wrongly
    }
  }

  function checkFontsArrived(fonts) {
    var missing = [fonts.heading, fonts.body].filter(function (family, index) {
      return !familyIsAvailable(family, index === 0 ? headingWeight(family) : 400);
    });
    /* Both roles can use the same family; don't name it twice. */
    missing = missing.filter(function (family, index) { return missing.indexOf(family) === index; });
    elements.previewWarning.hidden = missing.length === 0;
    if (missing.length) {
      /* A slow connection can still be fetching: look again shortly, and take
         the warning back if the font turned up after all. */
      clearTimeout(checkFontsArrived.retry);
      checkFontsArrived.retry = setTimeout(function () {
        if (state.fonts.heading === fonts.heading && state.fonts.body === fonts.body) checkFontsArrived(fonts);
      }, 2500);
      /* A family added from a file has no Google Fonts to blame: say what is
         actually true of it instead. */
      var fromGoogle = missing.every(function (family) {
        var config = FONTS[family];
        return !config || !config.source || config.specimen === true;
      });
      elements.previewWarning.textContent = missing.join(' and ') +
        (fromGoogle
          ? ' could not be loaded from Google Fonts'
          : (missing.length > 1 ? ' are not available' : ' is not available')) +
        ' — showing ' + stackOf(missing[0]).split(',')[0] + ' instead.';
    }
  }

  /* ---------- Adding fonts: Google Fonts, a URL, or a file ---------- */

  var MAX_FONT_BYTES = 5 * 1024 * 1024;        // 5 MB: a generous woff2 is ~100 KB
  /* Extension → the format() hint that goes with it. Anything not in here is
     refused before a single byte is read. */
  var FONT_FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
  /* Types browsers and operating systems really report for those files.
     Windows often reports nothing at all, so '' is allowed and the extension
     and the actual parse are what decide. */
  var FONT_TYPES = ['', 'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'font/sfnt',
    'application/font-woff', 'application/font-woff2', 'application/x-font-woff',
    'application/x-font-ttf', 'application/x-font-otf', 'application/vnd.ms-opentype',
    'application/octet-stream'];

  var addedFonts = [];        // what was added this visit, for the chips
  var catalogue = null;       // Google's family list, fetched once, on demand

  /**
   * A family name safe to put in CSS and in a saved favorite: letters, digits
   * and spaces only, so it can never close a string or open a declaration.
   * Made unique, since two files can share a name.
   */
  /* Files served from a CDN are often named like "UcCO3FwrK3iLTeHuS0nVMrM":
     that is an identifier, not a name worth showing. */
  function looksLikeAHash(stem) {
    return /^[A-Za-z0-9_-]{16,}$/.test(stem) && /\d/.test(stem) && /[a-z]/.test(stem) && /[A-Z]/.test(stem);
  }

  function safeFamilyName(raw, fallback) {
    if (looksLikeAHash(String(raw || '').trim())) raw = '';
    var name = String(raw || '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) name = fallback;
    var unique = name;
    var suffix = 2;
    while (FONTS[unique]) {
      unique = name + ' ' + suffix;
      suffix += 1;
    }
    return unique;
  }

  function showFontError(message) {
    elements.fontError.textContent = message || '';
  }

  /** Adds a family to the app: it now behaves like any curated one. */
  function registerFont(name, config) {
    FONTS[name] = config;
    loadedFamilies.add(name);   // never ask Google for it
    addedFonts.push({ name: name, source: config.source });
    renderAddedFonts();
  }

  function useFont(name, role) {
    var fonts = { heading: state.fonts.heading, body: state.fonts.body };
    fonts[role] = name;
    applyCombo(
      { palette: state.palette, scheme: state.scheme, fonts: fonts },
      { recipe: state.recipe, base: state.base, paletteStill: true }
    );
    toast(name + ' set as the ' + role + ' font');
  }

  function renderAddedFonts() {
    elements.addedFonts.hidden = addedFonts.length === 0;
    elements.addedList.replaceChildren.apply(elements.addedList, addedFonts.map(function (font) {
      var item = document.createElement('li');
      item.className = 'added-item';

      var name = document.createElement('span');
      name.className = 'added-name';
      name.textContent = font.name;
      var source = document.createElement('span');
      source.className = 'added-source';
      source.textContent = font.source;
      item.append(name, source);

      ['heading', 'body'].forEach(function (role) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm';
        button.textContent = role === 'heading' ? 'Heading' : 'Body';
        button.setAttribute('aria-label', 'Use ' + font.name + ' as the ' + role + ' font');
        button.addEventListener('click', function () { useFont(font.name, role); });
        item.appendChild(button);
      });
      return item;
    }));
  }

  /**
   * Fetches a Google Fonts stylesheet and puts it in the page.
   *
   * Not a <link>: a family that doesn't exist answers with an error page,
   * and a link can only report that as a console message the page can't see,
   * after the load has timed out. Fetching gives the status straight away.
   * If fetching isn't allowed here, it falls back to a <link>.
   */
  function loadFontStylesheet(href) {
    if (typeof fetch !== 'function') return Promise.resolve(linkStylesheet(href));
    return fetch(href).then(function (response) {
      if (!response.ok) return { ok: false };
      return response.text().then(function (css) {
        if (css.indexOf('@font-face') === -1) return { ok: false };
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        return { ok: true, node: style };
      });
    }).catch(function () {
      /* Blocked (an origin Google won't share with, say): try the old way. */
      return linkStylesheet(href);
    });
  }

  function linkStylesheet(href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    return { ok: true, node: link, unverified: true };
  }

  /** Waits until a family really renders, or gives up. */
  function waitForFamily(family, weight) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + 4000;
      if (document.fonts && document.fonts.load) {
        document.fonts.load(weight + ' 1rem "' + family + '"').catch(function () {});
      }
      var tick = function () {
        if (familyIsAvailable(family, weight)) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  /**
   * Google's own catalogue, fetched straight from the browser: no API key and
   * no server. If it can't be reached (offline, or an origin the endpoint
   * won't share with, such as a file:// page), the built-in families stand in
   * and any family name can still be typed by hand.
   */
  function loadCatalogue() {
    if (catalogue) return Promise.resolve(catalogue);
    return fetch('https://fonts.google.com/metadata/fonts')
      .then(function (response) { return response.text(); })
      .then(function (text) {
        /* The response starts with )]}' to make it useless as a script. */
        var data = JSON.parse(text.replace(/^\)\]\}'[^\n]*\n?/, ''));
        catalogue = (data.familyMetadataList || []).map(function (item) {
          return {
            family: item.family,
            weights: Object.keys(item.fonts || {})
              .filter(function (key) { return /^\d+$/.test(key); })
              .map(Number)
              .sort(function (a, b) { return a - b; })
          };
        }).filter(function (item) { return item.family; });
        elements.fontSearchHint.textContent = catalogue.length + ' families from Google Fonts. Start typing to search.';
        return catalogue;
      })
      .catch(function () {
        catalogue = Object.keys(FONTS).map(function (family) {
          return { family: family, weights: FONTS[family].weights };
        });
        elements.fontSearchHint.textContent =
          'Google\u2019s catalogue couldn\u2019t be fetched here, so the built-in families are listed. ' +
          'Any family name can still be typed and tried.';
        return catalogue;
      });
  }

  /** Up to twenty matches for what has been typed, for the datalist. */
  function renderCatalogueMatches() {
    if (!catalogue) return;
    var typed = elements.fontSearch.value.trim().toLowerCase();
    var matches = catalogue
      .filter(function (item) { return !typed || item.family.toLowerCase().indexOf(typed) !== -1; })
      .slice(0, 20);
    elements.fontCatalogue.replaceChildren.apply(elements.fontCatalogue, matches.map(function (item) {
      var option = document.createElement('option');
      option.value = item.family;
      return option;
    }));
  }

  /** The weights worth loading: the ones the app uses, when the family has them. */
  function weightsToLoad(available) {
    var wanted = (available || []).filter(function (weight) { return weight === 400 || weight === 700; });
    if (wanted.length) return wanted;
    if (available && available.length) return [available[0]];
    return [400];
  }

  function addGoogleFont() {
    var typed = elements.fontSearch.value.trim();
    showFontError('');
    if (!typed) return showFontError('Type a family name first.');
    if (!/^[A-Za-z0-9 ]{2,40}$/.test(typed)) {
      return showFontError('Family names are letters, digits and spaces.');
    }
    var known = (catalogue || []).filter(function (item) {
      return item.family.toLowerCase() === typed.toLowerCase();
    })[0];
    var family = known ? known.family : typed;

    if (FONTS[family] && loadedFamilies.has(family)) {
      useFont(family, specimen.role);
      return;
    }

    var weights = weightsToLoad(known && known.weights);
    var href = 'https://fonts.googleapis.com/css2?family=' +
      encodeURIComponent(family).replace(/%20/g, '+') +
      ':wght@' + weights.join(';') + '&display=swap';

    elements.fontSearchAdd.disabled = true;
    loadFontStylesheet(href).then(function (sheet) {
      if (!sheet.ok) {
        elements.fontSearchAdd.disabled = false;
        showFontError('Couldn\u2019t find \u201c' + family + '\u201d on Google Fonts. Check the spelling, or try another family.');
        return Promise.resolve(false);
      }
      return waitForFamily(family, weights[0]).then(function (arrived) {
        if (!arrived && sheet.node) sheet.node.remove();
        return arrived;
      });
    }).then(function (arrived) {
      elements.fontSearchAdd.disabled = false;
      if (!arrived) {
        if (elements.fontError.textContent === '') {
          showFontError('\u201c' + family + '\u201d didn\u2019t arrive. It may be blocked here, or the connection may be down.');
        }
        return;
      }
      registerFont(family, { weights: weights, stack: 'system-ui, sans-serif', source: 'Google Fonts', specimen: true });
      elements.fontSearch.value = '';
      useFont(family, specimen.role);
    });
  }

  function addFontFromUrl() {
    var raw = elements.fontUrl.value.trim();
    showFontError('');
    if (!raw) return showFontError('Paste a link to a font file first.');

    var url;
    try {
      url = new URL(raw);
    } catch (error) {
      return showFontError('That doesn\u2019t look like a web address.');
    }
    /* https only, so a font can't be swapped in transit — with localhost
       allowed, since that is where people test their own files. */
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
      return showFontError('Only https links are accepted (or http on localhost).');
    }
    /* The address ends up inside a CSS url("…"): refuse anything that could
       close that string. */
    if (/["'()\\]/.test(url.href)) {
      return showFontError('That link contains characters that can\u2019t be used in CSS.');
    }

    if (url.hostname === 'fonts.googleapis.com') {
      var family = (new URLSearchParams(url.search).get('family') || '').split(':')[0].replace(/\+/g, ' ');
      if (!/^[A-Za-z0-9 ]{2,40}$/.test(family)) return showFontError('That Google Fonts link doesn\u2019t name a family.');
      elements.fontUrlAdd.disabled = true;
      loadFontStylesheet(url.href).then(function (sheet) {
        if (!sheet.ok) return false;
        return waitForFamily(family, 400).then(function (arrived) {
          if (!arrived && sheet.node) sheet.node.remove();
          return arrived;
        });
      }).then(function (arrived) {
        elements.fontUrlAdd.disabled = false;
        if (!arrived) {
          return showFontError('That stylesheet didn\u2019t give us \u201c' + family + '\u201d.');
        }
        registerFont(family, { weights: [400], stack: 'system-ui, sans-serif', source: 'Google Fonts link', specimen: true });
        elements.fontUrl.value = '';
        useFont(family, specimen.role);
      });
      return;
    }

    var extension = (url.pathname.split('.').pop() || '').toLowerCase();
    if (!FONT_FORMATS[extension]) {
      return showFontError('The link must end in .woff2, .woff, .ttf or .otf.');
    }
    var name = safeFamilyName(decodeURIComponent(url.pathname.split('/').pop()).replace(/\.[^.]+$/, ''), 'Custom Font');
    var face = new FontFace(name, 'url("' + url.href + '") format("' + FONT_FORMATS[extension] + '")');
    elements.fontUrlAdd.disabled = true;
    face.load().then(function (loaded) {
      document.fonts.add(loaded);
      elements.fontUrlAdd.disabled = false;
      registerFont(name, { weights: [400], stack: 'system-ui, sans-serif', source: 'From a link' });
      elements.fontUrl.value = '';
      useFont(name, specimen.role);
    }).catch(function () {
      elements.fontUrlAdd.disabled = false;
      showFontError('Couldn\u2019t load that file. The link may be wrong, or the server may not allow other sites to use its fonts (CORS).');
    });
  }

  /**
   * A font from this computer. Checked three times over before it is used:
   * the extension, the type the browser reports, and the size — and then the
   * browser itself has to parse the bytes as a font, which is the real test.
   * Nothing is uploaded anywhere: the bytes never leave the page.
   */
  function addFontFromFile(fileInput) {
    var file = fileInput.files && fileInput.files[0];
    showFontError('');
    if (!file) return;

    var extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!FONT_FORMATS[extension]) {
      fileInput.value = '';
      return showFontError('Only .woff2, .woff, .ttf and .otf files can be used.');
    }
    if (FONT_TYPES.indexOf(file.type) === -1) {
      fileInput.value = '';
      return showFontError('That file says it is \u201c' + file.type + '\u201d, which isn\u2019t a font.');
    }
    if (file.size > MAX_FONT_BYTES) {
      fileInput.value = '';
      return showFontError('That file is ' + (file.size / 1048576).toFixed(1) + ' MB. The limit is 5 MB.');
    }

    var reader = new FileReader();
    reader.onerror = function () { showFontError('That file couldn\u2019t be read.'); };
    reader.onload = function () {
      var name = safeFamilyName(file.name.replace(/\.[^.]+$/, ''), 'Custom Font');
      var face;
      try {
        face = new FontFace(name, reader.result);
      } catch (error) {
        return showFontError('That file isn\u2019t a font the browser can read.');
      }
      face.load().then(function (loaded) {
        document.fonts.add(loaded);
        registerFont(name, { weights: [400], stack: 'system-ui, sans-serif', source: file.name });
        fileInput.value = '';
        useFont(name, specimen.role);
      }).catch(function () {
        showFontError('That file isn\u2019t a font the browser can read.');
      });
    };
    reader.readAsArrayBuffer(file);
  }

  /* ======================================================================
     6. Storage
     ====================================================================== */
  function readStorage(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      state.storageWorks = false;   // private mode, or storage switched off
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      state.storageWorks = false;
      return false;
    }
  }

  /* Anything hand-edited, corrupted or from an older version is dropped
     rather than trusted: family names go straight into a CSS value. */
  function isValidCombo(combo) {
    return combo &&
      Array.isArray(combo.palette) &&
      combo.palette.length >= 3 && combo.palette.length <= 8 &&
      combo.palette.every(function (hex) { return typeof hex === 'string' && HEX_RE.test(hex); }) &&
      combo.fonts &&
      FAMILY_RE.test(String(combo.fonts.heading)) &&
      FAMILY_RE.test(String(combo.fonts.body));
  }

  function loadFavorites() {
    var stored = readStorage(STORAGE.favorites, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter(isValidCombo).slice(0, MAX_FAVORITES).map(function (combo) {
      return {
        id: typeof combo.id === 'string' ? combo.id : makeId(),
        palette: combo.palette.map(function (hex) { return hex.toUpperCase(); }),
        fonts: { heading: combo.fonts.heading, body: combo.fonts.body },
        savedAt: typeof combo.savedAt === 'string' ? combo.savedAt : new Date().toISOString()
      };
    });
  }

  function persistFavorites() {
    var saved = writeStorage(STORAGE.favorites, state.favorites);
    elements.favoritesNote.textContent = saved
      ? 'Saved in this browser only, with localStorage.'
      : 'This browser is blocking storage, so favorites will be lost when the page closes.';
  }

  function saveFavorite() {
    var duplicate = state.favorites.some(function (combo) {
      return combo.palette.join() === state.palette.join() &&
        combo.fonts.heading === state.fonts.heading &&
        combo.fonts.body === state.fonts.body;
    });
    if (duplicate) {
      toast('Already in your favorites');
      return;
    }
    state.favorites.unshift({
      id: makeId(),
      palette: state.palette.slice(),
      fonts: { heading: state.fonts.heading, body: state.fonts.body },
      savedAt: new Date().toISOString()
    });
    if (state.favorites.length > MAX_FAVORITES) state.favorites.length = MAX_FAVORITES;
    persistFavorites();
    renderFavorites();
    toast('Saved to favorites');
  }

  function applyFavorite(id) {
    var combo = state.favorites.find(function (item) { return item.id === id; });
    if (!combo) return;
    applyCombo({ palette: combo.palette, scheme: 'Saved combination', fonts: combo.fonts });
    toast('Applied ' + combo.fonts.heading + ' with ' + combo.fonts.body);
  }

  function deleteFavorite(id) {
    var index = state.favorites.findIndex(function (item) { return item.id === id; });
    if (index < 0) return;
    state.favorites.splice(index, 1);
    persistFavorites();
    renderFavorites();
    toast('Removed from favorites');

    /* Keep focus somewhere sensible: the next entry, or the Save button. */
    var buttons = elements.favoritesList.querySelectorAll('[data-delete]');
    var next = buttons[Math.min(index, buttons.length - 1)];
    (next || elements.save).focus();
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
    } catch (error) {
      return '';
    }
  }

  function renderFavorites() {
    var list = elements.favoritesList;
    list.textContent = '';
    elements.favoritesCount.textContent = String(state.favorites.length);
    elements.favoritesEmpty.hidden = state.favorites.length > 0;

    state.favorites.forEach(function (combo) {
      var item = document.createElement('li');
      item.className = 'fav';

      var strip = document.createElement('div');
      strip.className = 'fav-swatches';
      strip.setAttribute('aria-hidden', 'true');
      combo.palette.forEach(function (hex) {
        var cell = document.createElement('span');
        cell.className = 'fav-swatch';
        cell.style.backgroundColor = hex;
        strip.appendChild(cell);
      });

      var meta = document.createElement('div');
      var fonts = document.createElement('p');
      fonts.className = 'fav-fonts';
      fonts.textContent = combo.fonts.heading + ' + ' + combo.fonts.body;
      var date = document.createElement('p');
      date.className = 'fav-date';
      date.textContent = combo.palette.length + ' colors · saved ' + formatDate(combo.savedAt);
      /* The strip is decorative, so the HEX values are read out here instead. */
      var hexes = document.createElement('span');
      hexes.className = 'sr-only';
      hexes.textContent = 'Palette: ' + combo.palette.join(', ');
      meta.appendChild(fonts);
      meta.appendChild(date);
      meta.appendChild(hexes);

      var actions = document.createElement('div');
      actions.className = 'fav-actions';

      var apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-sm';
      apply.dataset.apply = combo.id;
      apply.textContent = 'Apply';
      apply.setAttribute('aria-label', 'Apply ' + combo.fonts.heading + ' with ' + combo.fonts.body);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-sm btn-danger';
      remove.dataset.delete = combo.id;
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', 'Delete saved combination ' + combo.fonts.heading + ' with ' + combo.fonts.body);

      actions.appendChild(apply);
      actions.appendChild(remove);

      item.appendChild(strip);
      item.appendChild(meta);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function loadSettings() {
    var stored = readStorage(STORAGE.settings, {});
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      theme: stored.theme === 'dark' || stored.theme === 'light' ? stored.theme : (prefersDark ? 'dark' : 'light'),
      shortcuts: stored.shortcuts !== false
    };
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    var dark = theme === 'dark';
    root.classList.toggle('theme-dark', dark);
    root.classList.toggle('theme-light', !dark);
    elements.themeToggle.setAttribute('aria-pressed', String(dark));
    elements.themeIcon.textContent = dark ? '☀' : '☾';
    elements.metaThemeColor.setAttribute('content', dark ? '#1e1e1e' : '#f9fafb');
    /* The preview's background changed, so its colors have to be picked again
       against it. (Not on the first call: nothing is rendered yet.) */
    if (state.palette.length) renderPreview(state);
  }

  /* ======================================================================
     7. Exports and clipboard
     ====================================================================== */

  /** CSS custom properties for the current combination. */
  function exportCSSVars(combo) {
    var lines = combo.palette.map(function (hex, index) {
      return '  --color-' + (index + 1) + ': ' + hex + ';';
    });
    lines.push('  --font-heading: "' + combo.fonts.heading + '", ' + stackOf(combo.fonts.heading) + ';');
    lines.push('  --font-body: "' + combo.fonts.body + '", ' + stackOf(combo.fonts.body) + ';');

    var families = encodeURIComponent(combo.fonts.heading).replace(/%20/g, '+') +
      ':wght@' + (FONTS[combo.fonts.heading] || DEFAULT_FONT).weights.join(';') +
      '&family=' + encodeURIComponent(combo.fonts.body).replace(/%20/g, '+') +
      ':wght@' + (FONTS[combo.fonts.body] || DEFAULT_FONT).weights.join(';');

    return '/* Fonts: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' +
      families + '&display=swap"> */\n:root {\n' + lines.join('\n') + '\n}';
  }

  /** The exact shape promised in the docs: { palette, fonts }. */
  function exportJSON(combo) {
    return JSON.stringify({
      palette: combo.palette,
      fonts: { heading: combo.fonts.heading, body: combo.fonts.body }
    }, null, 2);
  }

  function downloadJSON() {
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    var blob = new Blob([exportJSON(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'aesthetic-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + link.download);
  }

  /* Older browsers, and any page not in a secure context, fall back to a
     hidden textarea and execCommand. */
  function legacyCopy(text) {
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    field.remove();
    return copied;
  }

  function copyText(text, message) {
    var finish = function (copied) {
      toast(copied ? message : 'Copy failed — select the text and copy it by hand');
      return copied;
    };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () {
        return finish(true);
      }, function () {
        return finish(legacyCopy(text));
      });
    }
    return Promise.resolve(finish(legacyCopy(text)));
  }

  var toastTimer = 0;
  function toast(message) {
    var node = elements.toast;
    node.textContent = message;         /* role="status" announces the change */
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  function copyCSS() { copyText(exportCSSVars(state), 'CSS variables copied'); }
  function copyJSON() { copyText(exportJSON(state), 'JSON copied'); }

  /* ======================================================================
     8. Events, shortcuts, init
     ====================================================================== */
  function onSwatchClick(event) {
    var button = event.target.closest('.swatch-btn');
    if (!button) return;
    var hex = button.dataset.hex;
    copyText(hex, hex + ' copied').then(function (copied) {
      if (!copied) return;
      /* Visual confirmation on the swatch itself; the accessible name stays
         the same so the button never renames itself under a screen reader. */
      var hint = button.querySelector('.swatch-hint');
      button.classList.add('is-copied');
      hint.textContent = 'Copied';
      setTimeout(function () {
        button.classList.remove('is-copied');
        hint.textContent = 'Copy';
      }, 1400);
    });
  }

  function onFavoritesClick(event) {
    var apply = event.target.closest('[data-apply]');
    var remove = event.target.closest('[data-delete]');
    if (apply) applyFavorite(apply.dataset.apply);
    else if (remove) deleteFavorite(remove.dataset.delete);
  }

  /**
   * Single-key shortcuts. Two rules keep them out of the way:
   *   - never while typing in a field;
   *   - Space is ignored when a button has focus, because Space already
   *     activates the focused button (otherwise one press would do both).
   * They can be switched off entirely, which is also what WCAG 2.1.4 asks of
   * single-character shortcuts.
   */
  function onKeydown(event) {
    if (!state.settings.shortcuts) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    var target = event.target;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    var key = event.key.toLowerCase();
    if (event.key === ' ' || event.code === 'Space') {
      if (target.closest('button, a, summary, [role="button"]')) return;
      event.preventDefault();               // no page scroll
      shuffle();
    } else if (key === 'f') {
      event.preventDefault();
      shuffleFonts();
    } else if (key === 's') {
      event.preventDefault();
      saveFavorite();
    } else if (key === 'c') {
      event.preventDefault();
      copyCSS();
    }
  }

  function wireEvents() {
    elements.shuffle.addEventListener('click', shuffle);
    elements.shuffleFonts.addEventListener('click', shuffleFonts);
    elements.save.addEventListener('click', saveFavorite);
    elements.copyCss.addEventListener('click', copyCSS);
    elements.copyJson.addEventListener('click', copyJSON);
    elements.downloadJson.addEventListener('click', downloadJSON);

    elements.paletteList.addEventListener('click', onSwatchClick);

    /* The preview's sample controls copy the color they are wearing. */
    [elements.previewButton, elements.previewSecondary].forEach(function (button) {
      button.addEventListener('click', function () {
        copyText(button.dataset.hex, button.dataset.hex + ' copied');
      });
    });

    /* Base color and saturation: live while dragging ("input"), then one
       final, animated update when the control is released ("change"). */
    elements.baseColor.addEventListener('input', function () { scheduleControlUpdate('color'); });
    elements.baseColor.addEventListener('change', function () { updateFromControls('color', false); });
    elements.saturation.addEventListener('input', function () { scheduleControlUpdate('saturation'); });
    elements.saturation.addEventListener('change', function () { updateFromControls('saturation', false); });
    elements.keepBase.addEventListener('change', function () {
      state.keepBase = elements.keepBase.checked;
      toast(state.keepBase ? 'Shuffle will keep this base color' : 'Shuffle will pick a new base color');
    });
    elements.favoritesList.addEventListener('click', onFavoritesClick);

    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-preset]'), function (chip) {
      chip.addEventListener('click', function () {
        var preset = PRESETS[chip.dataset.preset];
        applyCombo(preset, { preset: chip.dataset.preset });
        toast(preset.label + ' applied');
      });
    });

    elements.themeToggle.addEventListener('click', function () {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.settings.theme);
      writeStorage(STORAGE.settings, state.settings);
    });

    elements.shortcutsToggle.addEventListener('change', function () {
      state.settings.shortcuts = elements.shortcutsToggle.checked;
      writeStorage(STORAGE.settings, state.settings);
      toast(state.settings.shortcuts ? 'Keyboard shortcuts on' : 'Keyboard shortcuts off');
    });

    /* Live preview controls. "input" fires on every keystroke and every drag
       step, and the work is one style write, so the preview keeps up. */
    elements.specimenText.addEventListener('input', function () { updateSpecimen('text'); });
    [elements.specimenSize, elements.specimenLeading].forEach(function (control) {
      control.addEventListener('input', function () { updateSpecimen('type'); });
    });
    elements.specimenWeight.addEventListener('change', function () { updateSpecimen('type'); });
    elements.specimenReset.addEventListener('click', resetSpecimen);

    function chooseRole(option) {
      specimen.role = option.dataset.role;
      renderSpecimenControls();
    }
    elements.specimenRole.addEventListener('click', function (event) {
      var option = event.target.closest('[data-role]');
      if (option) chooseRole(option);
    });
    elements.specimenRole.addEventListener('keydown', function (event) {
      var option = moveInGroup(event, elements.specimenRole, '[data-role]');
      if (option) chooseRole(option);
    });

    /* Adding fonts. The catalogue is only fetched when the panel is opened
       first: a visitor who never opens it pays nothing. */
    elements.addFont.addEventListener('toggle', function () {
      if (elements.addFont.open) loadCatalogue().then(renderCatalogueMatches);
    });
    elements.fontSearch.addEventListener('input', renderCatalogueMatches);
    elements.fontSearch.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); addGoogleFont(); }
    });
    elements.fontSearchAdd.addEventListener('click', addGoogleFont);
    elements.fontUrl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); addFontFromUrl(); }
    });
    elements.fontUrlAdd.addEventListener('click', addFontFromUrl);
    elements.fontFile.addEventListener('change', function () { addFontFromFile(elements.fontFile); });

    document.addEventListener('keydown', onKeydown);
  }

  function init() {
    elements = {
      shuffle: $('shuffle'),
      shuffleFonts: $('shuffle-fonts'),
      save: $('save'),
      copyCss: $('copy-css'),
      copyJson: $('copy-json'),
      downloadJson: $('download-json'),
      paletteList: $('palette-list'),
      baseColor: $('base-color'),
      baseColorValue: $('base-color-value'),
      saturation: $('saturation'),
      saturationValue: $('saturation-value'),
      keepBase: $('keep-base'),
      schemeTag: $('scheme-tag'),
      preview: $('preview'),
      eyebrow: document.querySelector('.preview-eyebrow'),
      previewNote: $('preview-note'),
      previewPanelText: $('preview-panel-text'),
      previewHeadline: document.querySelector('.preview-headline'),
      previewBody: document.querySelector('.preview-body'),
      previewWarning: $('preview-warning'),
      specimenText: $('specimen-text'),
      specimenRole: $('specimen-role'),
      specimenSize: $('specimen-size'),
      specimenSizeValue: $('specimen-size-value'),
      specimenWeight: $('specimen-weight'),
      specimenLeading: $('specimen-leading'),
      specimenLeadingValue: $('specimen-leading-value'),
      specimenReset: $('specimen-reset'),
      addFont: $('add-font'),
      fontSearch: $('font-search'),
      fontCatalogue: $('font-catalogue'),
      fontSearchAdd: $('font-search-add'),
      fontSearchHint: $('font-search-hint'),
      fontUrl: $('font-url'),
      fontUrlAdd: $('font-url-add'),
      fontFile: $('font-file'),
      fontError: $('font-error'),
      addedFonts: $('added-fonts'),
      addedList: $('added-list'),
      previewButton: $('preview-button'),
      previewSecondary: $('preview-secondary'),
      previewLink: $('preview-link'),
      previewChips: $('preview-chips'),
      headingName: $('heading-name'),
      bodyName: $('body-name'),
      headingLink: $('heading-link'),
      bodyLink: $('body-link'),
      cssOutput: $('css-output'),
      jsonOutput: $('json-output'),
      favoritesList: $('favorites-list'),
      favoritesEmpty: $('favorites-empty'),
      favoritesCount: $('favorites-count'),
      favoritesNote: $('favorites-note'),
      themeToggle: $('theme-toggle'),
      themeIcon: $('theme-icon'),
      shortcutsToggle: $('shortcuts-toggle'),
      metaThemeColor: $('meta-theme-color'),
      toast: $('toast')
    };

    state.settings = loadSettings();
    applyTheme(state.settings.theme);
    elements.shortcutsToggle.checked = state.settings.shortcuts;

    state.favorites = loadFavorites();
    renderFavorites();
    if (!state.storageWorks) persistFavorites();   // shows the blocked-storage note

    /* Keep the sample copy, so an emptied text box can put it back. */
    stockCopy.heading = elements.previewHeadline.textContent.trim();
    stockCopy.body = [].map.call(elements.previewBody.childNodes, function (node) { return node.cloneNode(true); });

    /* The page opens on "Minimal" rather than something random, so the first
       impression is a designed combination. */
    applyCombo(PRESETS.minimal, { preset: 'minimal' });
    syncSpecimenToFonts();

    wireEvents();
  }

  init();
})();
