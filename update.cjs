const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');

const { devDependencies } = require(join(__dirname, 'package.json'));

const board = join(__dirname, 'board.js');

let content = readFileSync(board).toString();

for (const [key, value] of Object.entries(devDependencies)) {
  if (/^@?xterm/.test(key)) {
    const ref = key.split('/').pop().replace(/-/g, '_').toUpperCase();
    const ver = value.replace(/[^0-9.]/g, '');
    content = content.replace(
      new RegExp(`const ${ref} = '.+?';`),
      `const ${ref} = '${ver}';`
    );
  }
}

writeFileSync(board, content);
