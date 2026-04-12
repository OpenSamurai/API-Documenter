import { Node, mergeAttributes } from '@tiptap/core'

const commonAttributes = {
  style: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('style'),
    renderHTML: (attributes: any) => (attributes.style ? { style: attributes.style } : {}),
  },
  class: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('class'),
    renderHTML: (attributes: any) => (attributes.class ? { class: attributes.class } : {}),
  },
  id: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('id'),
    renderHTML: (attributes: any) => (attributes.id ? { id: attributes.id } : {}),
  },
}

// 1. Structural Div (Only contains other blocks)
export const CustomDiv = Node.create({
  name: 'customDiv',
  group: 'block',
  content: 'block*',

  addAttributes() {
    return commonAttributes
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element: HTMLElement) => {
          const className = element.getAttribute('class') || ''
          const style = element.getAttribute('style') || ''
          // Only match if it's a container (no direct text/inline allowed)
          // Also match the Cover Page container which uses flex layout and 85vh height
          const isContainer = className.includes('toc-container') ||
            className.includes('toc-list') ||
            className.includes('toc-folder-group') ||
            className.includes('toc-endpoints-container') ||
            className.includes('toc-title-bar') ||
            style.includes('display: flex') ||
            style.includes('height: 85vh')
          return isContainer ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0]
  },
})

// 2. Content Div (Contains the actual text/links - Inline content only)
export const CustomContentDiv = Node.create({
  name: 'customContentDiv',
  group: 'block',
  content: 'inline*', // This allows span, a, and text

  addAttributes() {
    return commonAttributes
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element: HTMLElement) => {
          const className = element.getAttribute('class') || ''
          // Match if it's a leaf item (contains text/links)
          const isContent = className.includes('toc-folder-item') ||
            className.includes('toc-endpoint-item')
          return isContent ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0]
  },
})
