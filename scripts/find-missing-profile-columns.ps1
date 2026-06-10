# Find all ADD COLUMN statements for profiles table in migrations
$migrations = Get-ChildItem -Path 'supabase/migrations' -Filter '*.sql' | Sort-Object Name
foreach ($migration in $migrations) {
    $content = Get-Content $migration.FullName
    $inProfiles = $false
    foreach ($line in $content) {
        if ($line -match 'ALTER TABLE.*profiles' -or $line -match 'profiles.*ADD COLUMN') {
            $inProfiles = $true
        }
        if ($inProfiles -and $line -match 'ADD COLUMN') {
            Write-Output "$($migration.Name): $($line.Trim())"
        }
        if ($inProfiles -and $line -match '\);') {
            $inProfiles = $false
        }
    }
}
