const header = document.querySelector('[data-header]')
const navToggle = document.querySelector('[data-nav-toggle]')
const navPanel = document.querySelector('[data-nav-panel]')
const toast = document.querySelector('[data-toast]')
const copyButton = document.querySelector('[data-copy]')

const setHeaderState = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 24)
}

setHeaderState()
window.addEventListener('scroll', setHeaderState, { passive: true })

navToggle?.addEventListener('click', () => {
  const isOpen = navPanel?.classList.toggle('is-open') ?? false
  navToggle.setAttribute('aria-expanded', String(isOpen))
})

navPanel?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navPanel.classList.remove('is-open')
    navToggle?.setAttribute('aria-expanded', 'false')
  })
})

copyButton?.addEventListener('click', async () => {
  const text = copyButton.dataset.copy

  if (!text)
    return

  try {
    await navigator.clipboard.writeText(text)
    const label = copyButton.querySelector('span')
    if (label)
      label.textContent = '已复制'

    toast?.classList.add('is-visible')

    window.setTimeout(() => {
      if (label)
        label.textContent = '复制命令'
      toast?.classList.remove('is-visible')
    }, 1800)
  }
  catch {
    if (toast)
      toast.textContent = '复制失败，请手动选择'
    toast?.classList.add('is-visible')
    window.setTimeout(() => toast?.classList.remove('is-visible'), 2400)
  }
})

document.querySelectorAll('[data-doc-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = button.dataset.docCopy

    if (!text)
      return

    try {
      await navigator.clipboard.writeText(text)
      const label = button.querySelector('span')
      const original = label?.textContent
      if (label)
        label.textContent = '已复制'
      if (toast)
        toast.textContent = '快速开始命令已复制'
      toast?.classList.add('is-visible')

      window.setTimeout(() => {
        if (label)
          label.textContent = original
        toast?.classList.remove('is-visible')
      }, 1800)
    }
    catch {
      if (toast)
        toast.textContent = '复制失败，请手动选择'
      toast?.classList.add('is-visible')
      window.setTimeout(() => toast?.classList.remove('is-visible'), 2400)
    }
  })
})

const docTabs = document.querySelectorAll('[data-doc-tab]')
const docPanels = document.querySelectorAll('[data-doc-panel]')

docTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.docTab

    docTabs.forEach((item) => {
      const isActive = item === tab
      item.classList.toggle('is-active', isActive)
      item.setAttribute('aria-selected', String(isActive))
    })

    docPanels.forEach((panel) => {
      const isActive = panel.dataset.docPanel === target
      panel.classList.toggle('is-active', isActive)
      panel.hidden = !isActive
    })
  })
})

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting)
      return

    entry.target.classList.add('is-visible')
    observer.unobserve(entry.target)
  })
}, { threshold: 0.16 })

document.querySelectorAll('.reveal').forEach(element => observer.observe(element))
