/** 專案顏色是使用者選的，文字色不能寫死，要依底色決定 */
function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 在深淺兩種文字色中，挑對比較高的那個 */
export function readableTextColor(background, light = '#ffffff', dark = '#000000') {
  if (!/^#[0-9a-f]{6}$/i.test(background || '')) return light;
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}
