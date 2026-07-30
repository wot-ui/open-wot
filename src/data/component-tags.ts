import type { ComponentMeta } from '../types'

export const COMPONENT_TAG_MAP: Readonly<Record<string, readonly string[]>> = {
  'avatar': ['wd-avatar', 'wd-avatar-group'],
  'cell': ['wd-cell', 'wd-cell-group'],
  'checkbox': ['wd-checkbox', 'wd-checkbox-group'],
  'collapse': ['wd-collapse', 'wd-collapse-item'],
  'drop-menu': ['wd-drop-menu', 'wd-drop-menu-item'],
  'form': ['wd-form', 'wd-form-item'],
  'grid': ['wd-grid', 'wd-grid-item'],
  'index-bar': ['wd-index-bar', 'wd-index-anchor'],
  'layout': ['wd-row', 'wd-col'],
  'navbar': ['wd-navbar', 'wd-navbar-capsule'],
  'radio': ['wd-radio', 'wd-radio-group'],
  'sidebar': ['wd-sidebar', 'wd-sidebar-item'],
  'steps': ['wd-steps', 'wd-step'],
  'sticky': ['wd-sticky', 'wd-sticky-box'],
  'swipe-action': ['wd-swipe-action', 'wd-swipe-action-item'],
  'swiper': ['wd-swiper', 'wd-swiper-nav'],
  'tabbar': ['wd-tabbar', 'wd-tabbar-item'],
  'table': ['wd-table', 'wd-table-column'],
  'tabs': ['wd-tabs', 'wd-tab'],
}

function getComponentId(tag: string): string {
  return tag.toLowerCase().replace(/^wd-/, '')
}

export function getComponentTags(component: ComponentMeta): string[] {
  const tag = component.tag.toLowerCase()
  return [...new Set([tag, ...(COMPONENT_TAG_MAP[getComponentId(tag)] ?? [])])]
}
