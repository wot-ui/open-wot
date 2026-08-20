(() => {
  const storageKey = 'open-wot-theme-accent'
  const defaultAccent = '#39d353'
  const hexPattern = /^#[0-9a-f]{6}$/i

  const readSavedAccent = () => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      return saved && hexPattern.test(saved) ? saved : defaultAccent
    }
    catch {
      return defaultAccent
    }
  }

  const hexToRgb = (hex) => {
    const value = hex.slice(1)
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ]
  }

  const channelLuminance = (channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }

  const relativeLuminance = ([red, green, blue]) =>
    0.2126 * channelLuminance(red)
    + 0.7152 * channelLuminance(green)
    + 0.0722 * channelLuminance(blue)

  const contrastRatio = (foreground, background) => {
    const foregroundLuminance = relativeLuminance(foreground)
    const backgroundLuminance = relativeLuminance(background)
    const lighter = Math.max(foregroundLuminance, backgroundLuminance)
    const darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
  }

  const mixWithWhite = ([red, green, blue], amount) => [
    Math.round(red + (255 - red) * amount),
    Math.round(green + (255 - green) * amount),
    Math.round(blue + (255 - blue) * amount),
  ]

  const rgbToHex = ([red, green, blue]) =>
    `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`

  const readableAccent = (rgb) => {
    const docsBackgrounds = [hexToRgb('#0d1117'), hexToRgb('#151d27')]
    const hasEnoughContrast = candidate =>
      docsBackgrounds.every(background => contrastRatio(candidate, background) >= 4.5)

    if (hasEnoughContrast(rgb))
      return rgbToHex(rgb)

    for (let amount = 0.05; amount <= 1; amount += 0.05) {
      const candidate = mixWithWhite(rgb, amount)
      if (hasEnoughContrast(candidate))
        return rgbToHex(candidate)
    }

    return '#f6f8fa'
  }

  const contrastText = (background) => {
    const dark = hexToRgb('#071109')
    const light = hexToRgb('#f6f8fa')
    return contrastRatio(dark, background) >= contrastRatio(light, background)
      ? '#071109'
      : '#f6f8fa'
  }

  const applyAccent = (accent, persist = false) => {
    if (!hexPattern.test(accent))
      return

    const normalized = accent.toLowerCase()
    const rgb = hexToRgb(normalized)
    const [red, green, blue] = rgb
    const dim = `rgb(${Math.round(red * 0.64)} ${Math.round(green * 0.64)} ${Math.round(blue * 0.64)})`
    const root = document.documentElement

    root.style.setProperty('--accent-green', normalized)
    root.style.setProperty('--accent-readable', readableAccent(rgb))
    root.style.setProperty('--accent-rgb', `${red} ${green} ${blue}`)
    root.style.setProperty('--accent-dim', dim)
    root.style.setProperty('--accent-contrast', contrastText(rgb))

    document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
      picker.value = normalized
    })
    document.querySelectorAll('[data-theme-value]').forEach((output) => {
      output.textContent = normalized.toUpperCase()
    })
    document.querySelectorAll('[data-theme-reset]').forEach((button) => {
      button.disabled = normalized === defaultAccent
    })

    if (persist) {
      try {
        window.localStorage.setItem(storageKey, normalized)
      }
      catch {
        // Theme still works for the current page when storage is unavailable.
      }
    }
  }

  const initialAccent = readSavedAccent()
  applyAccent(initialAccent)

  const resetAccent = () => {
    try {
      window.localStorage.removeItem(storageKey)
    }
    catch {
      // Reset still works for the current page when storage is unavailable.
    }
    applyAccent(defaultAccent)
  }

  const bindPickers = () => {
    applyAccent(initialAccent)
    document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
      picker.addEventListener('input', event => applyAccent(event.target.value, true))
    })
    document.querySelectorAll('[data-theme-reset]').forEach((button) => {
      button.addEventListener('click', resetAccent)
    })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', bindPickers, { once: true })
  else
    bindPickers()
})()
