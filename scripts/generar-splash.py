# Pantallas de arranque del iPhone para la plataforma instalada como app (Safari →
# Compartir → Agregar a inicio). iOS no las arma solo a partir del manifest: sin ellas, al
# abrir la app se ve un blanco puro mientras carga. Una por tamaño de pantalla; el
# `media` de cada una está en `SPLASH` de app/layout.tsx y tiene que coincidir.
#
#   python3 scripts/generar-splash.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ALBA = (0xF5, 0xEE, 0xE3)
NOCHE = (0x1A, 0x2E, 0x3D)
OCRE = (0xC4, 0x82, 0x2A)

# (ancho CSS, alto CSS, densidad)
PANTALLAS = [
    (440, 956, 3), (430, 932, 3), (428, 926, 3), (402, 874, 3), (393, 852, 3),
    (390, 844, 3), (414, 896, 3), (414, 896, 2), (375, 812, 3), (375, 667, 2),
]

logo = Image.open(RAIZ / "public/icon-512.png").convert("RGBA")
destino = RAIZ / "public/splash"
destino.mkdir(exist_ok=True)

for w, h, r in PANTALLAS:
    W, H = w * r, h * r
    img = Image.new("RGB", (W, H), ALBA)
    lado = int(W * 0.34)
    l = logo.resize((lado, lado), Image.LANCZOS)
    y_logo = int(H * 0.40) - lado // 2
    img.paste(l, ((W - lado) // 2, y_logo), l)

    d = ImageDraw.Draw(img)
    titulo = ImageFont.truetype(str(RAIZ / "lib/fonts/CormorantGaramond-Regular.ttf"), int(26 * r))
    texto = "El Camino con Naty"
    tw = d.textlength(texto, font=titulo)
    y_txt = y_logo + lado + int(22 * r)
    d.text(((W - tw) / 2, y_txt), texto, font=titulo, fill=NOCHE)
    # El filete ocre de la marca, debajo del nombre.
    fw, fy = int(56 * r), y_txt + int(42 * r)
    d.rectangle([(W - fw) // 2, fy, (W + fw) // 2, fy + max(2, int(1.5 * r))], fill=OCRE)

    img.save(destino / f"splash-{W}x{H}.png", optimize=True)
    print(f"splash-{W}x{H}.png")
