/**
 * Utility to map remote snake_case API responses to camelCase frontend types
 * and parse nested JSON strings.
 */

export function mapRemoteFolder(f: any): any {
    if (!f) return f;
    const toIso = (v: any) => {
        if (!v) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toISOString();
    };

    return {
        id: f.id,
        projectId: f.project_id || f.projectId,
        name: f.name,
        description: f.description,
        orderIndex: f.order_index ?? f.orderIndex ?? 0,
        lastSync: toIso(f.last_sync || f.lastSync),
        syncStatus: f.sync_status || f.syncStatus || 'synced',
        createdAt: toIso(f.created_at || f.createdAt || new Date().toISOString()),
        updatedAt: toIso(f.updated_at || f.updatedAt || f.created_at || f.createdAt || new Date().toISOString()),
        role: f.role
    };
}

export function mapRemoteApi(a: any): any {
    if (!a) return a;

    // Robustly parse JSON that might be double-stringified
    const robustParse = (val: any) => {
        if (typeof val !== 'string') return val;
        if (!val || val === 'null' || val === 'undefined') return val;

        let current = val;
        try {
            // Unescape if it's double stringified
            // Example: "\"{\\\"foo\\\":\\\"bar\\\"}\"" -> "{\"foo\":\"bar\"}" -> {foo: "bar"}
            while (typeof current === 'string' &&
                (current.trim().startsWith('{') || current.trim().startsWith('[') || current.trim().startsWith('"'))) {
                const parsed = JSON.parse(current);
                // If it parsed into a different string, keep going
                // If it parsed into an object/array, we're done
                if (typeof parsed === 'string' && parsed === current) break;
                current = parsed;
                if (typeof current !== 'string') break;
            }
        } catch (e) {
            // If it fails to parse at any point, return the last successful result
        }
        return current;
    };

    const asArray = (val: any) => Array.isArray(val) ? val : [];
    const asString = (val: any) => {
        if (typeof val === 'string') return val;
        if (val === null || val === undefined) return '';
        try { return JSON.stringify(val, null, 2); } catch (e) { return String(val); }
    };

    const toIso = (v: any) => {
        if (!v) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toISOString();
    };

    return {
        id: a.id,
        projectId: a.project_id || a.projectId,
        folderId: a.folder_id || a.folderId,
        name: a.name,
        description: a.description,
        method: a.method,
        path: a.path,
        urlParams: asArray(robustParse(a.url_params || a.urlParams || [])),
        headers: asArray(robustParse(a.headers || a.headers || [])),
        bodyType: a.body_type || a.bodyType || 'none',
        rawType: a.raw_type || a.rawType || 'json',
        formData: asArray(robustParse(a.form_data || a.formData || [])),
        urlencoded: asArray(robustParse(a.urlencoded || a.urlencoded || [])),
        requestBody: asString(robustParse(a.request_body || a.requestBody || '')),
        responseExamples: asArray(robustParse(a.response_examples || a.responseExamples || [])),
        version: a.version || 1,
        lastSync: toIso(a.last_sync || a.lastSync),
        syncStatus: a.sync_status || a.syncStatus || 'synced',
        createdAt: toIso(a.created_at || a.createdAt || new Date().toISOString()),
        updatedAt: toIso(a.updated_at || a.updatedAt || a.created_at || a.createdAt || new Date().toISOString())
    };
}
export function mapRemoteEnvironment(e: any): any {
    if (!e) return e;
    const toIso = (v: any) => {
        if (!v) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toISOString();
    };

    return {
        id: e.id,
        projectId: e.project_id || e.projectId,
        folderId: e.folder_id || e.folderId || null,
        name: e.name,
        baseUrl: e.base_url || e.baseUrl || '',
        isGlobal: [1, true, 'true', '1'].includes(e.is_global ?? e.isGlobal),
        variables: e.variables || '{}',
        lastSync: toIso(e.last_sync || e.lastSync),
        syncStatus: 'synced',
        createdAt: toIso(e.created_at || e.createdAt || new Date().toISOString()),
        updatedAt: toIso(e.updated_at || e.updatedAt || e.created_at || e.createdAt || new Date().toISOString())
    };
}
