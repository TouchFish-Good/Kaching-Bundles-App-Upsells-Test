import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('color picker preserves alpha while changing hue and rounds alpha to eight-digit HEX', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { parseColor, formatColor, hsvToRgb } = await vite.ssrLoadModule('/src/prototype/color-picker.ts');
    assert.equal(parseColor('#336699').alpha, 255);
    assert.equal(parseColor('#33669980').alpha, 128);
    assert.equal(formatColor(51, 102, 153, 128), '#33669980');
    assert.equal(formatColor(51, 102, 153, 255), '#336699');
    assert.deepEqual(hsvToRgb(0, 100, 100), [255, 0, 0]);
  } finally { await vite.close(); }
});

test('a black or near-black spectrum selection keeps the last chromatic hue', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { pickerHue, hsvToRgb } = await vite.ssrLoadModule('/src/prototype/color-picker.ts');
    const black = hsvToRgb(220, 100, 0);
    assert.equal(pickerHue(...black, 220), 220);
    const nearBlack = hsvToRgb(220, 100, 0.1);
    assert.equal(pickerHue(...nearBlack, 220), 220);
  } finally { await vite.close(); }
});

test('a black spectrum selection preserves its horizontal saturation cursor', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { pickerHsv, hsvToRgb } = await vite.ssrLoadModule('/src/prototype/color-picker.ts');
    const color = hsvToRgb(220, 68, 0);
    assert.deepEqual(pickerHsv(...color, { hue: 220, saturation: 68, brightness: 0 }), { hue: 220, saturation: 68, brightness: 0 });
  } finally { await vite.close(); }
});

test('near-black drag keeps the exact HSV cursor despite HEX color rounding', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { formatColor, hsvToRgb, pickerHsvForValue } = await vite.ssrLoadModule('/src/prototype/color-picker.ts');
    const hsv = { hue: 218, saturation: 63, brightness: 0.8 };
    const value = formatColor(...hsvToRgb(hsv.hue, hsv.saturation, hsv.brightness), 255);
    assert.deepEqual(pickerHsvForValue(value, { value, hsv }), hsv);
    assert.notDeepEqual(pickerHsvForValue(value), hsv);
  } finally { await vite.close(); }
});
