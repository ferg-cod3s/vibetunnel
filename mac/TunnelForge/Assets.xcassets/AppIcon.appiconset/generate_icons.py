#!/usr/bin/env python3
"""
Generate TunnelForge app icons from SVG source
Requires: pip install pillow cairosvg
"""

import os
import sys
from pathlib import Path

try:
    import cairosvg
    from PIL import Image
except ImportError:
    print("Error: Required packages not installed.")
    print("Please run: pip install pillow cairosvg")
    sys.exit(1)

def generate_icon_sizes():
    """Generate all required macOS app icon sizes from SVG"""
    
    # Icon sizes required for macOS apps
    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_32x32.png"), 
        (32, "icon_32x32 1.png"),  # 2x version of 16x16
        (64, "icon_64x64 1.png"),  # 2x version of 32x32
        (128, "icon_128x128.png"),
        (256, "icon_256x256.png"),
        (256, "icon_256x256 1.png"),  # 2x version of 128x128
        (512, "icon_512x512.png"),
        (512, "icon_512x512 1.png"),  # 2x version of 256x256
        (1024, "icon_1024x1024 1.png"),  # 2x version of 512x512
    ]
    
    script_dir = Path(__file__).parent
    svg_path = script_dir / "tunnelforge-icon.svg"
    
    if not svg_path.exists():
        print(f"Error: SVG file not found at {svg_path}")
        return False
    
    print("Generating TunnelForge app icons...")
    
    for size, filename in sizes:
        output_path = script_dir / filename
        
        try:
            # Convert SVG to PNG at the specified size
            png_data = cairosvg.svg2png(
                url=str(svg_path),
                output_width=size,
                output_height=size
            )
            
            # Save the PNG
            with open(output_path, 'wb') as f:
                f.write(png_data)
            
            print(f"✓ Generated {filename} ({size}x{size})")
            
        except Exception as e:
            print(f"✗ Failed to generate {filename}: {e}")
            return False
    
    print("\n✅ All TunnelForge app icons generated successfully!")
    print("🔨 The new design features:")
    print("   • Deep purple/blue color scheme (distinct from VibeTunnel's green)")
    print("   • Forge anvil and hammer imagery")
    print("   • Terminal tunnel with perspective depth")
    print("   • Code symbols ($, >, |) emerging from tunnel")
    print("   • Metallic golden border and details")
    print("   • Forge fire glow effect")
    
    return True

if __name__ == "__main__":
    success = generate_icon_sizes()
    sys.exit(0 if success else 1)