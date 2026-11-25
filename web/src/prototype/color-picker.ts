export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value);

export function parseColor(value: string) {
  const hex = value.slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
  };
}

export function formatColor(red: number, green: number, blue: number, alpha: number) {
  const hex = [red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('');
  const opacity = Math.round(alpha);
  return `#${hex}${opacity === 255 ? '' : opacity.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, saturation: max ? delta / max * 100 : 0, brightness: max * 100 };
}

export function pickerHue(red: number, green: number, blue: number, lastHue: number): number {
  const color = rgbToHsv(red, green, blue);
  return color.brightness < 1 || color.saturation < 1 ? lastHue : color.hue;
}

export function pickerHsv(red: number, green: number, blue: number, previous?: ReturnType<typeof rgbToHsv>) {
  const color = rgbToHsv(red, green, blue);
  if (!previous) return color;
  return {
    hue: pickerHue(red, green, blue, previous.hue),
    saturation: color.brightness < 1 ? previous.saturation : color.saturation,
    brightness: color.brightness,
  };
}

export function pickerHsvForValue(value: string, previous?: { value: string; hsv: ReturnType<typeof rgbToHsv> }) {
  if (previous?.value === value) return previous.hsv;
  const { red, green, blue } = parseColor(value);
  return pickerHsv(red, green, blue, previous?.hsv);
}

export function hsvToRgb(hue: number, saturation: number, brightness: number): [number, number, number] {
  const h = hue / 60, s = saturation / 100, v = brightness / 100;
  const chroma = v * s, second = chroma * (1 - Math.abs(h % 2 - 1)), low = v - chroma;
  const segments = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]];
  return segments[Math.floor(h) % 6].map((part) => Math.round((part + low) * 255)) as [number, number, number];
}
