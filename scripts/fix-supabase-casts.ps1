# Fix all redundant (supabase as any) casts
$files = Get-ChildItem -Path 'apps/web' -Recurse -Include '*.ts','*.tsx'
$count = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Replace (supabase as any) with just supabase
    $content = $content -replace '\(supabase as any\)', 'supabase'
    # Replace (params.supabase as any) with just params.supabase
    $content = $content -replace '\(params\.supabase as any\)', 'params.supabase'
    
    if ($content -ne $original) {
        Set-Content $file.FullName -NoNewline -Value $content
        $count++
        Write-Output "Modified: $($file.FullName)"
    }
}

Write-Output "Total files modified: $count"
