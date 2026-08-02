/**
 * Web-based dominant color extractor.
 *
 * Loads the image into a 48×48 canvas, samples 4×4 corner patches to detect
 * the background color, excludes matching pixels, maps survivors to named
 * color buckets, and returns only colors covering ≥10% of foreground pixels.
 */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn)      h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else                 h = (rn - gn) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function classifyColor(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  // Neutrals
  if (s < 15) {
    if (l < 15)  return "black";
    if (l < 30)  return "dark grey";
    if (l < 55)  return "grey";
    if (l < 80)  return "light grey";
    return "white";
  }
  // Warm earth tones
  if (s < 45 && h > 20 && h < 50) {
    if (l < 35) return "brown";
    if (l < 55) return "tan";
    return "beige";
  }
  // Chromatic
  if (h < 15 || h >= 345) return "red";
  if (h < 35)  return "orange";
  if (h < 65)  return "yellow";
  if (h < 170) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 285) return "purple";
  return "pink";
}

function colorsClose(
  ar: number, ag: number, ab: number,
  br: number, bg: number, bb: number,
  tolerance = 35,
): boolean {
  return (
    Math.abs(ar - br) < tolerance &&
    Math.abs(ag - bg) < tolerance &&
    Math.abs(ab - bb) < tolerance
  );
}

/**
 * Extracts dominant color names from an image URL using a 48×48 canvas.
 * Returns an empty array on any error (CORS issues, missing image, etc.).
 */
export function extractColors(imageSrc: string): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const SIZE = 48;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve([]); return; }

          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

          // Sample 4×4 corner patches to detect background color
          const cornerR: number[] = [], cornerG: number[] = [], cornerB: number[] = [];
          for (const [px, py] of [[0, 0], [SIZE - 4, 0], [0, SIZE - 4], [SIZE - 4, SIZE - 4]]) {
            for (let dy = 0; dy < 4; dy++) {
              for (let dx = 0; dx < 4; dx++) {
                const idx = ((py + dy) * SIZE + (px + dx)) * 4;
                if (data[idx + 3] > 50) {
                  cornerR.push(data[idx]);
                  cornerG.push(data[idx + 1]);
                  cornerB.push(data[idx + 2]);
                }
              }
            }
          }

          let bgR = 255, bgG = 255, bgB = 255;
          if (cornerR.length) {
            const mid = Math.floor(cornerR.length / 2);
            bgR = [...cornerR].sort((a, b) => a - b)[mid];
            bgG = [...cornerG].sort((a, b) => a - b)[mid];
            bgB = [...cornerB].sort((a, b) => a - b)[mid];
          }

          // Count foreground pixels by color bucket
          const counts: Record<string, number> = {};
          let fg = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 50) continue;
            if (colorsClose(bgR, bgG, bgB, r, g, b)) continue;
            fg++;
            const name = classifyColor(r, g, b);
            counts[name] = (counts[name] ?? 0) + 1;
          }

          if (fg === 0) { resolve([]); return; }

          const threshold = fg * 0.10;
          const result = Object.entries(counts)
            .filter(([, c]) => c >= threshold)
            .sort(([, a], [, b]) => b - a)
            .map(([name]) => name);

          resolve(result);
        } catch {
          resolve([]);
        }
      };

      img.onerror = () => resolve([]);
      img.src = imageSrc;
    } catch {
      resolve([]);
    }
  });
}
