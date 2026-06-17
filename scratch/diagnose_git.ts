import { simpleGit } from 'simple-git';

async function test() {
    const git = simpleGit();
    const status = await git.status();
    console.log(JSON.stringify(status, null, 2));
}

test();
