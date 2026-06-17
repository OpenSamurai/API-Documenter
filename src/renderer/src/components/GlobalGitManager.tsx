import { useEffect } from 'react'
import { useGit } from '@/hooks/useGit'
import { useAppStore } from '@/stores/appStore'

/**
 * GlobalGitManager is a headless component that handles background Git operations 
 * and ensures the global source control state is populated as soon as a project is selected.
 */
export function GlobalGitManager() {
    const { currentProjectId } = useAppStore()
    
    // Initializing useGit at the top level ensures that fetchStatus is called 
    // immediately when currentProjectId changes, populating the global store.
    useGit(currentProjectId)

    return null
}
