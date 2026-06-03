/**
 * Manual Browser Test for Extension
 * Copy-paste this into browser console on any job application page
 */

(function() {
  'use strict';
  
  const TEST = {
    results: [],
    
    log(test, status, msg) {
      this.results.push({ test, status, msg, time: Date.now() });
      const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
      console.log(`${icon} [${test}] ${msg}`);
    },
    
    async runAll() {
      console.log('\n🔍 JobFitly Extension Diagnostic Test\n');
      
      // Test 1: Content script loaded
      if (window.PortalEngine) {
        this.log('PORTAL_ENGINE', 'PASS', 'PortalEngine detected');
      } else {
        this.log('PORTAL_ENGINE', 'FAIL', 'PortalEngine NOT found - reload extension');
        return;
      }
      
      // Test 2: Portal detection
      const portal = window.PortalEngine.detect();
      if (portal) {
        this.log('PORTAL_DETECT', 'PASS', `Detected: ${portal}`);
      } else {
        this.log('PORTAL_DETECT', 'FAIL', 'No portal detected');
      }
      
      // Test 3: Field scraping
      try {
        const fields = await window.PortalEngine.scrape();
        this.log('SCRAPING', 'PASS', `Found ${fields.length} fields`);
        
        if (fields.length > 0) {
          console.log('   Fields found:', fields.map(f => f.label).join(', '));
        }
      } catch (err) {
        this.log('SCRAPING', 'FAIL', err.message);
      }
      
      // Test 4: Check for save indicator elements
      setTimeout(() => {
        const inputs = document.querySelectorAll('input, textarea, select');
        let listenersAttached = 0;
        
        inputs.forEach(input => {
          // Check if blur listener exists (simplified check)
          const hasListener = input._hasJobfitlyListener || 
                             input.getAttribute('data-jobfitly-initialized');
          if (hasListener) listenersAttached++;
        });
        
        this.log('BLUR_LISTENERS', listenersAttached > 0 ? 'PASS' : 'WARN', 
                 `${listenersAttached}/${inputs.length} inputs have listeners`);
      }, 1000);
      
      // Test 5: Profile ID check
      const profileId = localStorage.getItem('jobfitcheck_profile_id');
      if (profileId) {
        this.log('PROFILE_ID', 'PASS', `Found: ${profileId.substring(0, 8)}...`);
      } else {
        this.log('PROFILE_ID', 'FAIL', 'No profile ID - upload resume first');
      }
      
      // Test 6: Backend connectivity
      try {
        const res = await fetch('http://localhost:3000/api/health', { 
          method: 'GET',
          mode: 'no-cors' // CORS might block, but we can check if server responds
        });
        this.log('BACKEND', 'PASS', 'Backend reachable');
      } catch {
        this.log('BACKEND', 'FAIL', 'Backend not reachable at localhost:3000');
      }
      
      // Summary after 3 seconds
      setTimeout(() => this.printSummary(), 3000);
    },
    
    printSummary() {
      const passed = this.results.filter(r => r.status === 'PASS').length;
      const failed = this.results.filter(r => r.status === 'FAIL').length;
      
      console.log('\n═══════════════ TEST SUMMARY ═══════════════\n');
      console.log(`Passed: ${passed} | Failed: ${failed} | Total: ${this.results.length}`);
      
      if (failed === 0) {
        console.log('\n✅ All checks passed! Extension is working.');
      } else {
        console.log('\n⚠️  Some checks failed. Review errors above.');
        console.log('\nCommon fixes:');
        console.log('  1. Reload extension from chrome://extensions');
        console.log('  2. Ensure backend is running: cd backend && npm run dev');
        console.log('  3. Upload resume to get profile ID');
        console.log('  4. Check console for detailed errors');
      }
      
      return { passed, failed, results: this.results };
    }
  };
  
  // Run tests
  window.JobFitlyTest = TEST;
  TEST.runAll();
  
})();
