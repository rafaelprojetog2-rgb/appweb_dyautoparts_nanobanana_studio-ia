const fs = require('fs');
const files = ['public/src/index.css', 'public/app.js'];
const searchWords = ['btn-exit', 'btn-close', 'X'];

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');
  console.log('--- FILE: ' + file + ' ---');
  searchWords.forEach(word => {
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(word)) {
        console.log((i+1) + ': ' + lines[i].trim().substring(0, 80));
        count++;
        if (count > 5) break;
      }
    }
  });
});
