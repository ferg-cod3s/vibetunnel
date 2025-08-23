#!/usr/bin/env node

/**
 * Generate favicon files from SVG
 * This script converts the TunnelForge SVG icon to various favicon formats
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the SVG file
const svgPath = join(__dirname, '../public/tunnelforge-icon.svg');
const svgContent = readFileSync(svgPath, 'utf8');

// For now, we'll create placeholder PNG files since we don't have a proper SVG->PNG converter
// In a real implementation, you'd use a library like sharp or puppeteer to render the SVG

const sizes = [
  { size: 16, name: 'favicon-16.png' },
  { size: 32, name: 'favicon-32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

console.log('🎨 TunnelForge Favicon Generator');
console.log('Note: This script creates placeholder files. For production, use a proper SVG->PNG converter.');

// Create a simple base64 encoded 1x1 transparent PNG as placeholder
const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

for (const { size, name } of sizes) {
  const outputPath = join(__dirname, '../public', name);
  
  // Write placeholder PNG (in production, you'd render the SVG at the correct size)
  writeFileSync(outputPath, Buffer.from(transparentPng, 'base64'));
  console.log(`✅ Generated ${name} (${size}x${size}px)`);
}

// Create favicon.ico placeholder
const icoPath = join(__dirname, '../public/favicon.ico');
writeFileSync(icoPath, Buffer.from(transparentPng, 'base64'));
console.log('✅ Generated favicon.ico');

console.log('\n📝 Next steps:');
console.log('1. Use a proper SVG->PNG converter to create real favicon files');
console.log('2. Tools like @resvg/resvg-js, sharp, or online converters work well');
console.log('3. The TunnelForge SVG icon is ready at:', svgPath);