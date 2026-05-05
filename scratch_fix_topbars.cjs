const fs = require('fs');
const file = 'c:/Users/RAFAEL_COSTA/Desktop/meus_repositores/appweb_dyautoparts_nanobanana_studio-ia/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div class="menu-top-trigger-area"><\/div>\s*<div class="menu-floating-top-actions"[^>]*>\s*<button[^>]*onclick="([^"]+)"[^>]*>[\s\S]*?<\/button>\s*<\/div>/g;

content = content.replace(regex, '${getTopBarHTML(localStorage.getItem(\'currentUser\'), \'$1\')}');

fs.writeFileSync(file, content);
console.log('Done!');
