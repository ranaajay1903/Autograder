# Fix Java Runtime on Windows
# Run this with: powershell -ExecutionPolicy Bypass -File fix-java.ps1

Write-Host "🔍 Finding Java installation..." -ForegroundColor Green

# Function to find JDK
function Find-JDK {
    $possiblePaths = @(
        "C:\Program Files\jdk-21*",
        "C:\Program Files\openjdk*",
        "C:\Program Files (x86)\jdk*",
        "C:\Program Files\Java\jdk*"
    )
    
    foreach ($pattern in $possiblePaths) {
        $found = Get-Item $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }
    
    return $null
}

$javaHome = Find-JDK

if ($javaHome) {
    Write-Host "✓ Found Java at: $javaHome" -ForegroundColor Green
    
    # Set environment variables
    Write-Host "📝 Setting JAVA_HOME..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
    
    Write-Host "📝 Updating PATH..." -ForegroundColor Yellow
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    $newPath = "$javaHome\bin;$currentPath"
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    
    Write-Host "✅ Environment variables updated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  Important: You must RESTART PowerShell for changes to take effect" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Steps:" -ForegroundColor Cyan
    Write-Host "  1. Close this PowerShell window"
    Write-Host "  2. Open a NEW PowerShell window"
    Write-Host "  3. Run: java -version"
    Write-Host "  4. Run: javac -version"
    Write-Host ""
    
} else {
    Write-Host "❌ Java installation not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Java from: https://www.oracle.com/java/technologies/downloads/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or if Java is installed in a non-standard location:" -ForegroundColor Yellow
    Write-Host "  Set JAVA_HOME manually to the JDK installation directory"
    Write-Host ""
    Write-Host "Then run this script again"
}
