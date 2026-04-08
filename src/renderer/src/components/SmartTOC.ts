import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { SmartTOCView } from './SmartTOCView'

export const SmartTOC = Node.create({
  name: 'smartToc',
  group: 'block',
  atom: true, // Non-editable by sub-selection
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'smart-toc',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['smart-toc', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartTOCView)
  },

  addCommands() {
    return {
      insertSmartTOC: () => ({ commands }: any) => {
        return commands.insertContent({ type: this.name })
      },
    } as any
  },
})
