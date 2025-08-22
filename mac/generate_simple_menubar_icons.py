#!/usr/bin/env python3
"""Generate simple menu bar icons for TunnelForge."""

import subprocess
import os
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
MENUBAR_IMAGESET = SCRIPT_DIR / "TunnelForge/Assets.xcassets/menubar.imageset"

# Menu bar icon sizes (macOS standard)
SIZES = {
    "menubar.png": 16,
    "menubar@2x.png": 32,
    "menubar@3x.png": 48
}

# Simple SVG for menu bar - just the hammer and terminal shapes, simplified
SIMPLE_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <!-- Simple terminal shape -->
  <rect x="20" y="30" width="60" height="50" rx="4" fill="none" stroke="black" stroke-width="6"/>
  
  <!-- Terminal prompt -->
  <text x="28" y="58" font-family="monospace" font-size="20" font-weight="bold" fill="black">$_</text>
  
  <!-- Simple hammer overlapping -->
  <g transform="rotate(-30 50 50)">
    <!-- Hammer handle -->
    <rect x="48" y="15" width="4" height="35" fill="black"/>
    <!-- Hammer head -->
    <rect x="43" y="10" width="14" height="8" rx="1" fill="black"/>
  </g>
</svg>"""

def generate_simple_menubar_icons():
    """Generate simple menu bar icons."""
    
    # Ensure output directory exists
    MENUBAR_IMAGESET.mkdir(parents=True, exist_ok=True)
    
    # Write the simple SVG to a temporary file
    temp_svg = SCRIPT_DIR / "temp_menubar_icon.svg"
    with open(temp_svg, 'w') as f:
        f.write(SIMPLE_SVG)
    
    for filename, size in SIZES.items():
        output_path = MENUBAR_IMAGESET / filename
        
        # Convert SVG to PNG
        cmd = [
            "rsvg-convert",
            "-w", str(size),
            "-h", str(size),
            str(temp_svg),
            "-o", str(output_path)
        ]
        
        print(f"Generating {filename} ({size}x{size})...")
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            print(f"  ✓ Generated {output_path}")
        except subprocess.CalledProcessError as e:
            print(f"  ✗ Failed to generate {filename}: {e}")
            if e.stderr:
                print(f"    Error: {e.stderr.decode()}")
            return False
    
    # Clean up temp file
    temp_svg.unlink(missing_ok=True)
    
    # Ensure the Contents.json is properly configured for template rendering
    contents_json = MENUBAR_IMAGESET / "Contents.json"
    contents = '''{
  "images" : [
    {
      "filename" : "menubar.png",
      "idiom" : "universal",
      "scale" : "1x"
    },
    {
      "filename" : "menubar@2x.png",
      "idiom" : "universal",
      "scale" : "2x"
    },
    {
      "filename" : "menubar@3x.png",
      "idiom" : "universal",
      "scale" : "3x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  },
  "properties" : {
    "template-rendering-intent" : "template"
  }
}
'''
    
    with open(contents_json, 'w') as f:
        f.write(contents)
    print(f"  ✓ Updated {contents_json}")
    
    return True

if __name__ == "__main__":
    print("Generating simple TunnelForge menu bar icons...")
    if generate_simple_menubar_icons():
        print("\n✅ Simple menu bar icons generated successfully!")
        print("\nThe icons have been placed in:")
        print(f"  {MENUBAR_IMAGESET}")
        print("\nThese are simplified icons optimized for menu bar display.")
    else:
        print("\n❌ Failed to generate menu bar icons")
        exit(1)
