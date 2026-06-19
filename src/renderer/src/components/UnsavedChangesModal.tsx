import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { useUpdateApi } from '@/hooks/useApis'
import { db } from '@/db'

export function UnsavedChangesModal({
    onComplete,
    onCancel
}: {
    onComplete: () => void
    onCancel: () => void
}) {
    const apiDrafts = useAppStore(s => s.apiDrafts)
    const updateApi = useUpdateApi()

    const handleSaveAllAndClose = async () => {
        const drafts = useAppStore.getState().apiDrafts
        for (const id of Object.keys(drafts)) {
            const draft = drafts[id]
            await updateApi.mutateAsync({
                id, 
                name: draft.name, description: draft.description, method: draft.method, 
                path: draft.path, urlParams: draft.urlParams, headers: draft.headers,
                bodyType: draft.bodyType, rawType: draft.rawType, formData: draft.formData, 
                urlencoded: draft.urlencoded, requestBody: draft.requestBody,
                responseExamples: draft.responses, version: (draft.version || 0) + 1
            })
            useAppStore.getState().clearApiDraft(id)
        }
        onComplete()
    }

    const handleDiscardAndClose = () => {
        const drafts = useAppStore.getState().apiDrafts
        for (const id of Object.keys(drafts)) {
            useAppStore.getState().clearApiDraft(id)
        }
        onComplete()
    }

    return (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all" onClick={onCancel} style={{ padding: '24px' }}>
            <div
                className="w-full bg-[#0a0a0a] rounded-[16px] shadow-2xl flex flex-col overflow-hidden animate-in scale-in"
                style={{ maxWidth: '440px', border: '1px solid #222' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center shrink-0" style={{ width: '32px', height: '32px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight" style={{ margin: 0 }}>Unsaved Changes</h2>
                    </div>
                    <p className="text-sm text-neutral-400 font-medium leading-relaxed" style={{ margin: 0 }}>
                        You have {Object.keys(apiDrafts).length} endpoint(s) with unsaved changes. Do you want to save them before leaving?
                    </p>
                </div>
                <div className="bg-[#0a0a0a]" style={{ padding: '20px 24px', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onCancel}
                        className="text-[13px] font-bold text-neutral-500 hover:text-white transition-all"
                        style={{ padding: '0 16px', height: '40px' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDiscardAndClose}
                        className="text-[13px] font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        style={{ padding: '0 16px', height: '40px' }}
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleSaveAllAndClose}
                        className="text-[13px] font-bold bg-white text-black hover:bg-neutral-200 rounded-xl transition-all shadow-lg active:scale-[0.98]"
                        style={{ padding: '0 20px', height: '40px' }}
                    >
                        Save All & Close
                    </button>
                </div>
            </div>
        </div>
    )
}
