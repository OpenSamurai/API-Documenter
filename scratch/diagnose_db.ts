import { db } from './src/renderer/src/db/index.ts';

async function diagnose() {
    const apis = await db.apiCollections.toArray();
    const withProject = apis.filter(a => a.projectId).length;
    const withoutProject = apis.filter(a => !a.projectId).length;
    
    console.log(`Total APIs: ${apis.length}`);
    console.log(`With projectId: ${withProject}`);
    console.log(`Without projectId: ${withoutProject}`);
    
    if (withoutProject > 0) {
        console.log('Sample IDs without projectId:', apis.filter(a => !a.projectId).slice(0, 5).map(a => a.id));
    }
}

diagnose();
