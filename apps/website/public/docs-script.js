const docsHeader = document.querySelector('[data-header]')
const docsMenu = document.querySelector('[data-docs-menu]')
const docsSidebar = document.querySelector('[data-docs-sidebar]')
const docsSearch = document.querySelector('[data-docs-search]')
const docsEmpty = document.querySelector('[data-docs-empty]')
const docsSections = [...document.querySelectorAll('[data-search-section]')]
const docsNavLinks = [...document.querySelectorAll('.docs-sidebar a[href^="#"], .docs-toc a[href^="#"]')]
const docsToast = document.querySelector('[data-toast]')

const updateHeader = () => {
  docsHeader?.classList.toggle('is-scrolled', window.scrollY > 16)
}

updateHeader()
window.addEventListener('scroll', updateHeader, { passive: true })

docsMenu?.addEventListener('click', () => {
  const isOpen = docsSidebar?.classList.toggle('is-open') ?? false
  docsMenu.setAttribute('aria-expanded', String(isOpen))
})

docsNavLinks.forEach((link) => {
  link.addEventListener('click', () => {
    docsSidebar?.classList.remove('is-open')
    docsMenu?.setAttribute('aria-expanded', 'false')
    window.requestAnimationFrame(scheduleActiveSectionUpdate)
  })
})

document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
    return

  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA')
    return

  event.preventDefault()
  docsSearch?.focus()
})

docsSearch?.addEventListener('input', () => {
  const query = docsSearch.value.trim().toLocaleLowerCase('zh-CN')
  let matches = 0

  docsSections.forEach((section) => {
    const isMatch = !query || section.textContent.toLocaleLowerCase('zh-CN').includes(query)
    section.hidden = !isMatch
    if (isMatch)
      matches += 1
  })

  docsNavLinks.forEach((link) => {
    const target = document.querySelector(link.getAttribute('href'))
    link.hidden = Boolean(query) && Boolean(target?.hidden)
  })

  if (docsEmpty)
    docsEmpty.hidden = matches > 0

  scheduleActiveSectionUpdate()
})

document.querySelectorAll('[data-copy-code]').forEach((button) => {
  button.addEventListener('click', async () => {
    const code = button.closest('.doc-code')?.querySelector('code')?.innerText
    if (!code)
      return

    try {
      await navigator.clipboard.writeText(code)
      const original = button.textContent
      button.textContent = '已复制'
      docsToast?.classList.add('is-visible')
      window.setTimeout(() => {
        button.textContent = original
        docsToast?.classList.remove('is-visible')
      }, 1600)
    }
    catch {
      if (docsToast) {
        docsToast.textContent = '复制失败，请手动选择'
        docsToast.classList.add('is-visible')
        window.setTimeout(() => docsToast.classList.remove('is-visible'), 2200)
      }
    }
  })
})

const updateActiveSection = () => {
  const visibleSections = docsSections.filter(section => !section.hidden)
  if (!visibleSections.length)
    return

  const documentHeight = document.documentElement.scrollHeight
  const viewportBottom = window.scrollY + window.innerHeight
  const isAtPageBottom = viewportBottom >= documentHeight - 8
  const readingLine = Math.max(120, window.innerHeight * 0.22)
  const activeSection = isAtPageBottom
    ? visibleSections[visibleSections.length - 1]
    : [...visibleSections]
        .reverse()
        .find(section => section.getBoundingClientRect().top <= readingLine)
      ?? visibleSections[0]
  const hash = `#${activeSection.id}`

  docsNavLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === hash))
}

let activeSectionUpdatePending = false

function scheduleActiveSectionUpdate() {
  if (activeSectionUpdatePending)
    return

  activeSectionUpdatePending = true
  window.requestAnimationFrame(() => {
    updateActiveSection()
    activeSectionUpdatePending = false
  })
}

scheduleActiveSectionUpdate()
window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true })
window.addEventListener('resize', scheduleActiveSectionUpdate)
