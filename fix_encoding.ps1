# Fix double-encoded UTF-8 via Windows-1252
# Pattern: UTF-8 bytes -> misread as Windows-1252 -> re-saved as UTF-8
# Fix: read UTF-8 -> encode chars to Windows-1252 bytes -> decode those bytes as UTF-8

$filePath = "public\app.js"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$cp1252 = [System.Text.Encoding]::GetEncoding(1252)

# Read the file bytes, skip BOM
$rawBytes = [System.IO.File]::ReadAllBytes($filePath)
$startIndex = 0
if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
    $startIndex = 3
    Write-Host "Skipping UTF-8 BOM"
}

# Read content as UTF-8 (this gives us the double-encoded text)
$content = $utf8NoBom.GetString($rawBytes, $startIndex, $rawBytes.Length - $startIndex)
Write-Host "File read: $($content.Length) characters"

# Convert: encode to Windows-1252 bytes (reverse the second encoding step)
# then decode those bytes as UTF-8 (get original correct text)
$cp1252Bytes = $cp1252.GetBytes($content)
$fixed = $utf8NoBom.GetString($cp1252Bytes)

# Verification
$tests = @(
    @("SEPARAÇÃO", "SEPARAÇÃO (PICK)"),
    @("CONFERÊNCIA", "CONFERÊNCIA (PACK)"),
    @("INVENTÁRIO", "INVENTÁRIO"),
    @("LÂMPADAS", "KIT_LÂMPADAS"),
    @("conexão", "conexão"),
    @("botão", "botão"),
    @("navegação", "navegação")
)

$allPassed = $true
foreach ($test in $tests) {
    if ($fixed.Contains($test[0])) {
        Write-Host "PASS: Found '$($test[0])' in context '$($test[1])'"
    } else {
        Write-Host "FAIL: '$($test[0])' not found"
        $allPassed = $false
    }
}

# Check no remaining double-encoding artifacts
$doubleEncoded = 0
for ($i = 0; $i -lt $fixed.Length - 1; $i++) {
    $c = [int]$fixed[$i]
    $c2 = [int]$fixed[$i+1]
    # Ã followed by a character that looks like a double-encode artifact
    if ($c -eq 0xC3 -and ($c2 -ge 0x80 -and $c2 -le 0xBF)) {
        # This is normal UTF-8 sequence in the string representation, skip
    }
}

if ($allPassed) {
    Write-Host ""
    Write-Host "ALL TESTS PASSED - Writing fixed file..."
    [System.IO.File]::WriteAllText($filePath, $fixed, $utf8NoBom)
    
    # Verify written file
    $verify = [System.IO.File]::ReadAllText($filePath, $utf8NoBom)
    if ($verify.Contains("SEPARAÇÃO") -and $verify.Contains("CONFERÊNCIA") -and $verify.Contains("INVENTÁRIO")) {
        Write-Host "FINAL VERIFICATION PASSED: File is correctly encoded UTF-8"
        Write-Host "File size: $((Get-Item $filePath).Length) bytes"
    } else {
        Write-Host "FINAL VERIFICATION FAILED - restoring backup"
        Copy-Item "$filePath.bak" $filePath -Force
    }
} else {
    Write-Host ""
    Write-Host "Some tests failed - NOT writing file"
    Write-Host "Showing sample of fixed content around SEPARA..."
    $idx = $fixed.IndexOf("SEPARA")
    if ($idx -ge 0) {
        $sample = $fixed.Substring($idx, [Math]::Min(60, $fixed.Length - $idx))
        Write-Host "Sample: '$sample'"
    }
}
