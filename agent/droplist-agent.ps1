# ============================================================================
#  DropList Agent — monitora o log do Cabal e mantém o DropList atualizado
#  mesmo com o navegador FECHADO:
#    - dispara os avisos (Telegram/push) dos drops rastreados na hora;
#    - envia o farme completo pro servidor, pra ver a Visão geral no celular.
#  Preencha as 2 linhas abaixo e rode.
# ============================================================================

# 1) Caminho do arquivo de log do jogo (o mesmo que você usa em "Conectar arquivo local"):
$LogPath = "C:\Caminho\Para\Seu\DropList"

# 2) Seu token pessoal (pegue em Alertas -> "Monitorar com o navegador fechado" -> Mostrar token):
$Token = "COLE_SEU_TOKEN_AQUI"

# --- daqui pra baixo não precisa mexer ---
$Base = "https://farmehelper.pablokonrath.com/api"
$IntervalSeconds = 8         # de quanto em quanto tempo checa drops novos (avisos)
$FarmSyncSeconds = 60        # de quanto em quanto tempo manda o farme completo pro servidor
$enc = [System.Text.Encoding]::GetEncoding(1252)   # mesma codificação do log do jogo
$dropRegex = '\[(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}\]: Dropou: \$\d+#(.+?)\$'

# Agregado do farme: { "AAAA-MM-DD" = @{ "Item" = quantidade } }
$aggregate = @{}
$dirty = $false

function Add-Drops($text, $notifyItems) {
  foreach ($line in ($text -split "`n")) {
    $m = [regex]::Match($line, $dropRegex)
    if ($m.Success) {
      $date = $m.Groups[1].Value
      $item = $m.Groups[2].Value.Trim()
      if ($item -eq '') { continue }
      if ($notifyItems -ne $null) { [void]$notifyItems.Add($item) }
      if (-not $aggregate.ContainsKey($date)) { $aggregate[$date] = @{} }
      if (-not $aggregate[$date].ContainsKey($item)) { $aggregate[$date][$item] = 0 }
      $aggregate[$date][$item]++
      $script:dirty = $true
    }
  }
}

function Send-Json($url, $obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)   # UTF-8 explícito (acentos: Núcleo, Poção)
  Invoke-RestMethod -Uri $url -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 20 | Out-Null
}

if (-not (Test-Path $LogPath)) {
  Write-Host "ERRO: arquivo de log nao encontrado em: $LogPath" -ForegroundColor Red
  Read-Host "Enter para sair"
  exit
}

# Semeia o agregado com o log INTEIRO (últimos ~30 dias que o jogo guarda) e começa a monitorar
# do fim do arquivo (só drops novos disparam aviso).
$full = [System.IO.File]::ReadAllBytes($LogPath)
Add-Drops ($enc.GetString($full)) $null
$lastSize = $full.Length
$lastFarmSync = (Get-Date).AddSeconds(-$FarmSyncSeconds)   # força um primeiro envio já

Write-Host "DropList Agent rodando." -ForegroundColor Green
Write-Host "  Log:   $LogPath"
Write-Host "  Farme: enviando pro servidor a cada $FarmSyncSeconds s"
Write-Host "Pode minimizar esta janela. Ctrl+C para parar."

while ($true) {
  try {
    $size = (Get-Item $LogPath).Length
    if ($size -lt $lastSize) {   # log truncou/reiniciou -> reconstrói do zero
      $aggregate = @{}
      $lastSize = 0
      $script:dirty = $true
    }
    if ($size -gt $lastSize) {
      $fs = [System.IO.File]::Open($LogPath, 'Open', 'Read', 'ReadWrite')
      $null = $fs.Seek($lastSize, 'Begin')
      $count = $size - $lastSize
      $buf = New-Object byte[] $count
      $read = $fs.Read($buf, 0, $count)
      $fs.Close()
      $lastSize = $size

      $notify = New-Object System.Collections.Generic.List[string]
      Add-Drops ($enc.GetString($buf, 0, $read)) $notify

      if ($notify.Count -gt 0) {
        try { Send-Json "$Base/agent-drops.php" @{ token = $Token; items = $notify } }
        catch { Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] falha no aviso: " + $_.Exception.Message) -ForegroundColor Yellow }
      }
    }

    # Manda o farme completo (snapshot) de tempos em tempos, se algo mudou.
    if ($dirty -and ((Get-Date) - $lastFarmSync).TotalSeconds -ge $FarmSyncSeconds) {
      try {
        Send-Json "$Base/farm-drops.php" @{ token = $Token; data = $aggregate }
        $script:dirty = $false
        $lastFarmSync = Get-Date
      } catch { Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] falha no farme: " + $_.Exception.Message) -ForegroundColor Yellow }
    }
  } catch {
    Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] erro: " + $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds $IntervalSeconds
}
