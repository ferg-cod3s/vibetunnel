#!/bin/bash

# Script to generate TunnelForge app icons from SVG
# Requires rsvg-convert (install with: brew install librsvg)

echo "🔨 Generating TunnelForge App Icons..."

# Check if rsvg-convert is available
if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ rsvg-convert not found. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install librsvg
    else
        echo "Please install Homebrew first, then run: brew install librsvg"
        exit 1
    fi
fi

# Create output directory
mkdir -p "TunnelForge-Icons"

# Icon sizes for macOS
declare -a sizes=(
    "16"
    "32" 
    "64"
    "128"
    "256"
    "512"
    "1024"
)

# Generate PNG files from SVG
for size in "${sizes[@]}"; do
    echo "Generating ${size}x${size} icon..."
    rsvg-convert -w $size -h $size tunnelforge-icon.svg -o "TunnelForge-Icons/icon_${size}x${size}.png"
    
    # Also generate @2x versions for smaller sizes
    if [ $size -le 512 ]; then
        double_size=$((size * 2))
        echo "Generating ${size}x${size}@2x (${double_size}x${double_size}) icon..."
        rsvg-convert -w $double_size -h $double_size tunnelforge-icon.svg -o "TunnelForge-Icons/icon_${size}x${size}@2x.png"
    fi
done

echo "✅ Icon generation complete!"
echo "📁 Icons saved to: TunnelForge-Icons/"
echo ""
echo "🚀 Next steps:"
echo "1. Open Xcode project"
echo "2. Navigate to TunnelForge/Assets.xcassets/AppIcon.appiconset/"
echo "3. Replace existing icon files with the new ones from TunnelForge-Icons/"
echo "4. Clean and rebuild the project"
echo ""
echo "📋 Required icon files:"
ls -la TunnelForge-Icons/