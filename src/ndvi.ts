export type NdviDisplayMode = 'contrast' | 'absolute';

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function ndviScalePosition(value: number, mode: NdviDisplayMode, minimum: number, maximum: number): number {
  if (mode === 'contrast') {
    const range = Math.max(0.0001, maximum - minimum);
    return clamp((value - minimum) / range);
  }
  return clamp((value + 0.1) / 0.9);
}

export function ndviColour(value: number, mode: NdviDisplayMode, minimum: number, maximum: number): string {
  const position = ndviScalePosition(value, mode, minimum, maximum);
  const hue = Math.round(4 + position * 124);
  const lightness = Math.round(49 - position * 10);
  return `hsl(${hue} 70% ${lightness}%)`;
}
