// Launch screens for the app when it is opened from an iPhone's Home Screen.
//
// iOS shows a blank white screen while a Home Screen web app starts unless the
// page names a launch image whose pixel size matches the device exactly, so
// there is one per iPhone screen size (portrait only, as the manifest asks).
// The images themselves are drawn at build time by app/splash/[size]/route.tsx.

/** Screen sizes in CSS points, with the device pixel ratio. */
const IPHONES: Array<{ w: number; h: number; ratio: 2 | 3 }> = [
  { w: 440, h: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { w: 430, h: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { w: 428, h: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { w: 420, h: 912, ratio: 3 }, // Air
  { w: 414, h: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, ratio: 2 }, // XR, 11
  { w: 414, h: 736, ratio: 3 }, // 8 Plus
  { w: 402, h: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { w: 393, h: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { w: 390, h: 844, ratio: 3 }, // 12, 13, 14
  { w: 375, h: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { w: 375, h: 667, ratio: 2 }, // SE, 8
]

export const SPLASH_SCREENS = IPHONES.map(({ w, h, ratio }) => {
  const size = `${w * ratio}x${h * ratio}`
  return {
    /** The route segment: pixel size plus extension, e.g. `1179x2556.png`. */
    file: `${size}.png`,
    url: `/splash/${size}.png`,
    width: w * ratio,
    height: h * ratio,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }
})
