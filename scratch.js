const simpleGit = require('simple-git');
async function test() {
  const git = simpleGit(process.cwd());
  const res = await git.show(['HEAD:package.json']);
  console.log(res.substring(0, 50));
}
test();
