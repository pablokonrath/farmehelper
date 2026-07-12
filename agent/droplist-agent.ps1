# ============================================================================
#  DropList Agent — monitora o log do Cabal e manda os drops rastreados pro
#  DropList mesmo com o navegador FECHADO. Preencha as 2 linhas abaixo e rode.
# ============================================================================

# 1) Caminho do arquivo de log do jogo (o mesmo que você usa em "Conectar arquivo local"):
$LogPath = "C:\Caminho\Para\Seu\DropList.txt"

# 2) Seu token pessoal (pegue em Alertas -> "Monitorar com o navegador fechado" -> Mostrar token):
$Token = "COLE_SEU_TOKEN_AQUI"

# --- daqui pra baixo não precisa mexer ---
$ApiUrl = "https://farmehelper.pablokonrath.com/api/agent-drops.php"
$IntervalSeconds = 8
$enc = [System.Text.Encoding]::GetEncoding(1252)   # mesma codificação do log do jogo
$dropRegex = '\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]: Dropou: \$\d+#(.+?)\$'

if (-not (Test-Path $LogPath)) {
  Write-Host "ERRO: arquivo de log nao encontrado em: $LogPath" -ForegroundColor Red
  Write-Host "Confira o caminho na variavel `$LogPath e rode de novo."
  Read-Host "Enter para sair"
  exit
}

# Comeca do FIM do arquivo: so drops novos (depois que o agente ligou) sao enviados.
$lastSize = (Get-Item $LogPath).Length
Write-Host "DropList Agent rodando. Monitorando:" -ForegroundColor Green
Write-Host "  $LogPath"
Write-Host "Pode minimizar esta janela. Ctrl+C para parar."

while ($true) {
  try {
    $size = (Get-Item $LogPath).Length
    if ($size -lt $lastSize) { $lastSize = 0 }   # log truncou/reiniciou -> le do inicio
    if ($size -gt $lastSize) {
      $fs = [System.IO.File]::Open($LogPath, 'Open', 'Read', 'ReadWrite')
      $null = $fs.Seek($lastSize, 'Begin')
      $count = $size - $lastSize
      $buf = New-Object byte[] $count
      $read = $fs.Read($buf, 0, $count)
      $fs.Close()
      $lastSize = $size

      $text = $enc.GetString($buf, 0, $read)
      $items = New-Object System.Collections.Generic.List[string]
      foreach ($line in ($text -split "`n")) {
        $m = [regex]::Match($line, $dropRegex)
        if ($m.Success) { $items.Add($m.Groups[1].Value.Trim()) }
      }

      if ($items.Count -gt 0) {
        $payload = @{ token = $Token; items = $items } | ConvertTo-Json -Compress
        # PowerShell 5.1 manda string com a codificacao errada e quebra os acentos (Nucleo,
        # Pocao...), corrompendo o JSON no servidor (dava 401). Envia como bytes UTF-8 pra garantir.
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        try {
          Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 15 | Out-Null
        } catch {
          Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] falha ao enviar: " + $_.Exception.Message) -ForegroundColor Yellow
        }
      }
    }
  } catch {
    Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] erro: " + $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds $IntervalSeconds
}
