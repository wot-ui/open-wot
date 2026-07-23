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

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter(entry => entry.isIntersecting && !entry.target.hidden)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

  if (!visible)
    return

  const hash = `#${visible.target.id}`
  docsNavLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === hash))
}, {
  rootMargin: '-18% 0px -70% 0px',
  threshold: [0, 0.1, 0.25],
})

docsSections.forEach(section => sectionObserver.observe(section))
