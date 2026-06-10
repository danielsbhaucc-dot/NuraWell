# Fix all redundant (admin as any) casts
$files = Get-ChildItem -Path 'apps/web' -Recurse -Include '*.ts','*.tsx'
$count = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Replace (admin as any) with just admin
    $content = $content -replace '\(admin as any\)', 'admin'
    
    if ($content -ne $original) {
        Set-Content $file.FullName -NoNewline -Value $content
        $count++
        Write-Output "Modified: $($file.FullName)"
    }
}

Write-Output "Total files modified: $count"
