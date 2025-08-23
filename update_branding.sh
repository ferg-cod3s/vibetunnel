#!/bin/bash

# Update all TunnelForge references to TunnelForge in the web directory
echo "Updating TunnelForge references to TunnelForge..."

# Create backup of important files first
echo "Creating backup..."
cp -r web/src web/src.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Update source code files
echo "Updating source code..."
find web/src -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) -exec sed -i '' \
  -e 's/TunnelForge/TunnelForge/g' \
  -e 's/tunnelforge/tunnelforge/g' \
  -e 's/TUNNELFORGE/TUNNELFORGE/g' \
  {} \;

# Update CSS files
echo "Updating CSS files..."
find web/src -type f -name "*.css" -exec sed -i '' \
  -e 's/TunnelForge/TunnelForge/g' \
  -e 's/tunnelforge/tunnelforge/g' \
  {} \;

# Update package.json files
echo "Updating package.json files..."
for file in web/package.json web/package.npm.json web/package.json.bun; do
  if [ -f "$file" ]; then
    sed -i '' \
      -e 's/"name": "tunnelforge"/"name": "tunnelforge"/g' \
      -e 's/TunnelForge/TunnelForge/g' \
      -e 's/tunnelforge/tunnelforge/g' \
      "$file"
  fi
done

# Update documentation
echo "Updating documentation..."
find web/docs -type f -name "*.md" -exec sed -i '' \
  -e 's/TunnelForge/TunnelForge/g' \
  -e 's/tunnelforge/tunnelforge/g' \
  -e 's/TUNNELFORGE/TUNNELFORGE/g' \
  {} \;

# Update README
echo "Updating README..."
if [ -f "web/README.md" ]; then
  sed -i '' \
    -e 's/TunnelForge/TunnelForge/g' \
    -e 's/tunnelforge/tunnelforge/g' \
    "web/README.md"
fi

# Update scripts
echo "Updating scripts..."
find web/scripts -type f \( -name "*.js" -o -name "*.sh" \) -exec sed -i '' \
  -e 's/TunnelForge/TunnelForge/g' \
  -e 's/tunnelforge/tunnelforge/g' \
  -e 's/TUNNELFORGE/TUNNELFORGE/g' \
  {} \;

# Update binary files and scripts in bin/
echo "Updating bin directory..."
if [ -d "web/bin" ]; then
  # Rename tunnelforge binary to tunnelforge
  if [ -f "web/bin/tunnelforge" ]; then
    mv web/bin/tunnelforge web/bin/tunnelforge
  fi
  
  # Update vt script
  if [ -f "web/bin/vt" ]; then
    sed -i '' \
      -e 's/TunnelForge/TunnelForge/g' \
      -e 's/tunnelforge/tunnelforge/g' \
      -e 's/TUNNELFORGE/TUNNELFORGE/g' \
      "web/bin/vt"
  fi
fi

# Update shell scripts
echo "Updating shell scripts..."
for file in web/*.sh; do
  if [ -f "$file" ]; then
    sed -i '' \
      -e 's/TunnelForge/TunnelForge/g' \
      -e 's/tunnelforge/tunnelforge/g' \
      -e 's/TUNNELFORGE/TUNNELFORGE/g' \
      "$file"
  fi
done

# Rename start-tunnelforge.sh to start-tunnelforge.sh
if [ -f "web/start-tunnelforge.sh" ]; then
  mv web/start-tunnelforge.sh web/start-tunnelforge.sh
fi

# Update Docker files
echo "Updating Docker files..."
find web -name "Dockerfile*" -exec sed -i '' \
  -e 's/TunnelForge/TunnelForge/g' \
  -e 's/tunnelforge/tunnelforge/g' \
  {} \;

# Update docker-compose.yml
if [ -f "web/docker-compose.yml" ]; then
  sed -i '' \
    -e 's/tunnelforge/tunnelforge/g' \
    "web/docker-compose.yml"
fi

# Update .gitignore
echo "Updating .gitignore..."
if [ -f "web/.gitignore" ]; then
  sed -i '' \
    -e 's/tunnelforge/tunnelforge/g' \
    "web/.gitignore"
fi

# Update .npmrc
echo "Updating .npmrc..."
if [ -f "web/.npmrc" ]; then
  sed -i '' \
    -e 's/@tunnelforge/@tunnelforge/g' \
    "web/.npmrc"
fi

echo "Branding update complete!"
echo ""
echo "Note: The following manual steps are still required:"
echo "1. Rebuild the web bundles: cd web && npm run build"
echo "2. Rebuild the macOS app"
echo "3. Test all functionality"
echo "4. Update any external references or documentation"
echo ""
echo "Backup created in web/src.backup.*"
