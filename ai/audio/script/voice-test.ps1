[CmdletBinding()]
param(
    [ValidateSet("List", "Test")]
    [string]$Mode = "List",

    [int]$SpeakerA = 2,
    [int]$SpeakerB = 3,

    [string]$TextA = "こんにちは！こちらはMHN、みほはくんとみあなちゃんのニュースタイム。ボイスチェックです！",
    [string]$TextB = "続いて、こちらもボイスチェックです。ニュースを聞きやすくお届けできるかな？",

    [double]$SpeedA = 1.0,
    [double]$SpeedB = 1.0,
    [double]$PitchA = 0.0,
    [double]$PitchB = 0.0,
    [double]$IntonationA = 1.0,
    [double]$IntonationB = 1.0,
    [double]$VolumeA = 1.0,
    [double]$VolumeB = 1.0
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repository = "marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan"
$WorkflowFile = "mhn-voice-test.yml"
$ApiBase = "https://api.github.com"
$Headers = @{
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$Token = $env:GH_TOKEN
$Bstr = [IntPtr]::Zero

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "GitHub fine-grained token required." -ForegroundColor Yellow
    Write-Host "Required repository permission: Actions = Read and write." -ForegroundColor Yellow
    $SecureToken = Read-Host "GitHub token (input is hidden)" -AsSecureString
    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
    try {
        $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
    }
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "GitHub token was not provided."
}
$Headers.Authorization = "Bearer $Token"

$StartedAt = [DateTimeOffset]::UtcNow
$WorkflowUrl = "$ApiBase/repos/$Repository/actions/workflows/$WorkflowFile"

$Inputs = @{ mode = $Mode.ToLowerInvariant() }
if ($Mode -eq "Test") {
    $Inputs.speaker_a = [string]$SpeakerA
    $Inputs.speaker_b = [string]$SpeakerB
    $Inputs.text_a = $TextA
    $Inputs.text_b = $TextB
    $Inputs.speed_a = [string]$SpeedA
    $Inputs.speed_b = [string]$SpeedB
    $Inputs.pitch_a = [string]$PitchA
    $Inputs.pitch_b = [string]$PitchB
    $Inputs.intonation_a = [string]$IntonationA
    $Inputs.intonation_b = [string]$IntonationB
    $Inputs.volume_a = [string]$VolumeA
    $Inputs.volume_b = [string]$VolumeB
}

$Payload = @{
    ref = "main"
    inputs = $Inputs
} | ConvertTo-Json -Depth 8

try {
    Write-Host "Dispatching MHN Voice Test ($Mode)..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri "$WorkflowUrl/dispatches" -Method Post -Headers $Headers -ContentType "application/json" -Body $Payload | Out-Null
}
catch {
    throw "Workflow dispatch failed. Check the token permission and workflow file. $($_.Exception.Message)"
}

Write-Host "Waiting for GitHub Actions run..." -ForegroundColor Cyan
$Run = $null
for ($i = 0; $i -lt 60 -and -not $Run; $i++) {
    Start-Sleep -Seconds 5
    $Runs = Invoke-RestMethod -Uri "$WorkflowUrl/runs?event=workflow_dispatch&branch=main&per_page=20" -Method Get -Headers $Headers
    $Run = $Runs.workflow_runs |
        Where-Object {
            [DateTimeOffset]::Parse($_.created_at) -ge $StartedAt.AddMinutes(-2)
        } |
        Sort-Object created_at -Descending |
        Select-Object -First 1
}

if (-not $Run) {
    throw "Could not find the workflow run. Open the repository Actions page to inspect it."
}

Write-Host ("Run #{0}: {1}" -f $Run.run_number, $Run.html_url) -ForegroundColor Cyan

for ($i = 0; $i -lt 180; $i++) {
    $Run = Invoke-RestMethod -Uri "$ApiBase/repos/$Repository/actions/runs/$($Run.id)" -Method Get -Headers $Headers
    if ($Run.status -eq "completed") { break }
    Start-Sleep -Seconds 10
}

if ($Run.status -ne "completed") {
    throw "The workflow did not complete within the 30-minute wait limit: $($Run.html_url)"
}
if ($Run.conclusion -ne "success") {
    throw "The workflow finished with conclusion '$($Run.conclusion)'. Details: $($Run.html_url)"
}

$Artifacts = Invoke-RestMethod -Uri "$ApiBase/repos/$Repository/actions/runs/$($Run.id)/artifacts" -Method Get -Headers $Headers
$Artifact = $Artifacts.artifacts | Where-Object { $_.name -eq "mhn-voice-output" } | Select-Object -First 1

if (-not $Artifact) {
    throw "The workflow succeeded but the mhn-voice-output artifact was not found."
}

$AudioRoot = Split-Path -Parent $PSScriptRoot
$OutputDir = Join-Path $AudioRoot "audio"
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$ZipPath = Join-Path $env:TEMP ("mhn-voice-" + $Run.id + ".zip")
$DownloadUrl = "$ApiBase/repos/$Repository/actions/artifacts/$($Artifact.id)/zip"

Write-Host "Downloading generated result..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $DownloadUrl -Method Get -Headers $Headers -OutFile $ZipPath -UseBasicParsing

Expand-Archive -LiteralPath $ZipPath -DestinationPath $OutputDir -Force
Remove-Item -LiteralPath $ZipPath -Force

Write-Host ""
Write-Host "Result saved to: $OutputDir" -ForegroundColor Green

if ($Mode -eq "List") {
    $SpeakerList = Join-Path $OutputDir "speakers.txt"
    if (Test-Path -LiteralPath $SpeakerList) {
        Get-Content -LiteralPath $SpeakerList -Encoding UTF8
        Write-Host ""
        Write-Host "Choose two style IDs above, then run this script with -Mode Test -SpeakerA ID -SpeakerB ID." -ForegroundColor Yellow
    }
}
else {
    $Combined = Join-Path $OutputDir "mhn-voice-test.wav"
    if (Test-Path -LiteralPath $Combined) {
        Write-Host "Playing combined voice test..." -ForegroundColor Green
        try {
            $Player = New-Object System.Media.SoundPlayer
            $Player.SoundLocation = $Combined
            $Player.Load()
            $Player.PlaySync()
            $Player.Dispose()
        }
        catch {
            Write-Warning "Automatic playback failed. Opening the WAV file instead."
            Invoke-Item -LiteralPath $Combined
        }
    }
}

$Token = $null
$Headers.Remove("Authorization")
