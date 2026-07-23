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

  const applyAccent = (accent, persist = false) => {
    if (!hexPattern.test(accent))
      return

    const normalized = accent.toLowerCase()
    const [red, green, blue] = hexToRgb(normalized)
    const dim = `rgb(${Math.round(red * 0.64)} ${Math.round(green * 0.64)} ${Math.round(blue * 0.64)})`
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000
    const root = document.documentElement

    root.style.setProperty('--accent-green', normalized)
    root.style.setProperty('--accent-rgb', `${red} ${green} ${blue}`)
    root.style.setProperty('--accent-dim', dim)
    root.style.setProperty('--accent-contrast', luminance > 145 ? '#071109' : '#f6f8fa')

    document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
      picker.value = normalized
    })
    document.querySelectorAll('[data-theme-value]').forEach((output) => {
      output.textContent = normalized.toUpperCase()
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

  const bindPickers = () => {
    applyAccent(initialAccent)
    document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
      picker.addEventListener('input', event => applyAccent(event.target.value, true))
    })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', bindPickers, { once: true })
  else
    bindPickers()
})()
