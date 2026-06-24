#!/bin/bash
# Génère des icônes placeholder en PNG via Python (inclus sur macOS)
python3 - << 'EOF'
import struct, zlib, base64

def create_png(size, color=(24, 119, 242)):
    """Crée un PNG simple de taille size x size avec la couleur donnée"""
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        crc = zlib.crc32(name + data) & 0xffffffff
        return c + struct.pack('>I', crc)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))

    # Données image: carré de couleur uniforme avec coins arrondis visuels
    r, g, b = color
    row = b'\x00' + bytes([r, g, b] * size)
    raw = row * size
    compressed = zlib.compress(raw)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')

    return sig + ihdr + idat + iend

import os
os.makedirs('assets', exist_ok=True)

for size in [16, 48, 128]:
    png_data = create_png(size, color=(24, 119, 242))
    with open(f'assets/icon{size}.png', 'wb') as f:
        f.write(png_data)
    print(f'Créé: assets/icon{size}.png ({size}x{size}px)')

print('Icônes générées avec succès!')
EOF
