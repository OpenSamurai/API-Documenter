import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { PageBreakView } from './PageBreakView'

export const PageBreak = Node.create({
  name: 'pageBreak',
  priority: 1000,
  group: 'block',
  selectable: true,
  atom: true,

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element: HTMLElement) => {
          const style = element.getAttribute('style') || ''
          return style.includes('page-break-after: always') || style.includes('break-after: page') ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'page-break-node',
        style: 'page-break-after: always; break-after: page;',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView)
  },

  addCommands() {
    return {
      setPageBreak: () => ({ commands }: any) => {
        return commands.insertContent({ type: this.name })
      },
    } as any
  },
})
