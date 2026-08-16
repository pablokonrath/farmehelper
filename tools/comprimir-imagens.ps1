# Comprime as imagens de fundo das DGs: PNG -> JPEG qualidade 82, mesmas dimensoes.
#
# (Sem acentos de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI, e ai acento vira lixo e
#  quebra o parse do arquivo inteiro.)
#
# Por que existe: a arte vem em PNG de ~2,5 MB, e PNG guarda foto sem perda -- o que foto nao tem
# como aproveitar. O mesmo 1536x1024 em JPEG fica ~10x menor, e a 42% de opacidade atras de um card
# (ver .card-dg-bg em css/styles.css) a diferenca visual nao existe. Com 42 DGs, a pasta iria pra
# ~100 MB, e isso e banda da Hostinger em toda primeira visita de cada pessoa.
#
# Como usar: jogue os PNGs em uploads/imagens/ e rode, da raiz do projeto:
#     powershell -ExecutionPolicy Bypass -File tools\comprimir-imagens.ps1
#
# O que ele faz: converte todo .png da pasta e move o original pra arte-original/ (que esta no
# .gitignore). Assim uploads/imagens/ fica so com o que vai pro FTP, e o original continua aqui
# caso voce queira reencodar depois com outra qualidade.
#
# Nomes: bg-<primeira-palavra>.jpg resolve a maioria ("bg-solo.jpg" -> Solo Flamejante). Quando o
# prefixo repete -- as 4 DX Premium, os 3 Templos, as 2 Torres -- use o nome inteiro
# ("bg-dx-premium-do-fogo.jpg"), que tem prioridade. Ver dgBackground em js/pages/sessions-page.js.

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz "uploads\imagens"
$originais = Join-Path $raiz "arte-original"
$QUALIDADE = 82

if (-not (Test-Path $destino)) {
  Write-Host "Pasta nao encontrada: $destino" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $originais)) { New-Item -ItemType Directory $originais | Out-Null }

$pngs = @(Get-ChildItem (Join-Path $destino "*.png") -ErrorAction SilentlyContinue)
if ($pngs.Count -eq 0) {
  Write-Host "Nenhum .png novo em uploads\imagens - nada a fazer." -ForegroundColor Yellow
  exit 0
}

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$qp = New-Object System.Drawing.Imaging.EncoderParameters(1)
$qp.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$QUALIDADE)

$totalAntes = 0.0
$totalDepois = 0.0

foreach ($png in $pngs) {
  $jpg = [System.IO.Path]::ChangeExtension($png.FullName, ".jpg")
  $img = [System.Drawing.Image]::FromFile($png.FullName)
  # Desenha sobre fundo preto: PNG com transparencia viraria fundo BRANCO no JPEG (que nao tem
  # canal alfa), e branco atras de um card escuro estoura a tela.
  $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $g.Dispose()
  $img.Dispose()
  $bmp.Save($jpg, $enc, $qp)
  $bmp.Dispose()

  $antes = $png.Length / 1MB
  $depois = (Get-Item $jpg).Length / 1MB
  $totalAntes += $antes
  $totalDepois += $depois
  $pct = (1 - ($depois / $antes)) * 100
  Write-Host ("{0,-34} {1,6:N2} MB -> {2,5:N2} MB   ({3,2:N0}% menor)" -f $png.Name, $antes, $depois, $pct)

  Move-Item $png.FullName (Join-Path $originais $png.Name) -Force
}

Write-Host ""
Write-Host ("Total: {0:N2} MB -> {1:N2} MB" -f $totalAntes, $totalDepois) -ForegroundColor Green
Write-Host "Originais guardados em arte-original\ (fora do repo e do FTP)."
Write-Host "Suba uploads\imagens\ por FTP - so os .jpg estao la agora."
