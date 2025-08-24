const fs = require('fs');
const path = require('path');

try {
  const coveragePath = path.join(__dirname, 'coverage', 'coverage-summary.json');
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  
  console.log('\n📊 TEST COVERAGE REPORT');
  console.log('═'.repeat(60));
  
  const total = coverage.total;
  
  console.log('\n🎯 Overall Coverage:');
  console.log(`  • Lines:      ${total.lines.pct.toFixed(2)}% (${total.lines.covered}/${total.lines.total})`);
  console.log(`  • Statements: ${total.statements.pct.toFixed(2)}% (${total.statements.covered}/${total.statements.total})`);
  console.log(`  • Functions:  ${total.functions.pct.toFixed(2)}% (${total.functions.covered}/${total.functions.total})`);
  console.log(`  • Branches:   ${total.branches.pct.toFixed(2)}% (${total.branches.covered}/${total.branches.total})`);
  
  // Find files with best and worst coverage
  const files = Object.entries(coverage)
    .filter(([key]) => key !== 'total')
    .map(([file, data]) => ({
      file: file.replace(/.*\/src\//, 'src/'),
      lines: data.lines.pct
    }))
    .sort((a, b) => b.lines - a.lines);
  
  console.log('\n✅ Best Coverage (top 5):');
  files.slice(0, 5).forEach(f => {
    console.log(`  • ${f.file}: ${f.lines.toFixed(1)}%`);
  });
  
  console.log('\n⚠️  Needs Improvement (bottom 5):');
  files.slice(-5).reverse().forEach(f => {
    console.log(`  • ${f.file}: ${f.lines.toFixed(1)}%`);
  });
  
  // Coverage assessment
  console.log('\n📈 Coverage Assessment:');
  const lineCoverage = total.lines.pct;
  if (lineCoverage >= 80) {
    console.log('  ✅ Excellent! Coverage meets best practices (≥80%)');
  } else if (lineCoverage >= 60) {
    console.log('  ⚠️  Good, but could be improved (60-79%)');
  } else if (lineCoverage >= 40) {
    console.log('  ⚠️  Fair coverage, significant gaps exist (40-59%)');
  } else {
    console.log('  ❌ Low coverage, needs significant improvement (<40%)');
  }
  
  console.log('\n📁 Coverage Report Location:');
  console.log('  • HTML Report: coverage/index.html');
  console.log('  • LCOV Report: coverage/lcov.info');
  console.log('  • JSON Report: coverage/coverage-final.json');
  
} catch (error) {
  console.error('Error reading coverage data:', error.message);
  console.log('\nPlease run: bun run test:coverage');
}
