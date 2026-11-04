import { tip } from "@/components/tooltips";

declare global {
  var fonts: FontDefinition[];
}

type FontDefinition = {
  family: string;
  src?: string;
  unicodeRange?: string;
  variant?: string;
};

window.fonts = [
  { family: "Arial" },
  { family: "Brush Script MT" },
  { family: "Century Gothic" },
  { family: "Comic Sans MS" },
  { family: "Copperplate" },
  { family: "Courier New" },
  { family: "Garamond" },
  { family: "Georgia" },
  { family: "Herculanum" },
  { family: "Impact" },
  { family: "Papyrus" },
  { family: "Party LET" },
  { family: "Times New Roman" },
  { family: "Verdana" },
  {
    family: "Almendra SC",
    src: "url(./fonts/almendra-sc.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Amarante",
    src: "url(./fonts/amarante.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Amatic SC",
    src: "url(./fonts/amatic-sc.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Arima Madurai",
    src: "url(./fonts/arima-madurai.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Architects Daughter",
    src: "url(./fonts/architects-daughter.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Bitter",
    src: "url(./fonts/bitter.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Caesar Dressing",
    src: "url(./fonts/caesar-dressing.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Cinzel",
    src: "url(./fonts/cinzel.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Dancing Script",
    src: "url(./fonts/dancing-script.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Eagle Lake",
    src: "url(./fonts/eagle-lake.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Faster One",
    src: "url(./fonts/faster-one.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Forum",
    src: "url(./fonts/forum.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Fredericka the Great",
    src: "url(./fonts/fredericka-the-great.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Gloria Hallelujah",
    src: "url(./fonts/gloria-hallelujah.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Great Vibes",
    src: "url(./fonts/great-vibes.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Henny Penny",
    src: "url(./fonts/henny-penny.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Iceberg",
    src: "url(./fonts/iceberg.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "IM Fell English",
    src: "url(./fonts/im-fell-english.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Kelly Slab",
    src: "url(./fonts/kelly-slab.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Kranky",
    src: "url(./fonts/kranky.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Lobster Two",
    src: "url(./fonts/lobster-two.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Lugrasimo",
    src: "url(./fonts/lugrasimo.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Kaushan Script",
    src: "url(./fonts/kaushan-script.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Macondo",
    src: "url(./fonts/macondo.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "MedievalSharp",
    src: "url(./fonts/medievalsharp.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Metal Mania",
    src: "url(./fonts/metal-mania.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Metamorphous",
    src: "url(./fonts/metamorphous.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Montez",
    src: "url(./fonts/montez.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Nova Script",
    src: "url(./fonts/nova-script.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Orbitron",
    src: "url(./fonts/orbitron.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Oregano",
    src: "url(./fonts/oregano.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Pirata One",
    src: "url(./fonts/pirata-one.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Sail",
    src: "url(./fonts/sail.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Satisfy",
    src: "url(./fonts/satisfy.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Shadows Into Light",
    src: "url(./fonts/shadows-into-light.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  },
  {
    family: "Snowburst One",
    src: "url(./fonts/snowburst-one.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Tapestry",
    src: "url(./fonts/macondo.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Uncial Antiqua",
    src: "url(./fonts/uncial-antiqua.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Underdog",
    src: "url(./fonts/underdog.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "UnifrakturMaguntia",
    src: "url(./fonts/unifrakturmaguntia.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
  },
  {
    family: "Yellowtail",
    src: "url(./fonts/yellowtail.woff2)",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215"
  }
];

/** Register a font so the app can use and export it */
const declaredFonts = new Set<string>(); // font definitions already declared to the document

export function declareFont(font: FontDefinition): void {
  const { family, src, ...rest } = font;
  const key = JSON.stringify(font);
  if (declaredFonts.has(key)) return; // a repeated load must not stack options or FontFace records
  declaredFonts.add(key);

  if (!src) return;
  const fontFace = new FontFace(family, src, { ...rest, display: "block" });
  document.fonts.add(fontFace);
}

declareDefaultFonts(); // execute once on load

function declareDefaultFonts() {
  fonts.forEach(font => {
    declareFont(font);
  });
}

async function fetchGoogleFont(family: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}`;
  try {
    const resp = await fetch(url);
    const text = await resp.text();

    const fontFaceRules = text.match(/font-face\s*{[^}]+}/g);
    const fonts = fontFaceRules!.map(fontFace => {
      const srcURL = fontFace.match(/url\(['"]?(.+?)['"]?\)/)?.[1];
      const src = `url(${srcURL})`;
      const unicodeRange = fontFace.match(/unicode-range: (.*?);/)?.[1];
      const variant = fontFace.match(/font-style: (.*?);/)?.[1];

      const font: FontDefinition = { family, src };
      if (unicodeRange) font.unicodeRange = unicodeRange;
      if (variant && variant !== "normal") font.variant = variant;
      return font;
    });

    return fonts;
  } catch (err) {
    ERROR && console.error(err);
    return null;
  }
}

function readBlobAsDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Inline the fonts as data URIs so an exported SVG renders without the network */
export async function loadFontsAsDataURI(fonts: FontDefinition[]): Promise<FontDefinition[]> {
  const promises = fonts.map(async font => {
    const url = font.src?.match(/url\(['"]?(.+?)['"]?\)/)?.[1];
    if (!url) return font;
    const resp = await fetch(url);
    const blob = await resp.blob();
    const dataURL = await readBlobAsDataURL(blob);

    return { ...font, src: `url('${dataURL}')` };
  });

  return await Promise.all(promises);
}

/** Collect fonts referenced by the map and, when saving, its notes. */
export function getUsedFonts(svg: SVGSVGElement, legends: string[] = []): FontDefinition[] {
  const usedFontFamilies = new Set();

  const labelGroups = svg.querySelectorAll("#labels g");
  for (const labelGroup of labelGroups) {
    const font = labelGroup.getAttribute("font-family");
    if (font) usedFontFamilies.add(font);
  }

  const legend = svg.querySelector("#legend");
  const legendFont = legend?.getAttribute("font-family");
  if (legendFont) usedFontFamilies.add(legendFont);

  for (const legend of legends) {
    const template = document.createElement("template");
    template.innerHTML = legend;
    for (const el of template.content.querySelectorAll<HTMLElement>("[style], font[face]")) {
      const family = el.style.fontFamily || el.getAttribute("face") || "";
      for (const match of family.matchAll(/"([^"]+)"|'([^']+)'|([^,]+)/g)) {
        usedFontFamilies.add((match[1] || match[2] || match[3]).trim());
      }
    }
  }

  const usedFonts = fonts.filter(font => usedFontFamilies.has(font.family));
  return usedFonts;
}

/** Fetch a Google font by family name and register it; the family once loaded, undefined when it cannot be */
export async function addGoogleFont(family: string): Promise<string | undefined> {
  const fontRanges = await fetchGoogleFont(family);
  if (!fontRanges) {
    tip("Cannot fetch Google font for this value", true, "error", 4000);
    return undefined;
  }
  tip(`Google font ${family} is loading...`, true, "warn", 4000);

  const faces = fontRanges.map(
    ({ src, unicodeRange }) => new FontFace(family, src!, { unicodeRange, display: "block" })
  );
  try {
    for (const fontFace of await Promise.all(faces.map(face => face.load()))) document.fonts.add(fontFace);
  } catch (error) {
    tip(`Failed to load Google font ${family}`, true, "error", 4000);
    ERROR && console.error(error);
    return undefined;
  }
  fonts.push(...fontRanges);
  tip(`Google font ${family} is added to the list`, true, "success", 4000);
  return family;
}

/** Register a font installed on this machine */
export function addLocalFont(family: string): string {
  fonts.push({ family });
  document.fonts.add(new FontFace(family, `local(${family})`, { display: "block" }));
  tip(`Local font ${family} is added to the fonts list`, true, "success", 4000);
  return family;
}

/** Register a font file hosted online */
export function addWebFont(family: string, url: string): string {
  const src = `url('${url}')`;
  fonts.push({ family, src });
  document.fonts.add(new FontFace(family, src, { display: "block" }));
  tip(`Font ${family} is added to the list`, true, "success", 4000);
  return family;
}
