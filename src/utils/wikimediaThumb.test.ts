import { describe, expect, it } from 'vitest'
import { heroImageSources, paletteImageUrl } from './wikimediaThumb'

const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Brno_(hrad).jpg/1920px-Brno_(hrad).jpg?utm_source=x'
const ORIGINAL = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Brno.PNG'

describe('heroImageSources', () => {
  it('offers only widths smaller than the original', () => {
    const { src, srcSet } = heroImageSources({ imageUrl: THUMB, width: 1500 })
    expect(src).toBe(THUMB)
    expect(srcSet).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Brno_(hrad).jpg/960px-Brno_(hrad).jpg 960w, ' +
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Brno_(hrad).jpg/1280px-Brno_(hrad).jpg 1280w',
    )
  })

  it('turns an unscaled original into thumbnails', () => {
    expect(heroImageSources({ imageUrl: ORIGINAL, width: 6000 }).srcSet).toContain(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Brno.PNG/960px-Brno.PNG 960w',
    )
  })

  it('leaves images from other hosts, or of unknown size, alone', () => {
    expect(heroImageSources({ imageUrl: 'https://example.com/a.jpg', width: 4000 }).srcSet).toBeUndefined()
    expect(heroImageSources({ imageUrl: THUMB }).srcSet).toBeUndefined()
  })
})

describe('paletteImageUrl', () => {
  it('samples a small thumbnail when the original is larger', () => {
    expect(paletteImageUrl({ imageUrl: ORIGINAL, width: 6000 })).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Brno.PNG/500px-Brno.PNG',
    )
  })

  it('falls back to the image itself', () => {
    expect(paletteImageUrl({ imageUrl: ORIGINAL })).toBe(ORIGINAL)
    expect(paletteImageUrl({ imageUrl: 'https://example.com/a.jpg', width: 4000 })).toBe('https://example.com/a.jpg')
    expect(paletteImageUrl(null)).toBeNull()
  })
})
