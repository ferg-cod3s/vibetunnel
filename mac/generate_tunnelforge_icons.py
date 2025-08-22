#!/usr/bin/env python3
"""
Generate TunnelForge app icons from SVG
"""

import os
import subprocess
import json
from pathlib import Path

# Icon sizes required for macOS app icon
ICON_SIZES = [
    (16, 1), (16, 2),     # 16pt @1x, @2x
    (32, 1), (32, 2),     # 32pt @1x, @2x
    (128, 1), (128, 2),   # 128pt @1x, @2x
    (256, 1), (256, 2),   # 256pt @1x, @2x
    (512, 1), (512, 2),   # 512pt @1x, @2x
]

def generate_icons():
    # Paths
    script_dir = Path(__file__).parent
    svg_path = script_dir / "TunnelForge-Icon.svg"
    iconset_dir = script_dir / "TunnelForge.iconset"
    assets_dir = script_dir / "TunnelForge" / "Assets.xcassets" / "AppIcon.appiconset"
    
    # Create directories
    iconset_dir.mkdir(exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate PNG files for iconset
    print("Generating icon files...")
    for size, scale in ICON_SIZES:
        actual_size = size * scale
        suffix = f"@{scale}x" if scale > 1 else ""
        filename = f"icon_{size}x{size}{suffix}.png"
        output_path = iconset_dir / filename
        
        # Use rsvg-convert to convert SVG to PNG
        cmd = [
            "rsvg-convert",
            "-w", str(actual_size),
            "-h", str(actual_size),
            str(svg_path),
            "-o", str(output_path)
        ]
        
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            print(f"  Generated {filename} ({actual_size}x{actual_size})")
        except subprocess.CalledProcessError as e:
            print(f"  Error generating {filename}: {e}")
            # Try with sips as fallback (first generate a large PNG)
            temp_png = iconset_dir / "temp_large.png"
            subprocess.run([
                "rsvg-convert",
                "-w", "1024",
                "-h", "1024", 
                str(svg_path),
                "-o", str(temp_png)
            ], check=True)
            # Then resize with sips
            subprocess.run([
                "sips", "-z", str(actual_size), str(actual_size),
                str(temp_png), "--out", str(output_path)
            ], check=True)
            temp_png.unlink()
            print(f"  Generated {filename} ({actual_size}x{actual_size}) using sips")
    
    # Create ICNS file
    print("\nCreating ICNS file...")
    icns_path = script_dir / "TunnelForge.icns"
    subprocess.run([
        "iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)
    ], check=True)
    print(f"Created {icns_path}")
    
    # Copy to Assets.xcassets
    print("\nCopying to Assets.xcassets...")
    
    # Contents.json for AppIcon
    contents = {
        "images": [],
        "info": {
            "author": "xcode",
            "version": 1
        }
    }
    
    # Add icon entries
    for size, scale in ICON_SIZES:
        suffix = f"@{scale}x" if scale > 1 else ""
        filename = f"icon_{size}x{size}{suffix}.png"
        
        # Copy file to assets
        src = iconset_dir / filename
        dst = assets_dir / filename
        if src.exists():
            subprocess.run(["cp", str(src), str(dst)], check=True)
            
            # Add to Contents.json
            contents["images"].append({
                "filename": filename,
                "idiom": "mac",
                "scale": f"{scale}x",
                "size": f"{size}x{size}"
            })
    
    # Write Contents.json
    contents_path = assets_dir / "Contents.json"
    with open(contents_path, "w") as f:
        json.dump(contents, f, indent=2)
    print(f"Updated {contents_path}")
    
    # Clean up iconset directory
    print("\nCleaning up...")
    subprocess.run(["rm", "-rf", str(iconset_dir)], check=True)
    
    print("\n✅ Icon generation complete!")
    print(f"ICNS file: {icns_path}")
    print(f"Asset catalog: {assets_dir}")

if __name__ == "__main__":
    # Check for required tools
    try:
        subprocess.run(["which", "rsvg-convert"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("Error: rsvg-convert not found. Install with: brew install librsvg")
        exit(1)
    
    try:
        subprocess.run(["which", "iconutil"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        print("Error: iconutil not found. This tool is part of macOS.")
        exit(1)
    
    generate_icons()
