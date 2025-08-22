#!/usr/bin/env python3
"""Generate menu bar icons from TunnelForge SVG icon."""

import subprocess
import os
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
SVG_PATH = SCRIPT_DIR / "tunnelforge-icon.svg"
MENUBAR_IMAGESET = SCRIPT_DIR / "TunnelForge/Assets.xcassets/menubar.imageset"

# Menu bar icon sizes (macOS standard)
SIZES = {
    "menubar.png": 16,
    "menubar@2x.png": 32,
    "menubar@3x.png": 48
}

def generate_menubar_icons():
    """Generate menu bar icons from the SVG."""
    
    # Ensure output directory exists
    MENUBAR_IMAGESET.mkdir(parents=True, exist_ok=True)
    
    for filename, size in SIZES.items():
        output_path = MENUBAR_IMAGESET / filename
        
        # For menu bar icons, we want them to be monochrome and simple
        # The SVG will be converted to a template image that macOS can tint
        cmd = [
            "rsvg-convert",
            "-w", str(size),
            "-h", str(size),
            str(SVG_PATH),
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
    print("Generating TunnelForge menu bar icons...")
    if generate_menubar_icons():
        print("\n✅ Menu bar icons generated successfully!")
        print("\nThe icons have been placed in:")
        print(f"  {MENUBAR_IMAGESET}")
        print("\nThe app will use these as template images (monochrome, system-tinted).")
    else:
        print("\n❌ Failed to generate menu bar icons")
        exit(1)
