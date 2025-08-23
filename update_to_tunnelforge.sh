#!/bin/bash

# Script to update all VibeTunnel references to TunnelForge
# This script will update code, documentation, and configuration files

set -e

echo "==========================================="
echo "Updating VibeTunnel to TunnelForge"
echo "==========================================="

# Check if we're in the right directory
if [ ! -d "mac" ] || [ ! -d "ios" ] || [ ! -d "web" ]; then
    echo "Error: Please run this script from the tunnelforge root directory"
    exit 1
fi

# Function to update files
update_files() {
    local find_pattern="$1"
    local replace_pattern="$2"
    local file_pattern="$3"
    
    echo "Updating: $find_pattern -> $replace_pattern in $file_pattern files..."
    
    # Use find with proper escaping for macOS
    find . -type f -name "$file_pattern" \
        -not -path "./deprecated/*" \
        -not -path "./node_modules/*" \
        -not -path "./dist/*" \
        -not -path "./.git/*" \
        -not -path "./build/*" \
        -not -path "./coverage/*" \
        -not -path "./server/coverage*" \
        -not -path "./server/internal/static/*" \
        -not -path "./web/src.backup*" \
        -not -path "./development/mac/VibeTunnel/*" \
        -not -path "./vibetunnel/*" \
        -exec grep -l "$find_pattern" {} \; | while read -r file; do
        echo "  Updating: $file"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|$find_pattern|$replace_pattern|g" "$file"
        else
            sed -i "s|$find_pattern|$replace_pattern|g" "$file"
        fi
    done
}

