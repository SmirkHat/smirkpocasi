const WIKIMEDIA_FILE =
  /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/([^/]+)\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))/i

// Wikimedia only renders thumbnails at its standard steps; other widths are refused.
const HERO_WIDTHS = [960, 1280, 1920]
const PALETTE_WIDTH = 500

export const HERO_IMAGE_SIZES = '(min-width: 1152px) 1088px, 100vw'

type PlaceImage = { imageUrl?: string | null; width?: number }

function thumbnailUrl(imageUrl: string, width: number) {
  const match = WIKIMEDIA_FILE.exec(imageUrl)
  if (!match) return null
  const [, project, hash, file] = match
  return `https://thumb.wikimedia.org/wikipedia/${project}/thumb/${hash}/${file}/${width}px-${file}`
}

/** Unscaled originals reach 12 MB, so a phone must never download one for a 400 px wide hero. */
export function heroImageSources(image: PlaceImage) {
  const src = image.imageUrl ?? ''
  const originalWidth = image.width ?? 0
  const candidates = HERO_WIDTHS.filter((width) => width < originalWidth).flatMap((width) => {
    const url = thumbnailUrl(src, width)
    return url ? [`${url} ${width}w`] : []
  })
  return { src, srcSet: candidates.length ? candidates.join(', ') : undefined }
}

/** Colors need only a small sample: a 68 kB thumbnail instead of a megabyte. */
export function paletteImageUrl(image: PlaceImage | null | undefined) {
  if (!image?.imageUrl) return null
  const originalWidth = image.width ?? 0
  if (originalWidth <= PALETTE_WIDTH) return image.imageUrl
  return thumbnailUrl(image.imageUrl, PALETTE_WIDTH) ?? image.imageUrl
}
