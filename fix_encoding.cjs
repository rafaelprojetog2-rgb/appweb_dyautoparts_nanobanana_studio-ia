// Fix double-encoded UTF-8 in app.js using Node.js Buffer
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'app.js');
const backupPath = filePath + '.bak';

// Read raw bytes
const buf = fs.readFileSync(filePath);
console.log('File size:', buf.length, 'bytes');
console.log('First 3 bytes (BOM check):', buf[0].toString(16), buf[1].toString(16), buf[2].toString(16));

// Skip BOM if present
let start = 0;
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    start = 3;
    console.log('Skipping UTF-8 BOM');
}

const content = buf.slice(start);

// The file has been double-encoded: original UTF-8 was read as cp1252, then saved as UTF-8
// To fix, we need to reverse: take each UTF-8 decoded char, get its cp1252 byte value, 
// then interpret the resulting byte stream as UTF-8

// Build Windows-1252 decode table (char -> byte)
// Characters in 0x80-0x9F range that differ from Latin-1
const cp1252_special = {
    0x20AC: 0x80, // €
    0x201A: 0x82, // ‚
    0x0192: 0x83, // ƒ
    0x201E: 0x84, // „
    0x2026: 0x85, // …
    0x2020: 0x86, // †
    0x2021: 0x87, // ‡
    0x02C6: 0x88, // ˆ
    0x2030: 0x89, // ‰
    0x0160: 0x8A, // Š
    0x2039: 0x8B, // ‹
    0x0152: 0x8C, // Œ
    0x017D: 0x8E, // Ž
    0x2018: 0x91, // '
    0x2019: 0x92, // '
    0x201C: 0x93, // "
    0x201D: 0x94, // "
    0x2022: 0x95, // •
    0x2013: 0x96, // –
    0x2014: 0x97, // —
    0x02DC: 0x98, // ˜
    0x2122: 0x99, // ™
    0x0161: 0x9A, // š
    0x203A: 0x9B, // ›
    0x0153: 0x9C, // œ
    0x017E: 0x9E, // ž
    0x0178: 0x9F, // Ÿ
};

// Read as UTF-8 string
const text = content.toString('utf8');
console.log('Text length:', text.length, 'characters');

// Convert each character back to its cp1252 byte value
const resultBytes = [];
for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    
    if (code < 0x80) {
        // ASCII - direct
        resultBytes.push(code);
    } else if (code <= 0xFF && !(code >= 0x80 && code <= 0x9F)) {
        // Latin-1 range (but not the 0x80-0x9F gap) - direct
        resultBytes.push(code);
    } else if (cp1252_special[code] !== undefined) {
        // Windows-1252 special characters in 0x80-0x9F range
        resultBytes.push(cp1252_special[code]);
    } else if (code >= 0x80 && code <= 0x9F) {
        // Control chars in 0x80-0x9F that aren't mapped in cp1252
        // These shouldn't appear, but keep them as-is
        resultBytes.push(code);
    } else {
        // Characters above 0xFF can't be in cp1252
        // This means they weren't part of the double-encoding, keep as UTF-8
        const charBuf = Buffer.from(text[i], 'utf8');
        for (const b of charBuf) {
            resultBytes.push(b);
        }
    }
}

const fixedBuf = Buffer.from(resultBytes);
const fixedText = fixedBuf.toString('utf8');

// Test
const tests = [
    'SEPARAÇÃO',
    'CONFERÊNCIA', 
    'INVENTÁRIO',
    'LÂMPADAS',
    'conexão',
    'botão',
    'navegação'
];

let allPassed = true;
for (const test of tests) {
    if (fixedText.includes(test)) {
        console.log(`PASS: Found '${test}'`);
    } else {
        console.log(`FAIL: '${test}' not found`);
        allPassed = false;
        
        // Debug: find the closest match
        const base = test.replace(/[^\x00-\x7F]/g, '');
        if (base.length > 2) {
            const idx = fixedText.indexOf(base);
            if (idx >= 0) {
                const sample = fixedText.substring(idx, idx + test.length + 10);
                console.log(`  Context: '${sample}'`);
                // Show bytes
                const sampleBuf = Buffer.from(sample, 'utf8');
                console.log(`  Bytes: ${Array.from(sampleBuf.slice(0, 30)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            }
        }
    }
}

if (allPassed) {
    console.log('\nALL TESTS PASSED - Writing fixed file...');
    // Write without BOM
    fs.writeFileSync(filePath, fixedText, 'utf8');
    console.log('File written successfully');
    
    // Verify
    const verify = fs.readFileSync(filePath, 'utf8');
    if (verify.includes('SEPARAÇÃO') && verify.includes('CONFERÊNCIA') && verify.includes('INVENTÁRIO')) {
        console.log('VERIFICATION PASSED');
    }
} else {
    console.log('\nSome tests FAILED');
}