echo ""
echo "Step 1: Updating Swift files..."
echo "-------------------------------"
# Update Swift files
find . -name "*.swift" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./build/*" \
    -not -path "./DerivedData/*" \
    -not -path "./ios/VibeTunnelTests/*" \
    -not -path "./development/mac/VibeTunnel/*" \
    -exec grep -l "VibeTunnel" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    fi
done

echo ""
echo "Step 2: Updating TypeScript/JavaScript files..."
echo "------------------------------------------------"
# Update TypeScript and JavaScript files (excluding deprecated and backup dirs)
for ext in "*.ts" "*.tsx" "*.js" "*.jsx"; do
    find . -name "$ext" \
        -not -path "./deprecated/*" \
        -not -path "./node_modules/*" \
        -not -path "./dist/*" \
        -not -path "./build/*" \
        -not -path "./coverage/*" \
        -not -path "./web/src.backup*" \
        -not -path "./server/internal/static/*" \
        -exec grep -l "VibeTunnel\|vibetunnel\|VIBETUNNEL" {} \; | while read -r file; do
        echo "  Updating: $file"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
            sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
            sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
        else
            sed -i 's/VibeTunnel/TunnelForge/g' "$file"
            sed -i 's/vibetunnel/tunnelforge/g' "$file"
            sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
        fi
    done
done

echo ""
echo "Step 3: Updating configuration files..."
echo "----------------------------------------"
# Update xcconfig files
for file in mac/TunnelForge/version.xcconfig ios/TunnelForge/version.xcconfig; do
    if [ -f "$file" ]; then
        echo "  Updating: $file"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's|github.com/johnferguson/vibetunnel|github.com/johnferguson/tunnelforge|g' "$file"
        else
            sed -i 's|github.com/johnferguson/vibetunnel|github.com/johnferguson/tunnelforge|g' "$file"
        fi
    fi
done

echo ""
echo "Step 4: Updating README and documentation..."
echo "---------------------------------------------"
# Update main README
if [ -f "README.md" ]; then
    echo "  Updating: README.md"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "README.md"
        sed -i '' 's/vibetunnel/tunnelforge/g' "README.md"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "README.md"
        sed -i '' 's/amantus-ai/johnferguson/g' "README.md"
        # Update specific URLs and references
        sed -i '' 's|twitter.com/vibetunnel|twitter.com/tunnelforge|g' "README.md"
        sed -i '' 's|discord.gg/vibetunnel|discord.gg/tunnelforge|g' "README.md"
        sed -i '' 's|vibetunnel.sh|tunnelforge.dev|g' "README.md"
        sed -i '' 's|vibe-code|code|g' "README.md"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "README.md"
        sed -i 's/vibetunnel/tunnelforge/g' "README.md"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "README.md"
        sed -i 's/amantus-ai/johnferguson/g' "README.md"
        sed -i 's|twitter.com/vibetunnel|twitter.com/tunnelforge|g' "README.md"
        sed -i 's|discord.gg/vibetunnel|discord.gg/tunnelforge|g' "README.md"
        sed -i 's|vibetunnel.sh|tunnelforge.dev|g' "README.md"
        sed -i 's|vibe-code|code|g' "README.md"
    fi
fi

# Update docs.json
if [ -f "docs.json" ]; then
    echo "  Updating: docs.json"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "docs.json"
        sed -i '' 's/vibetunnel/tunnelforge/g' "docs.json"
        sed -i '' 's/amantus-ai/johnferguson/g' "docs.json"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "docs.json"
        sed -i 's/vibetunnel/tunnelforge/g' "docs.json"
        sed -i 's/amantus-ai/johnferguson/g' "docs.json"
    fi
fi

# Update all markdown files in docs/
find docs -name "*.md" -o -name "*.mdx" | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    fi
done

echo ""
echo "Step 5: Updating shell scripts..."
echo "----------------------------------"
# Update shell scripts
find . -name "*.sh" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./update_to_tunnelforge.sh" \
    -exec grep -l "VibeTunnel\|vibetunnel\|VIBETUNNEL" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    fi
done

echo ""
echo "Step 6: Updating YAML files..."
echo "-------------------------------"
# Update YAML files (GitHub workflows, Docker compose, etc.)
find . -name "*.yml" -o -name "*.yaml" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -exec grep -l "VibeTunnel\|vibetunnel\|VIBETUNNEL" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    fi
done

echo ""
echo "Step 7: Updating package.json files..."
echo "---------------------------------------"
# Update package.json files
find . -name "package.json" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./server/package-bun-migration.json" \
    -exec grep -l "vibetunnel" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/"vibetunnel"/"tunnelforge"/g' "$file"
        sed -i '' 's|"name": "vibetunnel"|"name": "tunnelforge"|g' "$file"
    else
        sed -i 's/"vibetunnel"/"tunnelforge"/g' "$file"
        sed -i 's|"name": "vibetunnel"|"name": "tunnelforge"|g' "$file"
    fi
done

echo ""
echo "Step 8: Updating Go files..."
echo "-----------------------------"
# Update Go files
find . -name "*.go" \
    -not -path "./deprecated/*" \
    -not -path "./vendor/*" \
    -exec grep -l "vibetunnel\|VibeTunnel\|VIBETUNNEL" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    else
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
    fi
done

echo ""
echo "Step 9: Updating other important files..."
echo "-----------------------------------------"
# Update other important files
for file in .gitignore Makefile Dockerfile appcast.xml appcast-prerelease.xml CHANGELOG.md TODO.md AGENT.md AGENTS.md CLAUDE.md; do
    if [ -f "$file" ]; then
        if grep -q "VibeTunnel\|vibetunnel\|VIBETUNNEL" "$file"; then
            echo "  Updating: $file"
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
                sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
                sed -i '' 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
            else
                sed -i 's/VibeTunnel/TunnelForge/g' "$file"
                sed -i 's/vibetunnel/tunnelforge/g' "$file"
                sed -i 's/VIBETUNNEL/TUNNELFORGE/g' "$file"
            fi
        fi
    fi
done

echo ""
echo "Step 10: Renaming files with VibeTunnel in the name..."
echo "-------------------------------------------------------"
# Find and rename files with VibeTunnel in the name
find . -type f -name "*VibeTunnel*" \
    -not -path "./deprecated/*" \
    -not -path "./ios/VibeTunnelTests/*" \
    -not -path "./development/mac/VibeTunnel/*" \
    -not -path "./vibetunnel/*" | while read -r file; do
    newfile=$(echo "$file" | sed 's/VibeTunnel/TunnelForge/g')
    if [ "$file" != "$newfile" ]; then
        echo "  Renaming: $file -> $newfile"
        mv "$file" "$newfile"
    fi
done

# Find and rename files with vibetunnel in the name
find . -type f -name "*vibetunnel*" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./vibetunnel/*" | while read -r file; do
    newfile=$(echo "$file" | sed 's/vibetunnel/tunnelforge/g')
    if [ "$file" != "$newfile" ]; then
        echo "  Renaming: $file -> $newfile"
        mv "$file" "$newfile"
    fi
done

echo ""
echo "Step 11: Updating HTML files..."
echo "--------------------------------"
# Update HTML files
find . -name "*.html" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./build/*" \
    -not -path "./server/internal/static/*" \
    -exec grep -l "VibeTunnel\|vibetunnel" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
    else
        sed -i 's/VibeTunnel/TunnelForge/g' "$file"
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
    fi
done

echo ""
echo "Step 12: Updating CSS files..."
echo "-------------------------------"
# Update CSS files
find . -name "*.css" \
    -not -path "./deprecated/*" \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./build/*" \
    -exec grep -l "vibetunnel" {} \; | while read -r file; do
    echo "  Updating: $file"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/vibetunnel/tunnelforge/g' "$file"
    else
        sed -i 's/vibetunnel/tunnelforge/g' "$file"
    fi
done

echo ""
echo "Step 13: Final verification..."
echo "-------------------------------"
echo "Checking for remaining VibeTunnel references (excluding deprecated and test directories)..."
echo ""

# Check for remaining references
remaining=$(grep -r "VibeTunnel\|vibetunnel\|VIBETUNNEL" . \
    --exclude-dir=deprecated \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=build \
    --exclude-dir=dist \
    --exclude-dir=coverage \
    --exclude-dir=DerivedData \
    --exclude-dir="ios/VibeTunnelTests" \
    --exclude-dir="development/mac/VibeTunnel" \
    --exclude-dir="vibetunnel" \
    --exclude-dir="web/src.backup*" \
    --exclude-dir="server/internal/static" \
    --exclude="*.log" \
    --exclude="*.map" \
    --exclude="update_to_tunnelforge.sh" \
    --exclude="update_branding.sh" \
    2>/dev/null | grep -v "Binary file" | head -20)

if [ -n "$remaining" ]; then
    echo "Found remaining references (first 20):"
    echo "$remaining"
    echo ""
    echo "Note: Some references in test files and historical context may be intentional."
else
    echo "No remaining VibeTunnel references found in active code!"
fi

echo ""
echo "==========================================="
echo "Update complete!"
echo "==========================================="
echo ""
echo "Please review the changes and:"
echo "1. Commit the changes: git add -A && git commit -m 'Update branding from VibeTunnel to TunnelForge'"
echo "2. Test the application to ensure everything works correctly"
echo "3. Update any external references (GitHub repo name, npm package, etc.)"
echo ""
echo "Note: The 'deprecated' and test directories were intentionally not updated."
